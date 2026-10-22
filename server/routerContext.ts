import type {ClientSession} from 'mongodb';
import {rows} from './db';
import {currentUser} from './auth';
import {conversationPage} from './operations';
import {messageInput,routerConversationInput,historyText} from './sessionContext';
import {inputMessages,type RouterMessage} from './openRouter';
import type {RunRecord} from './runTypes';
import {artifactHistoryText} from './artifactDelivery';

interface RouterThread {_id:string;generation:number;origin?:string;messages:RouterMessage[];through:string;updatedAt:string}
const sourceFields = new Set(['bodyHtml','data','dataPatches','refreshInstruction']);
/** Artifact source is available on demand, rather than replayed on every turn. */
function compactArtifactRecord(value:unknown):unknown {
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 const record=value as Record<string,unknown>;
 // The MCP/execute envelope's data is the result, not the artifact's dataset.
 if('ok' in record&&'data' in record)return {...record,data:compactArtifactRecord(record.data)};
 let omitted=false;
 const result:Record<string,unknown>={};
 for(const [key,item] of Object.entries(record)){
  if(sourceFields.has(key)){omitted=true;continue;}
  if(key==='source'&&item&&typeof item==='object'){
   const {content,...source}=item as Record<string,unknown>;result.source=source;omitted ||= content!==undefined;
  }else result[key]=item;
 }
 return {...result,...(omitted?{artifactContentOmitted:true}:{})};
}
function artifactCall(name:string,args:unknown){
 if(!['newdrugs_read','newdrugs_execute'].includes(name)||!args||typeof args!=='object')return undefined;
 const input=args as {operation?:unknown;input?:unknown};
 return typeof input.operation==='string'&&input.operation.startsWith('artifacts.')?{...input,input:compactArtifactRecord(input.input)}:undefined;
}
function parseArtifactCall(name:string,args:string){try{return artifactCall(name,JSON.parse(args));}catch{return undefined;}}
function compactArtifactResult(content:unknown){
 if(typeof content!=='string')return compactArtifactRecord(content);
 try{return JSON.stringify(compactArtifactRecord(JSON.parse(content)));}catch{return content;}
}
/** Retain completed tool exchanges, but never replay prefix-bound reasoning into
 * a new run, and never keep raw image bytes in the durable conversation cache. */
export function completedRouterHistory(messages:RouterMessage[]):RouterMessage[]{
 const artifactCalls=new Set<string>();
 for(const message of messages){
  for(const call of message.tool_calls||[])if(parseArtifactCall(call.function.name,call.function.arguments))artifactCalls.add(call.id);
  for(const block of message.native_content||[])if(block.type==='tool_use'&&artifactCall(block.name,block.input))artifactCalls.add(block.id);
  for(const item of message.response_items||[])if(item.type==='function_call'&&parseArtifactCall(item.name,item.arguments))artifactCalls.add(item.call_id);
 }
 return messages.filter(message=>message.role!=='system').map(({reasoning_details,annotations,native_content,response_items,...message})=>({
  ...message,
  ...(message.tool_calls?{tool_calls:message.tool_calls.map(call=>{const input=parseArtifactCall(call.function.name,call.function.arguments);return input?{...call,function:{...call.function,arguments:JSON.stringify(input)}}:call;})}:{}),
  ...(native_content?{native_content:native_content.filter(block=>!['thinking','redacted_thinking'].includes(block.type)).map(block=>{
   if(block.type==='image')return {type:'text',text:'An image was inspected here. Re-read its referenced file if its pixels are needed.'};
   if(block.type==='tool_use'){const input=artifactCall(block.name,block.input);if(input)return {...block,input};}
   if(block.type==='tool_result'&&artifactCalls.has(block.tool_use_id))return {...block,content:compactArtifactResult(block.content)};
   return block;
  })}:{}),
  ...(response_items?{response_items:response_items.map(item=>{
   if(item.type==='function_call'){const input=parseArtifactCall(item.name,item.arguments);if(input)return {...item,arguments:JSON.stringify(input)};}
   if(item.type==='function_call_output'&&artifactCalls.has(item.call_id))return {...item,output:compactArtifactResult(item.output)};
   return item;
  })}:{}),
  content:message.role==='tool'&&message.tool_call_id&&artifactCalls.has(message.tool_call_id)?compactArtifactResult(message.content):Array.isArray(message.content)?message.content.map(part=>part.type==='image_url'?{type:'text',text:'An image was inspected here. Re-read its referenced file or regenerate its preview if its pixels are needed.'}:part):message.content,
 }));
}
export async function routerThreadInput(run:RunRecord):Promise<RouterMessage[]>{
 if(run.purpose==='automation')return routerConversationInput(run);
 const owner=await currentUser(run.userId),saved=await rows<RouterThread>('routerThreads').findOne({_id:run.userId,generation:owner.chatGeneration||0});
 if(!saved)return routerConversationInput(run);
 if(saved.origin&&saved.origin!==`${run.agentModel?.provider}:${run.agentModel?.id}`)return routerConversationInput(run);
 // Bound the catch-up read. External append traffic may add messages between
 // browser turns; missing older pages stay explicitly retrievable, not hidden.
 let added:RouterMessage[]=[];
 try{const page=await conversationPage(run.userId,100,undefined,undefined,saved.through);added=page.items.filter(message=>message.id!==`${run._id}:user`).map(message=>({role:message.role,content:historyText(message)}));if(page.nextCursor)added.push({role:'user',content:`Host history notice: more intervening messages can be retrieved through conversation.list after ${page.nextCursor}. The latest request follows.`});}
 catch(error){if((error as {code?:string}).code!=='not_found')throw error;return routerConversationInput(run);}
 return [...completedRouterHistory(saved.messages),...added,...inputMessages([await messageInput(run)]).map(message=>({...message,context_kind:'request' as const}))];
}
/** Called inside finishRun's fenced transaction, beside the visible response. */
export async function commitRouterThread(run:RunRecord,session:ClientSession){
 if(!run.agentModel||run.purpose==='automation'||run.superseded||run.cancelRequested)return;
 const state=await rows<{_id:string;messages:RouterMessage[]}>('routerStates').findOne({_id:run._id},{session});if(!state)return;
 const messages=completedRouterHistory(state.messages);
 if(run.artifacts?.length){
  const content=artifactHistoryText(run.artifacts).trimStart(),last=messages.at(-1);
  // An artifact-only answer may end with an empty provider message. Replace
  // that shell so Messages never receives an empty assistant content array.
  if(last?.role==='assistant'&&!last.content&&!last.tool_calls?.length&&!last.response_items?.length&&(!last.native_content?.length||last.native_content.every(block=>block.type==='text'&&!block.text)))messages[messages.length-1]={role:'assistant',content};
  else messages.push({role:'assistant',content});
 }
 if(Buffer.byteLength(JSON.stringify(messages))>8*1024*1024)throw Error('Conversation cache exceeded its bounded size.');
 const owner=await rows('users').findOne({_id:run.userId},{session,projection:{chatGeneration:1}});
 await rows<RouterThread>('routerThreads').replaceOne({_id:run.userId},{generation:Number(owner?.chatGeneration||0),origin:`${run.agentModel.provider}:${run.agentModel.id}`,messages,through:`${run._id}:assistant`,updatedAt:new Date().toISOString()},{session,upsert:true});
}
