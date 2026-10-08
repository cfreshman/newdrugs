import OpenAI from 'openai';
import {config} from './config';
import {AppError} from './errors';
import {modelCost} from './agentModels';
import type {AgentModelSnapshot} from '../shared/agentModel';

export interface RouterTool {type:'function';function:{name:string;description:string;parameters:Record<string,unknown>;strict:false}}
export interface RouterMessage {role:'system'|'user'|'assistant'|'tool';content:any;tool_calls?:RouterCall[];tool_call_id?:string;reasoning_details?:any[];annotations?:any[]}
export interface RouterCall {id:string;type:'function';function:{name:string;arguments:string}}
export interface RouterUsage {prompt_tokens:number;completion_tokens:number;prompt_tokens_details?:{cached_tokens?:number;cache_write_tokens?:number};cost?:number}
export interface RouterResponse {id:string;model:string;message:RouterMessage;usage:RouterUsage;costNanos:number;finish:string}
export const routerClient=()=>new OpenAI({apiKey:config.OPENROUTER_API_KEY,baseURL:'https://openrouter.ai/api/v1',timeout:120000,maxRetries:0,defaultHeaders:{'HTTP-Referer':config.APP_ORIGIN,'X-OpenRouter-Title':'New Drugs'}});
export function routerRequest(model:AgentModelSnapshot,messages:RouterMessage[],tools:RouterTool[],resolved?:string){
 const id=resolved||model.id,haiku=/claude-haiku-(?:5[.-]5|latest)/.test(id);
 // This is Wayfinder's Haiku fix: no combined strict-tool grammar. Tool
 // arguments are still parsed by the shared MCP and operation validators.
 return {model:id,messages:structuredClone(messages),...(tools.length?{tools:tools.map(tool=>({...tool,function:{...tool.function,strict:false}})),tool_choice:'auto'}:{}),stream:true,stream_options:{include_usage:true},max_tokens:model.outputLimit,
  ...(model.reasoning?{reasoning:{effort:'medium'}}:{}),
  provider:{require_parameters:true,data_collection:'deny',...(haiku?{order:['anthropic'],allow_fallbacks:false}:{})},
 };
}
export function routerUsageCost(model:AgentModelSnapshot,usage:RouterUsage){
 const estimated=modelCost(model,usage.prompt_tokens,usage.prompt_tokens_details?.cached_tokens||0,usage.prompt_tokens_details?.cache_write_tokens||0,usage.completion_tokens);
 if(usage.cost===undefined)return estimated;
 if(typeof usage.cost!=='number'||!Number.isFinite(usage.cost)||usage.cost<0)throw Error('Invalid provider cost.');const cost=Math.round(usage.cost*1e9);if(!Number.isSafeInteger(cost))throw Error('Unsupported provider cost.');return cost;
}
export function estimatedRequestCost(model:AgentModelSnapshot,messages:RouterMessage[],tools:RouterTool[]){
 let imageCount=0;const text=JSON.stringify({messages,tools},(key,value)=>{if(key==='image_url'){imageCount++;return '[image]';}return value;});
 const input=Math.ceil(text.length/2)+imageCount*2048;if(input+model.outputLimit>model.context)throw new AppError(422,'model_context','This task exceeds the selected model’s context limit. Choose a larger compatible model.');
 return modelCost(model,input,0,0,model.outputLimit);
}
export function inputMessages(input:any[]):RouterMessage[]{return input.map(message=>({role:message.role,content:(message.content||[]).map((part:any)=>part.type==='input_image'?{type:'image_url',image_url:{url:part.image_url,detail:part.detail||'auto'}}:{type:'text',text:part.text||''})}));}
/** Assemble complete signed reasoning and tool arguments, including delta fragments. */
export class RouterAccumulator {
 id='';model='';text='';finish='';usage:RouterUsage|undefined;private calls=new Map<number,RouterCall>();private reasoning=new Map<number,any>();private annotations:any[]=[];
 apply(chunk:any){
  if(chunk.error)throw new AppError(502,'provider_failed','The model could not finish this request.');if(chunk.id)this.id=chunk.id;if(chunk.model)this.model=chunk.model;if(chunk.usage)this.usage=chunk.usage;
  const choice=chunk.choices?.[0];if(choice?.error)throw new AppError(502,'provider_failed','The model could not finish this request.');if(choice?.finish_reason)this.finish=choice.finish_reason;const delta=choice?.delta||{};
  if(typeof delta.content==='string')this.text+=delta.content;
  if(delta.annotations)this.annotations.push(...delta.annotations);
  for(const value of delta.tool_calls||[]){if(!Number.isInteger(value.index)||value.index<0||value.index>=32)throw Error('Too many tool calls.');const prior=this.calls.get(value.index)||{id:'',type:'function' as const,function:{name:'',arguments:''}};if(value.id)prior.id=value.id;if(value.function?.name)prior.function.name+=value.function.name;if(value.function?.arguments)prior.function.arguments+=value.function.arguments;this.calls.set(value.index,prior);}
  for(const value of delta.reasoning_details||[]){const index=value.index??0;if(!Number.isInteger(index)||index<0||index>1000)throw Error('Invalid reasoning block.');const prior=this.reasoning.get(index)||{};this.reasoning.set(index,{...prior,...value,...Object.fromEntries(['text','data','signature','summary'].filter(key=>typeof value[key]==='string').map(key=>[key,(prior[key]||'')+value[key]]))});}
  if(this.text.length>100000||JSON.stringify([...this.reasoning.values(),...this.calls.values()]).length>2*1024*1024)throw Error('Provider output exceeded its limit.');
 }
 result(model:AgentModelSnapshot):RouterResponse{
  if(!this.id||!this.model||!this.usage||!['stop','tool_calls'].includes(this.finish))throw new AppError(502,this.finish==='content_filter'?'model_refusal':'provider_incomplete',this.finish==='content_filter'?'The model declined this request.':'The model response was incomplete. Completed actions are preserved.');
  const calls=[...this.calls].sort(([a],[b])=>a-b).map(([,call])=>call);if(calls.some(call=>!call.id||call.id.length>200||!call.function.name||call.function.arguments.length>100000))throw Error('Invalid provider tool call.');
  return {id:this.id,model:this.model,finish:this.finish,message:{role:'assistant',content:this.text||null,...(calls.length?{tool_calls:calls}:{}),...(this.reasoning.size?{reasoning_details:[...this.reasoning].sort(([a],[b])=>a-b).map(([,value])=>value)}:{}),...(this.annotations.length?{annotations:this.annotations}:{})},usage:this.usage,costNanos:routerUsageCost(model,this.usage)};
 }
}
export function visibleRouterText(text:string){
 if(text.startsWith('<commentary>')){const end=text.indexOf('</commentary>');return {preamble:text.slice(12,end<0?undefined:end).trim().slice(0,180),draft:end<0?'':text.slice(end+13).trimStart()};}
 if('<commentary>'.startsWith(text))return {preamble:'',draft:''};return {preamble:'',draft:text};
}
export async function routerResponse(model:AgentModelSnapshot,messages:RouterMessage[],tools:RouterTool[],options:{client?:OpenAI;resolved?:string;web?:boolean;signal:AbortSignal;delta?(text:string):Promise<void>;started?(id:string):Promise<void>}):Promise<RouterResponse>{
 const client=options.client||routerClient(),request=routerRequest(model,messages,tools,options.resolved),stream=await client.chat.completions.create({...request,...(options.web?{plugins:[{id:'web',engine:'exa',max_results:3}]}:{})} as any,{signal:options.signal}),result=new RouterAccumulator();
 for await(const chunk of stream as unknown as AsyncIterable<any>){const first=!result.id;result.apply(chunk);if(first&&result.id)await options.started?.(result.id);await options.delta?.(result.text);}
 if(options.web&&result.usage?.cost===undefined)throw new AppError(502,'usage_pending','Search usage is pending reconciliation. Completed actions are saved.');
 return result.result(model);
}
export const routerTokenUsage=(usage:RouterUsage)=>({input_tokens:usage.prompt_tokens,input_tokens_details:{cached_tokens:usage.prompt_tokens_details?.cached_tokens||0},output_tokens:usage.completion_tokens,output_tokens_details:{reasoning_tokens:0},total_tokens:usage.prompt_tokens+usage.completion_tokens});
