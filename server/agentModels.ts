import {rows,type Row} from './db';
import {AppError} from './errors';
import {config} from './config';
import {DEFAULT_OPENROUTER_MODEL,type AgentModel,type AgentModelSnapshot,type ModelPrice} from '../shared/agentModel';

interface Selection extends Row {_id:string;model:string;revision:number;updatedBy:string;updatedAt:string}
export function tokenNanos(value:unknown){
 if(typeof value!=='string'||!/^\d+(?:\.\d+)?$/.test(value))throw Error('Missing model pricing.');
 const [whole,fraction='']=value.split('.'),rounded=BigInt(whole)*1_000_000_000n+BigInt((fraction+'000000000').slice(0,9))+(/^0*$/.test(fraction.slice(9))?0n:1n),result=Number(rounded);
 if(!Number.isSafeInteger(result))throw Error('Unsupported model pricing.');return result;
}
const price=(value:any):ModelPrice=>({input:tokenNanos(value.prompt),cached:tokenNanos(value.input_cache_read??value.prompt),cacheWrite:tokenNanos(value.input_cache_write??value.prompt),output:tokenNanos(value.completion)});
export function compatibleModel(value:any):AgentModel|null{
 if(!value||typeof value.id!=='string'||value.id.length>150||value.id.includes(':')||!value.supported_parameters?.includes('tools')||!value.supported_parameters?.includes('tool_choice')||!value.architecture?.input_modalities?.includes('text')||!value.architecture?.input_modalities?.includes('image')||!value.architecture?.output_modalities?.includes('text'))return null;
 try{const pricing=price(value.pricing),tiers=value.pricing?.overrides;
  if(tiers?.length){if(tiers.length!==1||!Number.isSafeInteger(tiers[0].min_prompt_tokens)||tiers[0].min_prompt_tokens<1)return null;pricing.threshold=tiers[0].min_prompt_tokens;pricing.long=price(tiers[0]);}
  if(!Number.isSafeInteger(value.context_length)||value.context_length<8192)return null;
  const output=Number(value.top_provider?.max_completion_tokens)||4096;if(!Number.isSafeInteger(output)||output<1024)return null;
  return {id:value.id,name:String(value.name||value.id).slice(0,160),context:value.context_length,outputLimit:Math.min(8192,Math.floor(value.context_length/4),output),reasoning:value.supported_parameters.includes('reasoning'),price:pricing};
 }catch{return null;}
}
let catalog:{until:number;models:AgentModel[]}|undefined,inflight:Promise<AgentModel[]>|undefined;
export async function agentModelCatalog(force=false):Promise<AgentModel[]>{
 if(!force&&catalog&&catalog.until>Date.now())return catalog.models;if(inflight)return inflight;
 inflight=(async()=>{
  const response=await fetch('https://openrouter.ai/api/v1/models',{redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new AppError(503,'model_catalog','The model catalog is unavailable. Try again.');
  const reader=response.body?.getReader();if(!reader)throw new AppError(503,'model_catalog','The model catalog is unavailable.');let total=0;const chunks:Uint8Array[]=[];
  try{while(true){const part=await reader.read();if(part.done)break;total+=part.value.length;if(total>8*1024*1024){await reader.cancel();throw Error('Model catalog too large.');}chunks.push(part.value);}}finally{reader.releaseLock();}
  const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!Array.isArray(value.data)||value.data.length>4000)throw Error('Invalid model catalog.');
  const models=value.data.map(compatibleModel).filter((model:AgentModel|null):model is AgentModel=>Boolean(model)).sort((a:AgentModel,b:AgentModel)=>a.name.localeCompare(b.name));catalog={until:Date.now()+10*60000,models};return models;
 })();try{return await inflight;}finally{inflight=undefined;}
}
export async function agentModelSetting(){return await rows<Selection>('agentModelSettings').findOne({_id:'chat'})||{_id:'chat',model:DEFAULT_OPENROUTER_MODEL,revision:0};}
export async function setAgentModel(model:string,revision:number,ownerId:string){
 if(!(await agentModelCatalog(true)).some(value=>value.id===model))throw new AppError(422,'incompatible_model','Enter an OpenRouter model that supports text, images and tool calls.');
 const previous=await agentModelSetting();if(previous.revision!==revision)throw new AppError(409,'model_changed','The model changed. Reload and try again.');
 const next={model,revision:revision+1,updatedBy:ownerId,updatedAt:new Date().toISOString()};
 if(!revision){try{await rows<Selection>('agentModelSettings').insertOne({_id:'chat',...next});}catch(error){if((error as {code?:number}).code===11000)throw new AppError(409,'model_changed','The model changed. Reload and try again.');throw error;}}
 else if(!(await rows<Selection>('agentModelSettings').updateOne({_id:'chat',revision},{$set:next})).matchedCount)throw new AppError(409,'model_changed','The model changed. Reload and try again.');
 return next;
}
export async function selectedAgentModel():Promise<AgentModelSnapshot|null>{
 const selection=await agentModelSetting(),direct=selection.model.startsWith('openai/')&&Boolean(config.OPENAI_API_KEY);if(!direct&&!config.OPENROUTER_API_KEY)return null;const model=(await agentModelCatalog()).find(value=>value.id===selection.model);
 if(!model)throw new AppError(503,'incompatible_model','The selected agent model is no longer compatible. Change it in admin.');
 return {...model,provider:direct?'openai':'openrouter',revision:selection.revision,selectedAt:new Date().toISOString()};
}
export function modelCost(model:AgentModel,input:number,cached:number,writes:number,output:number){
 if([input,cached,writes,output].some(value=>!Number.isSafeInteger(value)||value<0)||cached+writes>input)throw Error('Invalid model usage.');
 const rate=model.price.threshold&&input>model.price.threshold?model.price.long!:model.price,cost=(input-cached-writes)*rate.input+cached*rate.cached+writes*rate.cacheWrite+output*rate.output;
 if(!Number.isSafeInteger(cost))throw Error('Unsupported usage precision.');return cost;
}
