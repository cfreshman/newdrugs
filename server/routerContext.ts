import type {ClientSession} from 'mongodb';
import {rows} from './db';
import {currentUser} from './auth';
import {conversationPage} from './operations';
import {messageInput,routerConversationInput} from './sessionContext';
import {inputMessages,type RouterMessage} from './openRouter';
import type {RunRecord} from './runTypes';

interface RouterThread {_id:string;generation:number;origin?:string;messages:RouterMessage[];through:string;updatedAt:string}
/** Retain completed tool exchanges, but never replay prefix-bound reasoning into
 * a new run, and never keep raw image bytes in the durable conversation cache. */
export function completedRouterHistory(messages:RouterMessage[]):RouterMessage[]{
 return messages.filter(message=>message.role!=='system').map(({reasoning_details,annotations,native_content,...message})=>({...message,...(native_content?{native_content:native_content.filter(block=>!['thinking','redacted_thinking'].includes(block.type)).map(block=>block.type==='image'?{type:'text',text:'An image was inspected here. Re-read its referenced file if its pixels are needed.'}:block)}:{}),content:Array.isArray(message.content)?message.content.map(part=>part.type==='image_url'?{type:'text',text:'An image was inspected here. Re-read its referenced file or regenerate its preview if its pixels are needed.'}:part):message.content}));
}
export async function routerThreadInput(run:RunRecord):Promise<RouterMessage[]>{
 if(run.purpose==='automation')return routerConversationInput(run);
 const owner=await currentUser(run.userId),saved=await rows<RouterThread>('routerThreads').findOne({_id:run.userId,generation:owner.chatGeneration||0});
 if(!saved)return routerConversationInput(run);
 if(saved.origin&&saved.origin!==`${run.agentModel?.provider}:${run.agentModel?.id}`)return routerConversationInput(run);
 // Bound the catch-up read. External append traffic may add messages between
 // browser turns; missing older pages stay explicitly retrievable, not hidden.
 let added:RouterMessage[]=[];
 try{const page=await conversationPage(run.userId,100,undefined,undefined,saved.through);added=page.items.filter(message=>message.id!==`${run._id}:user`).map(message=>({role:message.role,content:message.text+(message.files?.length?`\nAttached file metadata: ${JSON.stringify(message.files)}`:'')}));if(page.nextCursor)added.push({role:'user',content:`Host history notice: more intervening messages can be retrieved through conversation.list after ${page.nextCursor}. The latest request follows.`});}
 catch(error){if((error as {code?:string}).code!=='not_found')throw error;return routerConversationInput(run);}
 return [...completedRouterHistory(saved.messages),...added,...inputMessages([await messageInput(run)]).map(message=>({...message,context_kind:'request' as const}))];
}
/** Called inside finishRun's fenced transaction, beside the visible response. */
export async function commitRouterThread(run:RunRecord,session:ClientSession){
 if(!run.agentModel||run.purpose==='automation'||run.superseded||run.cancelRequested)return;
 const state=await rows<{_id:string;messages:RouterMessage[]}>('routerStates').findOne({_id:run._id},{session});if(!state)return;
 const messages=completedRouterHistory(state.messages);
 if(Buffer.byteLength(JSON.stringify(messages))>8*1024*1024)throw Error('Conversation cache exceeded its bounded size.');
 const owner=await rows('users').findOne({_id:run.userId},{session,projection:{chatGeneration:1}});
 await rows<RouterThread>('routerThreads').replaceOne({_id:run.userId},{generation:Number(owner?.chatGeneration||0),origin:`${run.agentModel.provider}:${run.agentModel.id}`,messages,through:`${run._id}:assistant`,updatedAt:new Date().toISOString()},{session,upsert:true});
}
