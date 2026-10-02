import {randomUUID} from 'node:crypto';
import {rows} from './db';
import {embed} from './search/embeddings';
import {upsertNotificationRuleVector,deleteNotificationRuleVector} from './search/backend';

interface Job {_id:string;action:'upsert'|'delete';availableAt:number;attempts:number;lease?:string;leaseUntil?:number}
const jobs=()=>rows<Job>('notificationRuleJobs');
export async function indexNotificationRule(){
 const now=Date.now(),lease=randomUUID(),job=await jobs().findOneAndUpdate({availableAt:{$lte:now},$or:[{leaseUntil:{$exists:false}},{leaseUntil:{$lte:now}}]},{$set:{lease,leaseUntil:now+60000},$inc:{attempts:1}},{sort:{availableAt:1,_id:1},returnDocument:'after'});
 if(!job)return;
 try{
  const rule=job.action==='upsert'?await rows('notificationRules').findOne({_id:job._id},{projection:{kind:1,rule:1}}):null;
  if(rule&&(rule.kind==='talk_topic'||rule.kind==='post_topic')){
   const vector=await embed(String((rule.rule as {query:string}).query),'query');
   await upsertNotificationRuleVector(rule._id,String(rule.kind),vector);
   await rows('notificationRules').updateOne({_id:job._id},{$set:{indexedAt:new Date().toISOString()}});
  }else await deleteNotificationRuleVector(job._id);
  await jobs().deleteOne({_id:job._id,lease,action:job.action});
 }catch(error){await jobs().updateOne({_id:job._id,lease},{$set:{availableAt:Date.now()+Math.min(3600000,2000*2**Math.min(job.attempts,10))},$unset:{lease:'',leaseUntil:''}});console.error('Notification rule indexing:',error instanceof Error?error.name:'Error');}
}
export function startNotificationRuleIndex(){let stopped=false,running:Promise<unknown>|undefined;const tick=()=>{if(stopped||running)return;running=indexNotificationRule().catch(error=>console.error('Notification rule worker:',error instanceof Error?error.name:'Error')).finally(()=>{running=undefined;});};tick();const timer=setInterval(tick,1000);return async()=>{stopped=true;clearInterval(timer);await running;};}
