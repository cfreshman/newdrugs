import {randomUUID} from 'node:crypto';
import type {ClientSession} from 'mongodb';
import {rows,transaction} from './db';
import {users} from './auth';
import {AppError} from './errors';

interface Edge {_id:string;members:string[];status:string}
interface Path {_id:string;pairId:string;members:string[];via:string;edgeIds:string[]}
interface Pair {_id:string;members:string[];mutualCount:number;previewIds:string[]}
interface Job {_id:string;edgeId:string;members:string[];kind:'add'|'remove';phase:number;cursor:string;createdAt:string}
interface Meta {_id:string;cursor?:string;done?:boolean;nextAt?:number;lease?:string;leaseUntil?:number}
const edges=()=>rows<Edge>('connections'),paths=()=>rows<Path>('circlePaths'),pairs=()=>rows<Pair>('circlePairs'),jobs=()=>rows<Job>('circleJobs'),meta=()=>rows<Meta>('circleMeta');
export const circlePairId=(a:string,b:string)=>[a,b].sort().join(':');
async function refreshPreview(pairId:string,session:ClientSession){const first=await paths().find({pairId},{session,projection:{via:1}}).sort({via:1}).limit(3).toArray();await pairs().updateOne({_id:pairId},{$set:{previewIds:first.map(row=>row.via)}},{session});}

/** Enqueue in the same transaction as the friendship or block change. */
export async function enqueueCircleEdge(a:string,b:string,kind:'add'|'remove',session:ClientSession){
 await jobs().insertOne({_id:randomUUID(),edgeId:circlePairId(a,b),members:[a,b],kind,phase:0,cursor:'',createdAt:new Date().toISOString()},{session});
}

async function addPage(job:Job){
 const [a,b]=job.members,via=job.phase===0?a:b,other=job.phase===0?b:a;
 const active=await edges().findOne({_id:job.edgeId,status:'accepted'},{projection:{_id:1}});
 if(!active||await rows('blocks').findOne({pairId:job.edgeId},{projection:{_id:1}})||await users().countDocuments({_id:{$in:[a,b]},suspendedAt:null})!==2){await transaction(async session=>{await jobs().deleteOne({_id:job._id},{session});await enqueueCircleEdge(a,b,'remove',session);});return;}
 const page=await edges().find({members:via,status:'accepted',...(job.cursor?{_id:{$gt:job.cursor}}:{})},{projection:{_id:1,members:1,status:1}}).sort({_id:1}).limit(50).toArray();
 const neighbors=page.flatMap(edge=>edge.members.filter(id=>id!==via&&id!==other).map(id=>({id,edgeId:edge._id})));
 const [blocked,available]=await Promise.all([
  rows('blocks').find({pairId:{$in:neighbors.map(row=>row.edgeId)}},{projection:{pairId:1}}).limit(50).toArray(),
  users().find({_id:{$in:neighbors.map(row=>row.id)},suspendedAt:null},{projection:{_id:1}}).limit(50).toArray(),
 ]);
 const blockedIds=new Set(blocked.map(row=>row.pairId)),availableIds=new Set(available.map(row=>row._id));
 await transaction(async session=>{
  for(const neighbor of neighbors){
   if(blockedIds.has(neighbor.edgeId)||!availableIds.has(neighbor.id))continue;
   const members=[other,neighbor.id].sort(),pairId=circlePairId(other,neighbor.id),_id=`${pairId}:${via}`;
   const inserted=await paths().updateOne({_id},{$setOnInsert:{pairId,members,via,edgeIds:[job.edgeId,neighbor.edgeId]}},{upsert:true,session});
   if(inserted.upsertedCount)await pairs().updateOne({_id:pairId},[{
    $set:{
     members,
     mutualCount:{$add:[{$ifNull:['$mutualCount',0]},1]},
     previewIds:{$let:{
      vars:{prior:{$ifNull:['$previewIds',[]]}},
      in:{$cond:[{$in:[via,'$$prior']},'$$prior',{$slice:[{$concatArrays:['$$prior',[via]]},3]}]},
     }},
    },
   }],{upsert:true,session});
  }
  if(page.length<50){
   if(job.phase===1)await jobs().deleteOne({_id:job._id},{session});
   else await jobs().updateOne({_id:job._id},{$set:{phase:1,cursor:''}},{session});
  }else await jobs().updateOne({_id:job._id},{$set:{cursor:page.at(-1)!._id}},{session});
 });
}

async function removePage(job:Job){
 const page=await paths().find({edgeIds:job.edgeId}).sort({_id:1}).limit(50).toArray();
 await transaction(async session=>{
  const changed=new Set<string>();
  for(const path of page){
   const removed=await paths().deleteOne({_id:path._id},{session});
   if(!removed.deletedCount)continue;
   const updated=await pairs().findOneAndUpdate({_id:path.pairId,mutualCount:{$gt:0}},{$inc:{mutualCount:-1}},{session,returnDocument:'after'});
   if(updated?.mutualCount===0)await pairs().deleteOne({_id:path.pairId,mutualCount:0},{session});
   else if(updated)changed.add(path.pairId);
  }
  for(const pairId of changed)await refreshPreview(pairId,session);
  if(page.length<50){
   await jobs().deleteOne({_id:job._id},{session});
   if(await edges().findOne({_id:job.edgeId,status:'accepted'},{session,projection:{_id:1}})&&!await rows('blocks').findOne({pairId:job.edgeId},{session,projection:{_id:1}})&&await users().countDocuments({_id:{$in:job.members},suspendedAt:null},{session})===2)await enqueueCircleEdge(job.members[0],job.members[1],'add',session);
  }
 });
}

/** Existing accepted friendships are indexed in small background pages once. */
async function backfill(){
 await meta().updateOne({_id:'backfill'},{$setOnInsert:{cursor:'',done:false}},{upsert:true});
 let state=await meta().findOne({_id:'backfill'});if(state?.done&&Number(state.nextAt||0)>Date.now())return;
 if(state?.done){await meta().updateOne({_id:'backfill',done:true},{$set:{done:false,cursor:''}});state=await meta().findOne({_id:'backfill'});}
 const batch=await edges().find({status:'accepted',...(state?.cursor?{_id:{$gt:state.cursor}}:{})},{projection:{_id:1,members:1}}).sort({_id:1}).limit(20).toArray();
 await transaction(async session=>{
  for(const edge of batch)await jobs().updateOne({_id:`backfill:${edge._id}`},{$setOnInsert:{edgeId:edge._id,members:edge.members,kind:'add',phase:0,cursor:'',createdAt:new Date().toISOString()}},{upsert:true,session});
  await meta().updateOne({_id:'backfill'},{$set:{cursor:batch.at(-1)?._id||state?.cursor||'',done:batch.length<20,...(batch.length<20?{nextAt:Date.now()+86400000}:{})}},{session});
 });
}

/** Fill compact photo previews on pairs written by an earlier Circle worker. */
async function backfillPreviews(){
 await meta().updateOne({_id:'preview-backfill'},{$setOnInsert:{cursor:'',done:false}},{upsert:true});
 const state=await meta().findOne({_id:'preview-backfill'});if(state?.done)return;
 const batch=await pairs().find(state?.cursor?{_id:{$gt:state.cursor}}:{},{projection:{_id:1,mutualCount:1,previewIds:1}}).sort({_id:1}).limit(20).toArray();
 await transaction(async session=>{
  for(const pair of batch)if(pair.mutualCount>0&&!pair.previewIds?.length)await refreshPreview(pair._id,session);
  await meta().updateOne({_id:'preview-backfill'},{$set:{cursor:batch.at(-1)?._id||state?.cursor||'',done:batch.length<20}},{session});
 });
}

/** Slow indexed repair removes paths whose connection, block or account changed. */
async function repairPage(){
 await meta().updateOne({_id:'repair'},{$setOnInsert:{cursor:'',done:false}},{upsert:true});
 let state=await meta().findOne({_id:'repair'});if(state?.done&&Number(state.nextAt||0)>Date.now())return;
 if(state?.done){await meta().updateOne({_id:'repair',done:true},{$set:{done:false,cursor:''}});state=await meta().findOne({_id:'repair'});}
 const page=await paths().find(state?.cursor?{_id:{$gt:state.cursor}}:{}).sort({_id:1}).limit(50).toArray();
 const edgeIds=[...new Set(page.flatMap(path=>path.edgeIds))],userIds=[...new Set(page.flatMap(path=>[...path.members,path.via]))];
 const [active,blocked,available]=await Promise.all([
  edges().find({_id:{$in:edgeIds},status:'accepted'},{projection:{_id:1}}).limit(edgeIds.length).toArray(),
  rows('blocks').find({pairId:{$in:edgeIds}},{projection:{pairId:1}}).limit(edgeIds.length*2).toArray(),
  users().find({_id:{$in:userIds},suspendedAt:null},{projection:{_id:1}}).limit(userIds.length).toArray(),
 ]);
 const activeIds=new Set(active.map(row=>row._id)),blockedIds=new Set(blocked.map(row=>row.pairId)),availableIds=new Set(available.map(row=>row._id));
 await transaction(async session=>{
  const changed=new Set<string>();
  for(const path of page){
   if(path.edgeIds.every(id=>activeIds.has(id)&&!blockedIds.has(id))&&[...path.members,path.via].every(id=>availableIds.has(id)))continue;
   const removed=await paths().deleteOne({_id:path._id},{session});if(!removed.deletedCount)continue;
   const updated=await pairs().findOneAndUpdate({_id:path.pairId,mutualCount:{$gt:0}},{$inc:{mutualCount:-1}},{session,returnDocument:'after'});
   if(updated?.mutualCount===0)await pairs().deleteOne({_id:path.pairId,mutualCount:0},{session});
   else if(updated)changed.add(path.pairId);
  }
  for(const pairId of changed)await refreshPreview(pairId,session);
  await meta().updateOne({_id:'repair'},{$set:{cursor:page.at(-1)?._id||state?.cursor||'',done:page.length<50,...(page.length<50?{nextAt:Date.now()+3600000}:{})}},{session});
 });
}

export async function processCircleWork(){
 await meta().updateOne({_id:'worker'},{$setOnInsert:{leaseUntil:0}},{upsert:true});
 const lease=randomUUID(),claimed=await meta().findOneAndUpdate({_id:'worker',leaseUntil:{$lte:Date.now()}},{$set:{lease,leaseUntil:Date.now()+30000}},{returnDocument:'after'});
 if(!claimed)return;
 try{
  await backfill();
  await backfillPreviews();
  const job=await jobs().findOne({},{sort:{createdAt:1,_id:1}});
  if(job)await (job.kind==='add'?addPage(job):removePage(job));else await repairPage();
 }finally{await meta().updateOne({_id:'worker',lease},{$set:{leaseUntil:0}});}
}
export function startCircleWorker(){let stopped=false,running:Promise<unknown>|undefined;const tick=()=>{if(stopped||running)return;running=processCircleWork().catch(error=>console.error('Circle indexing:',error instanceof Error?error.name:'Error')).finally(()=>{running=undefined;});};tick();const timer=setInterval(tick,500);return async()=>{stopped=true;clearInterval(timer);await running;};}

export async function circleSummaries(viewerId:string,candidateIds:string[],session?:ClientSession){
 if(!candidateIds.length)return new Map<string,{mutualCount:number;previewIds:string[]}>();
 const found=await pairs().find({_id:{$in:candidateIds.map(id=>circlePairId(viewerId,id))}},{session,projection:{_id:1,mutualCount:1,previewIds:1}}).limit(candidateIds.length).toArray();
 const byPair=new Map(found.map(row=>[row._id,row]));return new Map(candidateIds.flatMap(id=>{const row=byPair.get(circlePairId(viewerId,id));return row?[[id,{mutualCount:row.mutualCount,previewIds:row.previewIds||[]}]]:[];}));
}
export async function circleCandidates(viewerId:string,limit:number,before?:string,session?:ClientSession){
 let cursor:{count:number;id:string}|null=null;
 if(before){try{const value=JSON.parse(Buffer.from(before,'base64url').toString());if(!Number.isInteger(value.count)||value.count<1||typeof value.id!=='string')throw Error();cursor=value;}catch{throw new AppError(422,'circle_cursor','Reload Circle.');}}
 const found=await pairs().find({members:viewerId,mutualCount:{$gt:0},...(cursor?{$or:[{mutualCount:{$lt:cursor.count}},{mutualCount:cursor.count,_id:{$gt:cursor.id}}]}:{})},{session}).sort({mutualCount:-1,_id:1}).limit(limit+1).toArray();
 const page=found.slice(0,limit),last=page.at(-1);
 return {items:page.map(row=>({id:row.members.find(id=>id!==viewerId)!,mutualCount:row.mutualCount})),nextCursor:found.length>limit&&last?Buffer.from(JSON.stringify({count:last.mutualCount,id:last._id})).toString('base64url'):null};
}
export async function circleMutualIds(viewerId:string,candidateId:string,limit:number,before?:string,session?:ClientSession){
 const found=await paths().find({pairId:circlePairId(viewerId,candidateId),...(before?{via:{$gt:before}}:{})},{session,projection:{via:1}}).sort({via:1}).limit(limit+1).toArray();
 const page=found.slice(0,limit);
 return {ids:page.map(row=>row.via),nextCursor:found.length>limit?page.at(-1)!.via:null};
}
