import {config} from './config';
import {rows} from './db';
import {routerClient,routerTokenUsage} from './openRouter';
import {recordTurnUsage} from './wallet';
import type OpenAI from 'openai';
import {directOpenAIClient,directUsage} from './routerOpenAI';
import type {AgentModelSnapshot} from '../shared/agentModel';
/** Recover actual charges when a stream disconnects, without repeating inference. */
export async function reconcileRouterUsage(client?:OpenAI){
 if(!client&&!config.OPENROUTER_API_KEY&&!config.OPENAI_API_KEY)return;
 const job=await rows<{_id:string;runId:string;userId:string;provider?:string;model?:AgentModelSnapshot;reported?:{usage:import('./openRouter').RouterUsage;costNanos:number};availableAt:number;attempts:number}>('routerUsageJobs').findOneAndUpdate({availableAt:{$lte:Date.now()}},{$set:{availableAt:Date.now()+60000},$inc:{attempts:1}},{sort:{availableAt:1},returnDocument:'after'});if(!job)return;
 try{
  if(job.provider==='openai'){
   let report=job.reported;
   if(!report){const response=await (client||directOpenAIClient()).responses.retrieve(job._id);if(!response.usage||!job.model)throw Error('Native usage pending.');report=directUsage(job.model,response.usage,response.output.filter(item=>item.type==='web_search_call'&&item.status==='completed'&&item.action?.type==='search').length);}
   await recordTurnUsage(job.runId,job._id,routerTokenUsage(report.usage),0,undefined,report.costNanos);await rows('routerUsageJobs').deleteOne({_id:job._id});return;
  }
  const result=await (client||routerClient()).get('/generation',{query:{id:job._id}}) as {data:{total_cost:number;native_tokens_prompt:number;native_tokens_completion:number;native_tokens_cached?:number;model:string}};
  const data=result.data,cost=Math.round(data.total_cost*1e9);
  if(!Number.isSafeInteger(cost)||cost<0||!Number.isSafeInteger(data.native_tokens_prompt)||!Number.isSafeInteger(data.native_tokens_completion))throw Error('Incomplete generation usage.');
  await recordTurnUsage(String(job.runId),job._id,routerTokenUsage({prompt_tokens:data.native_tokens_prompt,completion_tokens:data.native_tokens_completion,prompt_tokens_details:{cached_tokens:data.native_tokens_cached||0}}),0,undefined,cost);
  await rows('routerUsageJobs').deleteOne({_id:job._id});
 }catch(error){await rows('routerUsageJobs').updateOne({_id:job._id},{$set:{availableAt:Date.now()+[10000,60000,300000,3600000,86400000][Math.min(Number(job.attempts)-1,4)]}});console.error('OpenRouter usage reconciliation pending',{name:error instanceof Error?error.name:'Error'});}
}
export async function cleanStoredResponses(){
 if(!config.OPENAI_API_KEY)return;
 const job=await rows<{_id:string;userId:string;runId:string;availableAt:number;clearedAt?:number}>('responseCleanup').findOneAndUpdate({availableAt:{$lte:Date.now()}},{$set:{availableAt:Date.now()+60000}},{sort:{availableAt:1},returnDocument:'after'});if(!job)return;
 const client=directOpenAIClient();
 try{
  const response=await client.responses.retrieve(job._id);
  if(['queued','in_progress'].includes(response.status||'')&&Date.now()-(job.clearedAt||Date.now())<300000){await rows('responseCleanup').updateOne({_id:job._id},{$set:{availableAt:Date.now()+5000}});return;}
  if(response.usage){const run=await rows<{_id:string;userId:string;agentModel?:AgentModelSnapshot}>('runs').findOne({_id:job.runId,userId:job.userId},{projection:{agentModel:1}});if(run?.agentModel){const report=directUsage(run.agentModel,response.usage,response.output.filter(item=>item.type==='web_search_call'&&item.status==='completed'&&item.action?.type==='search').length);await recordTurnUsage(job.runId,job._id,routerTokenUsage(report.usage),0,undefined,report.costNanos);await rows('routerUsageJobs').deleteOne({_id:job._id});}}
  await client.responses.delete(job._id);await rows('responseCleanup').deleteOne({_id:job._id});
 }catch(error){if(error instanceof Error&&'status' in error&&error.status===404)await rows('responseCleanup').deleteOne({_id:job._id});else console.error('Response cleanup pending',{name:error instanceof Error?error.name:'Error'});}
}
