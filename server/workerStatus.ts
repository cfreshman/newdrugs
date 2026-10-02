import {connectDatabase,mongo,rows} from './db';
import {hostname} from 'node:os';
const required=process.argv.includes('--require-worker'),pid=Number(process.argv[process.argv.indexOf('--require-worker')+1]);
if(required&&(!Number.isSafeInteger(pid)||pid<=0))throw Error('A positive worker PID is required.');
await connectDatabase(undefined,{indexes:false});
try{
 const workers=await rows('workerHealth').find({heartbeatAt:{$gt:new Date(Date.now()-45000)},...(required?{role:'worker',pid,host:hostname()}: {})},{projection:{role:1,pid:1,host:1,heartbeatAt:1}}).limit(20).toArray();
 const queues:Record<string,{pending:number;capped:boolean}>= {};
 for(const name of ['retrievalJobs','logSearchJobs','chatSearchJobs','ledgerActivityJobs']){const count=await rows(name).countDocuments({}, {limit:10001,maxTimeMS:3000});queues[name]={pending:Math.min(count,10000),capped:count>10000};}
 for(const [name,filter] of [['notificationEvents',{status:'queued'}],['notificationRuleJobs',{}]] as const){const count=await rows(name).countDocuments(filter,{limit:10001,maxTimeMS:3000});queues[name]={pending:Math.min(count,10000),capped:count>10000};}
 const next=await rows('runs').findOne({status:'queued'},{sort:{updatedAt:1},projection:{updatedAt:1}});
 console.log(JSON.stringify({workers:workers.map(row=>({role:row.role,pid:row.pid,heartbeatAt:row.heartbeatAt})),queues,oldestQueuedAgeSeconds:next?Math.max(0,Math.floor((Date.now()-Date.parse(String(next.updatedAt)))/1000)):null}));
 if(required&&!workers.some(row=>row.role==='worker'&&row.pid===pid&&row.host===hostname()))process.exitCode=1;
}finally{await mongo.close();}
