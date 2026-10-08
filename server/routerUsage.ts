import {config} from './config';
import {rows} from './db';
import {routerClient,routerTokenUsage} from './openRouter';
import {recordTurnUsage} from './wallet';
import type OpenAI from 'openai';
/** Recover actual charges when a stream disconnects, without repeating inference. */
export async function reconcileRouterUsage(client?:OpenAI){
 if(!client&&!config.OPENROUTER_API_KEY)return;
 const job=await rows<{_id:string;runId:string;userId:string;availableAt:number;attempts:number}>('routerUsageJobs').findOneAndUpdate({availableAt:{$lte:Date.now()}},{$set:{availableAt:Date.now()+60000},$inc:{attempts:1}},{sort:{availableAt:1},returnDocument:'after'});if(!job)return;
 try{
  const result=await (client||routerClient()).get('/generation',{query:{id:job._id}}) as {data:{total_cost:number;native_tokens_prompt:number;native_tokens_completion:number;native_tokens_cached?:number;model:string}};
  const data=result.data,cost=Math.round(data.total_cost*1e9);
  if(!Number.isSafeInteger(cost)||cost<0||!Number.isSafeInteger(data.native_tokens_prompt)||!Number.isSafeInteger(data.native_tokens_completion))throw Error('Incomplete generation usage.');
  await recordTurnUsage(String(job.runId),job._id,routerTokenUsage({prompt_tokens:data.native_tokens_prompt,completion_tokens:data.native_tokens_completion,prompt_tokens_details:{cached_tokens:data.native_tokens_cached||0}}),0,undefined,cost);
  await rows('routerUsageJobs').deleteOne({_id:job._id});
 }catch(error){await rows('routerUsageJobs').updateOne({_id:job._id},{$set:{availableAt:Date.now()+[10000,60000,300000,3600000,86400000][Math.min(Number(job.attempts)-1,4)]}});console.error('OpenRouter usage reconciliation pending',{name:error instanceof Error?error.name:'Error'});}
}
