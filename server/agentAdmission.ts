import {randomUUID} from 'node:crypto';
import {rows,transaction} from './db';
import {config} from './config';
import type {RunRecord} from './runTypes';
/** One transaction serializes admissions across all worker processes in a stage.
 * Active leases bound the read. Interactive work retains reserved capacity;
 * an account can hold one automation slot plus its interactive conversation. */
export async function claimAgentRun(excluded:string[]=[],limits={global:config.AGENT_GLOBAL_CONCURRENCY,interactive:config.AGENT_INTERACTIVE_SLOTS,perAccount:config.AGENT_ACCOUNT_CONCURRENCY}){
 for(let attempt=0;attempt<3;attempt++)try{return await transaction(async session=>{
  const now=Date.now();await rows<{_id:string;revision:number}>('agentAdmission').updateOne({_id:'global'},{$inc:{revision:1}},{upsert:true,session});
  const runs=rows<RunRecord>('runs'),active=await runs.find({status:'running',leaseUntil:{$gt:now}},{session,projection:{userId:1,purpose:1}}).limit(limits.global).toArray();
  if(active.length>=limits.global)return null;
  const perUser=new Map<string,number>();for(const run of active)perUser.set(run.userId,(perUser.get(run.userId)||0)+1);
  const busyUsers=[...perUser].filter(([,count])=>count>=limits.perAccount).map(([id])=>id),background=active.filter(run=>run.purpose==='automation');
  const backgroundLimit=Math.max(0,limits.global-Math.min(limits.interactive,limits.global-1));
  return runs.findOneAndUpdate({_id:{$nin:excluded},userId:{$nin:busyUsers},$and:[{$or:[{status:'queued',nextAttempt:{$not:{$gt:now}}},{status:'running',leaseUntil:{$lt:now}}]},background.length>=backgroundLimit?{purpose:{$ne:'automation'}}:{$or:[{purpose:{$ne:'automation'}},{userId:{$nin:background.map(run=>run.userId)}}]}]},{$set:{status:'running',lease:randomUUID(),leaseUntil:now+60000},$inc:{attempts:1}},{session,sort:{priority:1,updatedAt:1},returnDocument:'after'});
 });}catch(error){if((error as {code?:number}).code!==11000||attempt===2)throw error;}
 return null;
}
