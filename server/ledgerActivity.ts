import {randomUUID} from 'node:crypto';
import type {ClientSession} from 'mongodb';
import {rows,transaction} from './db';
import {hash} from './auth';
interface LedgerRow {_id:string;userId:string;amountNanos:number;label:string;createdAt:string}
interface Receipt extends LedgerRow {kind:'charge'|'boundary'|'empty';orderKey:string;fingerprint:string;periodId?:string}
interface Period {_id:string;userId:string;orderKey:string;boundary:LedgerRow|null;amountNanos:number;chargeCount:number;startedAt?:string;endedAt?:string;firstReceiptId?:string}
interface Build {_id:string;done:boolean;cursorDate?:string;cursorId?:string;lease?:string;leaseUntil?:number}
interface Job {_id:string;userId:string;revision:string;availableAt:number;lease?:string;attempts:number}
const receipts=()=>rows<Receipt>('ledgerActivityReceipts');
export const ledgerPeriods=()=>rows<Period>('ledgerActivityPeriods');
const builds=()=>rows<Build>('ledgerActivityBuilds'),jobs=()=>rows<Job>('ledgerActivityJobs');
const order=(row:LedgerRow)=>`${row.createdAt}\u0000${row._id}`;
const periodId=(userId:string,boundaryId?:string)=>hash(JSON.stringify([userId,boundaryId||null]));
const kind=(row:LedgerRow):Receipt['kind']=>row._id.startsWith('usage:')&&row.amountNanos<=0?row.amountNanos<0?'charge':'empty':'boundary';
export async function queueLedgerActivity(userId:string,receiptId:string,session?:ClientSession){
 await builds().updateOne({_id:userId},{$setOnInsert:{done:false}},{upsert:true,session});
 await jobs().updateOne({_id:receiptId},{$set:{userId,revision:randomUUID(),availableAt:Date.now(),attempts:0},$unset:{lease:''}},{upsert:true,session});
}
async function notify(userId:string,session?:ClientSession){await rows('recordEvents').insertOne({_id:randomUUID(),userIds:[userId],payload:{keys:['billing_activity']},expiresAt:new Date(Date.now()+3600000)},{session});}
async function extents(id:string,session:ClientSession){
 const first=await receipts().findOne({periodId:id,kind:'charge'},{session,sort:{orderKey:1}}),last=first&&await receipts().findOne({periodId:id,kind:'charge'},{session,sort:{orderKey:-1}});
 await ledgerPeriods().updateOne({_id:id},first?{$set:{startedAt:first.createdAt,endedAt:last!.createdAt,firstReceiptId:first._id}}:{$unset:{startedAt:'',endedAt:'',firstReceiptId:''}},{session});
}
async function applyReceipt(userId:string,id:string,session:ClientSession){
 const row=await rows<LedgerRow>('ledger').findOne({_id:id,userId},{session}),previous=await receipts().findOne({_id:id,userId},{session});
 const fingerprint=row?hash(JSON.stringify([row.amountNanos,row.label,row.createdAt])):'';
 if(previous?.fingerprint===fingerprint)return;
 const next:Receipt|undefined=row?{_id:row._id,userId,amountNanos:Number(row.amountNanos),label:row.label,createdAt:row.createdAt,kind:kind(row),orderKey:order(row),fingerprint}:undefined;
 if(next?.kind==='charge'){
  const boundary=await receipts().findOne({userId,kind:'boundary',_id:{$ne:id},orderKey:{$lte:next.orderKey}},{session,sort:{orderKey:-1}});next.periodId=periodId(userId,boundary?._id);
  await ledgerPeriods().updateOne({_id:next.periodId},{$setOnInsert:{userId,orderKey:boundary?.orderKey||'',boundary:boundary||null,amountNanos:0,chargeCount:0}},{session,upsert:true});
 }
 if(next)await receipts().replaceOne({_id:id},next,{session,upsert:true});else await receipts().deleteOne({_id:id,userId},{session});
 const deltas=new Map<string,{amount:number;count:number}>();
 if(previous?.kind==='charge'&&previous.periodId)deltas.set(previous.periodId,{amount:-previous.amountNanos,count:-1});
 if(next?.kind==='charge'&&next.periodId){const delta=deltas.get(next.periodId)||{amount:0,count:0};delta.amount+=next.amountNanos;delta.count++;deltas.set(next.periodId,delta);}
 for(const [id,delta]of deltas){if(delta.amount||delta.count)await ledgerPeriods().updateOne({_id:id},{$inc:{amountNanos:delta.amount,chargeCount:delta.count}},{session});if(previous?.periodId!==next?.periodId||previous?.orderKey!==next?.orderKey||previous?.kind!==next?.kind)await extents(id,session);}
 if(next?.kind==='boundary')await ledgerPeriods().updateOne({_id:periodId(userId,id)},{$set:{userId,orderKey:next.orderKey,boundary:next},$setOnInsert:{amountNanos:0,chargeCount:0}},{session,upsert:true});
 if(previous?.kind==='boundary'&&next?.kind!=='boundary')await ledgerPeriods().updateOne({_id:periodId(userId,id)},{$set:{boundary:null}},{session});
 if((previous?.kind==='boundary'||next?.kind==='boundary')&&(previous?.kind!==next?.kind||previous?.orderKey!==next?.orderKey)){
  const keys=[previous?.orderKey,next?.orderKey].filter((value):value is string=>Boolean(value)).sort(),after=await receipts().findOne({userId,kind:'boundary',orderKey:{$gt:keys.at(-1)!}},{session,sort:{orderKey:1}});
  if(await receipts().findOne({userId,kind:'charge',orderKey:{$gte:keys[0],...(after?{$lt:after.orderKey}:{})}},{session,projection:{_id:1}}))await rows('ledgerActivityMoves').updateOne({_id:hash(JSON.stringify([userId,keys[0],after?.orderKey||null]))},{$set:{userId,from:keys[0],through:after?.orderKey||null,revision:randomUUID()},$unset:{cursor:''}},{session,upsert:true});
 }
}
export async function indexLedgerReceipt(){
 const lease=randomUUID(),job=await jobs().findOneAndUpdate({availableAt:{$lte:Date.now()}},{$set:{lease,availableAt:Date.now()+60000},$inc:{attempts:1}},{sort:{availableAt:1},returnDocument:'after'});if(!job)return false;
 try{await transaction(async session=>{const owned=await jobs().deleteOne({_id:job._id,revision:job.revision,lease},{session});if(!owned.deletedCount)return;await applyReceipt(job.userId,job._id,session);await notify(job.userId,session);});}
 catch(error){console.error('Billing activity retry',{name:error instanceof Error?error.name:'Error'});await jobs().updateOne({_id:job._id,revision:job.revision,lease},{$set:{availableAt:Date.now()+Math.min(60000,1000*2**Math.min(job.attempts,6))},$unset:{lease:''}});}
 return true;
}
export async function backfillLedgerActivity(userId?:string){
 const lease=randomUUID(),build=await builds().findOneAndUpdate({_id:userId?userId:{$exists:true},done:false,$or:[{leaseUntil:{$exists:false}},{leaseUntil:{$lt:Date.now()}}]},{$set:{lease,leaseUntil:Date.now()+60000}},{returnDocument:'after'});if(!build)return false;
 try{
  const filter={userId:build._id,...(build.cursorId?{$or:[{createdAt:{$gt:build.cursorDate}},{createdAt:build.cursorDate,_id:{$gt:build.cursorId}}]}:{})};
  const page=await rows<LedgerRow>('ledger').find(filter).sort({createdAt:1,_id:1}).limit(100).toArray();
  for(const item of page)await transaction(session=>applyReceipt(build._id,item._id,session));
  await transaction(async session=>{const last=page.at(-1);await builds().updateOne({_id:build._id,lease},{$set:{done:page.length<100,...(last?{cursorDate:last.createdAt,cursorId:last._id}:{})},$unset:{lease:'',leaseUntil:''}},{session});await notify(build._id,session);});
 }catch(error){console.error('Billing activity backfill retry',{name:error instanceof Error?error.name:'Error'});await builds().updateOne({_id:build._id,lease},{$unset:{lease:'',leaseUntil:''}});}
 return true;
}
export async function moveLedgerPeriods(){
 const move=await rows('ledgerActivityMoves').findOne({});if(!move)return false;
 const page=await receipts().find({userId:String(move.userId),kind:'charge',orderKey:{$gte:String(move.from),...(move.cursor?{$gt:String(move.cursor)}:{}),...(move.through?{$lt:String(move.through)}:{})}}).sort({orderKey:1}).limit(100).toArray();
 for(const item of page)await transaction(async session=>{
  const current=await receipts().findOne({_id:item._id},{session});if(!current)return;
  // Membership in a billing period changed, even though the original receipt did not.
  await receipts().updateOne({_id:item._id},{$set:{fingerprint:''}},{session});await applyReceipt(item.userId,item._id,session);
 });
 const last=page.at(-1);if(page.length<100)await rows('ledgerActivityMoves').deleteOne({_id:move._id,revision:move.revision});else await rows('ledgerActivityMoves').updateOne({_id:move._id,revision:move.revision},{$set:{cursor:last!.orderKey}});await notify(String(move.userId));return true;
}
export async function readLedgerActivity(userId:string,limit:number){
 let build=await builds().findOne({_id:userId});if(!build){await builds().updateOne({_id:userId},{$setOnInsert:{done:false}},{upsert:true});return {items:[],indexing:true};}
 const indexing=!build.done||Boolean(await jobs().findOne({userId},{projection:{_id:1}}))||Boolean(await rows('ledgerActivityMoves').findOne({userId},{projection:{_id:1}}));
 if(!build.done)return {items:[],indexing:true};
 const latest=await receipts().find({userId,kind:'charge'}).sort({orderKey:-1}).limit(3).toArray(),periods=await ledgerPeriods().find({userId,$or:[{chargeCount:{$gt:0}},{boundary:{$ne:null}}]}).sort({orderKey:-1}).limit(limit+3).toArray();
 // Read the recorded model from at most three canonical receipts. Existing
 // projections need no history rebuild, and rollups never imply one model.
 const raw=latest.length?await rows('ledger').find({userId,_id:{$in:latest.map(row=>row._id)}},{projection:{'details.model':1}}).limit(3).toArray():[];
 const models=new Map(raw.flatMap(row=>{const model=(row.details as {model?:unknown}|undefined)?.model;return typeof model==='string'&&model.trim()&&model.length<=160?[[row._id,model] as const]:[];}));
 const items:import('../shared/billingActivity').BillingActivityItem[]=[];
 for(const period of periods){
  const recent=latest.filter(row=>row.periodId===period._id);for(const row of recent)items.push({id:row._id,kind:'charge',label:row.label,...(models.has(row._id)?{model:models.get(row._id)}:{}),amountNanos:row.amountNanos,startedAt:row.createdAt,endedAt:row.createdAt,chargeCount:1});
  const count=period.chargeCount-recent.length;
  if(count>0){const last=await receipts().findOne({periodId:period._id,kind:'charge',_id:{$nin:recent.map(row=>row._id)}},{sort:{orderKey:-1}});if(last)items.push({id:`usage-group:${period.firstReceiptId}`,kind:'usage',label:'Agent usage rollup',amountNanos:period.amountNanos-recent.reduce((sum,row)=>sum+row.amountNanos,0),chargeCount:count,startedAt:period.startedAt!,endedAt:last.createdAt});}
  if(period.boundary){const row=period.boundary;items.push({id:row._id,kind:row.amountNanos>0?'credit':'adjustment',label:row.label,amountNanos:row.amountNanos,startedAt:row.createdAt,endedAt:row.createdAt,chargeCount:0});}
  if(items.length>=limit)break;
 }
 return {items:items.slice(0,limit),indexing};
}
export function startLedgerActivityWorker(){let stopped=false,pending:Promise<void>|undefined;const tick=()=>{if(stopped||pending)return;pending=(async()=>{for(let i=0;i<8&&!stopped&&await indexLedgerReceipt();i++);if(!stopped)await backfillLedgerActivity();if(!stopped)await moveLedgerPeriods();})().catch(error=>console.error('Billing activity worker',{name:error.name})).finally(()=>{pending=undefined;});};const timer=setInterval(tick,2000);tick();return async()=>{stopped=true;clearInterval(timer);await pending;};}
