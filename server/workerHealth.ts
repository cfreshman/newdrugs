import {hostname} from 'node:os';
import {randomUUID} from 'node:crypto';
import {rows} from './db';
import {config} from './config';
export function startWorkerHealth(){
 const _id=randomUUID(),startedAt=new Date().toISOString();let stopped=false,running:Promise<unknown>|undefined;
 const tick=()=>{if(stopped||running)return;running=rows('workerHealth').updateOne({_id},{$set:{role:config.PROCESS_ROLE,host:hostname(),pid:process.pid,startedAt,heartbeatAt:new Date(),expiresAt:new Date(Date.now()+120000)}},{upsert:true}).catch(error=>console.error('Worker heartbeat:',error.name)).finally(()=>{running=undefined;});};tick();const timer=setInterval(tick,15000);
 return async()=>{stopped=true;clearInterval(timer);await running;await rows('workerHealth').deleteOne({_id});};
}
