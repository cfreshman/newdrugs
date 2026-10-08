import type OpenAI from 'openai';
import {AppError} from './errors';
import {modelCost} from './agentModels';
import {routerClient,type RouterMessage,type RouterTool,type RouterResponse,type RouterUsage} from './openRouter';
import type {AgentModelSnapshot} from '../shared/agentModel';

export const ANTHROPIC_COMPACTION_TOKENS=100000;
export const usesAnthropicMessages=(model:AgentModelSnapshot)=>/^(?:~)?anthropic\/claude-haiku-(?:5[.-]5|latest)(?:$|-)/.test(model.id);
function nativeText(content:any):any[]{return typeof content==='string'?[{type:'text',text:content}]:Array.isArray(content)?content.map(part=>part.type==='image_url'?{type:'image',source:part.image_url.url.startsWith('data:')?{type:'base64',media_type:part.image_url.url.slice(5,part.image_url.url.indexOf(';')),data:part.image_url.url.slice(part.image_url.url.indexOf(',')+1)}:{type:'url',url:part.image_url.url}}:{type:'text',text:part.text||''}):[];}
export function anthropicRequest(model:AgentModelSnapshot,messages:RouterMessage[],tools:RouterTool[],resolved?:string){
 const input:any[]=messages.filter(message=>message.role!=='system').map(message=>message.role==='tool'?{role:'user',content:[{type:'tool_result',tool_use_id:message.tool_call_id,content:message.content}]}:{role:message.role,content:message.native_content?structuredClone(message.native_content):[...nativeText(message.content),...(message.tool_calls||[]).map(call=>({type:'tool_use',id:call.id,name:call.function.name,input:JSON.parse(call.function.arguments)}))]});
 return {model:resolved||model.id,system:messages.filter(message=>message.role==='system').map(message=>String(message.content)).join('\n'),messages:input,max_tokens:model.outputLimit,stream:true,thinking:{type:'adaptive'},output_config:{effort:'medium'},
  ...(tools.length?{tools:tools.map(tool=>({name:tool.function.name,description:tool.function.description,input_schema:tool.function.parameters,strict:false})),tool_choice:{type:'auto'}}:{}),
  context_management:{edits:[{type:'compact_20260112',trigger:{type:'input_tokens',value:ANTHROPIC_COMPACTION_TOKENS},pause_after_compaction:true}]},provider:{order:['anthropic'],allow_fallbacks:false,require_parameters:true,data_collection:'deny'}};
}
export function anthropicUsage(model:AgentModelSnapshot,raw:any):{usage:RouterUsage;costNanos:number}{
 const entries=raw.iterations?.length?raw.iterations:[raw];let prompt=0,output=0,cached=0,writes=0,cost=0;
 for(const entry of entries){const read=entry.cache_read_input_tokens||0,write=entry.cache_creation_input_tokens||0,input=(entry.input_tokens||0)+read+write,out=entry.output_tokens||0;cost+=modelCost(model,input,read,write,out);prompt+=input;output+=out;cached+=read;writes+=write;}
 if(raw.cost!==undefined){cost=Math.round(raw.cost*1e9);if(!Number.isSafeInteger(cost)||cost<0)throw Error('Invalid native provider cost.');}
 return {usage:{prompt_tokens:prompt,completion_tokens:output,prompt_tokens_details:{cached_tokens:cached,cache_write_tokens:writes},...(raw.cost!==undefined?{cost:raw.cost}:{})},costNanos:cost};
}
/** Preserve complete native blocks. Compaction and private thinking never become
 * visible text, and iteration usage includes the summarization generation. */
export class AnthropicAccumulator {
 id='';model='';finish='';text='';private blocks=new Map<number,any>();private arguments=new Map<number,string>();private usage:any={};
 apply(value:any){
  const event=value.data&&value.event?value.data:value;
  if(event.type==='error')throw new AppError(502,'provider_failed','The model could not finish this request.');
  if(event.type==='message_start'){this.id=event.message.id;this.model=event.message.model;this.usage={...this.usage,...event.message.usage};}
  if(event.type==='message_delta'){this.finish=event.delta?.stop_reason||this.finish;this.usage={...this.usage,...event.usage};}
  if(event.type==='content_block_start'){if(!Number.isInteger(event.index)||event.index<0||event.index>=64)throw Error('Too many native content blocks.');this.blocks.set(event.index,structuredClone(event.content_block));}
  if(event.type==='content_block_delta'){
   const block=this.blocks.get(event.index);if(!block)throw Error('Missing native content block.');const delta=event.delta;
   if(delta.type==='text_delta'){block.text=(block.text||'')+delta.text;this.text+=delta.text;}
   if(delta.type==='thinking_delta')block.thinking=(block.thinking||'')+delta.thinking;
   if(delta.type==='signature_delta')block.signature=(block.signature||'')+delta.signature;
   if(delta.type==='compaction_delta')block.content=(block.content||'')+(delta.content||'');
   if(delta.type==='input_json_delta'){const args=(this.arguments.get(event.index)||'')+delta.partial_json;if(args.length>100000)throw Error('Native tool arguments exceeded their limit.');this.arguments.set(event.index,args);}
  }
  if(this.text.length>100000||JSON.stringify([...this.blocks.values(),...this.arguments.values()]).length>2*1024*1024)throw Error('Native response exceeded its limit.');
 }
 result(model:AgentModelSnapshot):RouterResponse{
  if(!this.id||!this.model||!['end_turn','tool_use','compaction'].includes(this.finish))throw new AppError(502,this.finish==='refusal'?'model_refusal':'provider_incomplete',this.finish==='refusal'?'The model declined this request.':'The model response was incomplete. Completed actions are preserved.');
  const blocks=[...this.blocks].sort(([a],[b])=>a-b).map(([index,block])=>this.arguments.has(index)?{...block,input:JSON.parse(this.arguments.get(index)!)}:block),calls=blocks.filter(block=>block.type==='tool_use').map(block=>({id:block.id,type:'function' as const,function:{name:block.name,arguments:JSON.stringify(block.input)}}));
  if(calls.length>32)throw Error('Too many native tool calls.');
  const metered=anthropicUsage(model,this.usage);return {id:this.id,model:this.model,finish:this.finish==='tool_use'?'tool_calls':this.finish==='compaction'?'compaction':'stop',message:{role:'assistant',content:this.text||null,native_content:blocks,...(calls.length?{tool_calls:calls}:{})},...metered};
 }
}
export async function anthropicResponse(model:AgentModelSnapshot,messages:RouterMessage[],tools:RouterTool[],options:{client?:OpenAI;resolved?:string;signal:AbortSignal;delta?(text:string):Promise<void>;started?(id:string):Promise<void>}):Promise<RouterResponse>{
 const client=options.client||routerClient(),stream=await client.post('/messages',{body:anthropicRequest(model,messages,tools,options.resolved),headers:{'anthropic-beta':'compact-2026-01-12'},stream:true,signal:options.signal}) as AsyncIterable<any>,result=new AnthropicAccumulator();
 for await(const event of stream){const first=!result.id;result.apply(event);if(first&&result.id)await options.started?.(result.id);await options.delta?.(result.text);}
 return result.result(model);
}
