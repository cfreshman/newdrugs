import {createHash,randomUUID} from 'node:crypto';
import type {ClientSession,Document} from 'mongodb';
import {rows,transaction} from './db';
import {users,type Actor} from './auth';
import {AppError} from './errors';
import type {LogContact} from '../shared/logJoining';
interface ContactSource {_id:string;members:string[];viewers:{userId:string;people:string[]}[]}
interface ContactCount {_id:string;userId:string;personId:string;count:number}
interface ContactState {_id:string;dirty?:boolean;generation?:number;revision?:number;cursor?:string|null;lease?:string;leaseUntil?:number;sourceRevision?:number}
const states=()=>rows<ContactState>('logContactStates'),counts=()=>rows<ContactCount>('logContactCounts'),sources=()=>rows<ContactSource>('logContactSources');
const counterId=(userId:string,personId:string)=>createHash('sha256').update(JSON.stringify([userId,personId])).digest('hex');
const generation=async(session?:ClientSession)=>Number((await rows('logContactMeta').findOne({_id:'moderation'},{session}))?.generation||0);
/** One entry contributes at most 20×19 counters. It never scans the owner's history. */
export async function syncLogContacts(entryId:string,session?:ClientSession):Promise<void>{
 if(!session)return transaction(session=>syncLogContacts(entryId,session));
 const entry=await rows('logEntries').findOne({_id:entryId},{session,projection:{members:1,deletedAt:1}}),prior=await sources().findOne({_id:entryId},{session});
 // Fence source edits against a concurrent backfill or repair.
 if(entry)await rows<{_id:string;contactIndexRevision:number}>('logEntries').updateOne({_id:entryId},{$inc:{contactIndexRevision:1}},{session});
 const members=entry&&!entry.deletedAt?entry.members as string[]:[];
 const suspended=members.length?await users().findOne({_id:{$in:members},suspendedAt:{$type:'string'}},{session,projection:{_id:1}}):null;
 const blocks=members.length?await rows('blocks').find({members:{$in:members}},{session,projection:{members:1}}).toArray():[];
 const viewers=suspended?[]:members.filter(userId=>!blocks.some(row=>{const pair=row.members as string[];return pair.includes(userId)&&pair.some(other=>other!==userId&&members.includes(other));})).map(userId=>({userId,people:members.filter(id=>id!==userId)}));
 const audience=[...new Set([...members,...(prior?.members||[])])].sort();
 for(const userId of audience)await states().updateOne({_id:userId},{$inc:{sourceRevision:1}},{upsert:true,session});
 const deltas=new Map<string,{userId:string;personId:string;change:number}>();
 for(const [records,change] of [[prior?.viewers||[],-1],[viewers,1]] as const)for(const viewer of records)for(const personId of viewer.people){const key=counterId(viewer.userId,personId),previous=deltas.get(key);deltas.set(key,{userId:viewer.userId,personId,change:(previous?.change||0)+change});}
 const writes=[...deltas].filter(([,row])=>row.change).map(([_id,row])=>({updateOne:{filter:{_id},update:{$setOnInsert:{userId:row.userId,personId:row.personId},$inc:{count:row.change}},upsert:true}}));
 if(writes.length)await counts().bulkWrite(writes,{session});
 await sources().replaceOne({_id:entryId},{members,viewers},{upsert:true,session});
}
export async function invalidateLogContacts(userIds:string[],session:ClientSession){for(const _id of [...new Set(userIds)].sort())await states().updateOne({_id},{$set:{dirty:true,cursor:null,leaseUntil:0},$inc:{revision:1}},{upsert:true,session});}
export async function invalidateAllLogContacts(session:ClientSession){await rows<{_id:string;generation:number}>('logContactMeta').updateOne({_id:'moderation'},{$inc:{generation:1}},{upsert:true,session});}
async function readyContacts(userId:string,session?:ClientSession){
 const current=await generation(session),state=await states().findOne({_id:userId},{session});
 if((state?.generation||0)!==current){await states().updateOne({_id:userId,generation:state?.generation},{$set:{dirty:true,generation:current,cursor:null,leaseUntil:0},$inc:{revision:1}},{session});if(!state)await states().updateOne({_id:userId},{$setOnInsert:{dirty:true,generation:current,cursor:null,revision:1}},{upsert:true,session});return false;}
 return !state?.dirty;
}
/** Keyset-page the maintained social graph, never the hangout collection. */
export async function listLogContacts(actor:Actor,input:{query?:string;limit?:number;before?:string},session?:ClientSession){
 const userId=actor.userId,ready=await readyContacts(userId,session),limit=input.limit||20,canReadFriends=!actor.background||actor.accountActivity;
 const blocked=(await rows('blocks').find({members:userId},{session,projection:{members:1}}).toArray()).flatMap(row=>(row.members as string[]).filter(id=>id!==userId));
 const signature=createHash('sha256').update(JSON.stringify([userId,input.query||'',canReadFriends])).digest('hex');let cursor:{count:number;id:string}|undefined;
 if(input.before){try{const value=JSON.parse(Buffer.from(input.before,'base64url').toString());if(value.signature!==signature||!Number.isInteger(value.count)||typeof value.id!=='string')throw Error();cursor=value;}catch{throw new AppError(422,'log_cursor','Reload the people picker.');}}
 const pipeline:Document[]=[{$match:{userId,count:{$gt:0},...(!ready?{_id:'unavailable'}:{})}},{$project:{_id:'$personId',count:1,friend:{$literal:false}}}];
 if(canReadFriends)pipeline.push({$unionWith:{coll:'connections',pipeline:[{$match:{members:userId,status:'accepted'}},{$project:{_id:{$arrayElemAt:[{$filter:{input:'$members',as:'person',cond:{$ne:['$$person',userId]}}},0]},count:{$literal:0},friend:{$literal:true}}}]}});
 pipeline.push({$group:{_id:'$_id',count:{$max:'$count'},friend:{$max:'$friend'}}},{$match:{_id:{$nin:[userId,...blocked]},...(cursor?{$or:[{count:{$lt:cursor.count}},{count:cursor.count,_id:{$gt:cursor.id}}]}:{})}},{$sort:{count:-1,_id:1}},{$lookup:{from:'users',localField:'_id',foreignField:'_id',pipeline:[{$match:{handle:{$type:'string'},suspendedAt:null}},{$project:{name:1,handle:1,photos:1}}],as:'person'}},{$unwind:'$person'});
 if(input.query){const expression=new RegExp(input.query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');pipeline.push({$match:{$or:[{'person.name':expression},{'person.handle':expression}]}});}
 pipeline.push({$limit:limit+1});
 const found=await counts().aggregate<{_id:string;count:number;friend:boolean;person:{name?:string;handle:string;photos?:string[]}}>(pipeline,{session,maxTimeMS:5000}).toArray(),page=found.slice(0,limit),last=page.at(-1);
 const items:LogContact[]=page.map(row=>({id:row._id,name:row.person.name||row.person.handle,handle:row.person.handle,...(row.person.photos?.[0]?{photoId:row.person.photos[0]}:{}),sharedHangouts:row.count,...(canReadFriends?{friend:row.friend}:{})}));
 const backfill=await rows('logContactMeta').findOne({_id:'backfill'},{session,projection:{done:1}});
 return {items,nextCursor:found.length>limit&&last?Buffer.from(JSON.stringify({signature,count:last.count,id:last._id})).toString('base64url'):null,indexing:!ready||!backfill?.done};
}
export async function backfillLogContacts(limit=20){
 const lease=randomUUID(),meta=rows('logContactMeta');await meta.updateOne({_id:'backfill'},{$setOnInsert:{done:false,cursor:null,leaseUntil:0}},{upsert:true});
 const state=await meta.findOneAndUpdate({_id:'backfill',done:false,leaseUntil:{$lte:Date.now()}},{$set:{lease,leaseUntil:Date.now()+60000}},{returnDocument:'after'});if(!state)return 0;
 const batch=await rows('logEntries').find(state.cursor?{_id:{$gt:String(state.cursor)}}:{},{projection:{_id:1}}).sort({_id:1}).limit(limit).toArray();
 try{for(const entry of batch)await syncLogContacts(entry._id);await meta.updateOne({_id:'backfill',lease},{$set:{cursor:batch.at(-1)?._id||state.cursor,done:batch.length<limit,leaseUntil:0}});return batch.length;}catch(error){await meta.updateOne({_id:'backfill',lease},{$set:{leaseUntil:0}});throw error;}
}
export async function repairLogContacts(limit=20){
 const lease=randomUUID(),state=await states().findOneAndUpdate({dirty:true,$or:[{leaseUntil:{$lte:Date.now()}},{leaseUntil:{$exists:false}}]},{$set:{lease,leaseUntil:Date.now()+60000}},{returnDocument:'after'});if(!state)return 0;
 const batch=await rows('logEntries').find({members:state._id,...(state.cursor?{_id:{$gt:state.cursor}}:{})},{projection:{_id:1}}).sort({_id:1}).limit(limit).toArray();
 try{for(const entry of batch)await syncLogContacts(entry._id);await states().updateOne({_id:state._id,lease,revision:state.revision},{$set:{cursor:batch.at(-1)?._id||state.cursor,dirty:batch.length===limit,leaseUntil:0}});return batch.length;}catch(error){await states().updateOne({_id:state._id,lease,revision:state.revision},{$set:{leaseUntil:0}});throw error;}
}
export function startLogContactWorker(){let stopped=false,running:Promise<unknown>|undefined;const tick=()=>{if(stopped||running)return;running=backfillLogContacts().then(()=>repairLogContacts()).catch(error=>console.error('Log contact indexing:',error.name)).finally(()=>{running=undefined;});};tick();const timer=setInterval(tick,1000);return async()=>{stopped=true;clearInterval(timer);await running;};}
