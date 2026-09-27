import {randomUUID} from 'node:crypto';
import type {ClientSession} from 'mongodb';
import {rows,transaction} from '../db';
import {hash} from '../auth';
import {purgeRetrievalChat,replaceRetrievalSource,retrievalEnabled,retrievalRevisions,type RetrievalDocument} from './backend';
import type {SearchDocument} from './model';
interface Job {_id:string;kind:'public'|'chat'|'log'|'chat_purge';sourceKey:string;userId?:string;generation?:number;revision:string;availableAt:number;attempts:number;lease?:string}
const jobs=()=>rows<Job>('retrievalJobs');
export async function queueRetrieval(kind:Job['kind'],sourceKey:string,session?:ClientSession,details:{userId?:string;generation?:number}={}){
 if(!retrievalEnabled())return;
 await jobs().updateOne({_id:hash(`${kind}:${sourceKey}`)},{$set:{kind,sourceKey,...details,revision:randomUUID(),availableAt:Date.now(),attempts:0},$unset:{lease:''}},{session,upsert:true});
}
export function publicRetrievalDocument(doc:SearchDocument):RetrievalDocument{
 const coordinates=doc.area?.point.coordinates;
 return {id:doc._id,sourceKey:doc._id,kind:'public',ownerId:doc.ownerId,sourceHash:doc.sourceHash,sourceRevision:doc.sourceRevision,indexVersion:doc.indexVersion,text:doc.text,vector:doc.vector!,dataset:doc.dataset,entityId:doc.entityId,createdAt:doc.createdAt,...(coordinates?{area:{lon:coordinates[0],lat:coordinates[1]}}:{}),interests:doc.evidence.filter(item=>item.field==='interests').flatMap(item=>item.text.toLowerCase().split(', '))};
}
export async function replicateRetrievalOne(replace=replaceRetrievalSource,purge=purgeRetrievalChat){
 if(!retrievalEnabled())return false;
 const lease=randomUUID(),job=await jobs().findOneAndUpdate({availableAt:{$lte:Date.now()}},{$set:{lease,availableAt:Date.now()+120000},$inc:{attempts:1}},{sort:{availableAt:1},returnDocument:'after'});if(!job)return false;
 try{
  if(job.kind==='public'){
   const source=await rows<SearchDocument>('searchDocuments').findOne({_id:job.sourceKey});
   await replace('public',job.sourceKey,source?.vector?[publicRetrievalDocument(source)]:[]);
  }else if(job.kind==='log'){
   const parts=await rows<import('./log').LogSearchChunk>('logSearchChunks').find({entryId:job.sourceKey}).limit(161).toArray();if(parts.length>160)throw Error('retrieval_source_too_large');
   await replace('log',job.sourceKey,parts.map(part=>({id:part._id,sourceKey:part.entryId,kind:'log',ownerId:part.ownerId,viewerIds:part.viewerIds,memberCount:part.memberCount,invitedCount:part.invitedCount,sourceHash:part.sourceHash,sourceRevision:part.sourceRevision,indexVersion:part.indexVersion,text:part.text,vector:part.vector,createdAt:`${part.date}T00:00:00Z`})));
  }else if(job.kind==='chat_purge')await purge(job.userId!,job.generation!);
  else{
   // Old chunks predate generation metadata. Read their current owner generation
   // in the same snapshot, so a simultaneous clear cannot relabel old content.
   const {parts,generation}=await transaction(async session=>{const owner=await rows('users').findOne({_id:job.userId!},{session,projection:{chatGeneration:1}});return {parts:await rows('chatSearchChunks').find({userId:job.userId,messageId:job.sourceKey},{session}).limit(201).toArray(),generation:Number(owner?.chatGeneration||0)};});if(parts.length>200)throw Error('retrieval_source_too_large');
   const documents:RetrievalDocument[]=parts.map(part=>({id:part._id,sourceKey:job.sourceKey,kind:'chat',ownerId:job.userId!,viewerIds:[job.userId!],generation:Number(part.generation??generation),sourceHash:String(part.sourceHash),sourceRevision:String(part.sourceHash),indexVersion:String(part.indexVersion),text:String(part.text),vector:part.vector as number[],messageId:String(part.messageId),offset:Number(part.offset),role:String(part.role),createdAt:String(part.createdAt)}));
   await replace('chat',job.sourceKey,documents);
  }
  const removed=await jobs().deleteOne({_id:job._id,revision:job.revision,lease});
  if(!removed.deletedCount){
   // A source edit/clear can win while the remote request is in flight. Preserve
   // its job, or schedule a repair if a newer worker has already consumed it.
   await jobs().updateOne({_id:job._id},{$setOnInsert:{kind:job.kind,sourceKey:job.sourceKey,userId:job.userId,generation:job.generation,revision:randomUUID(),availableAt:Date.now(),attempts:0}},{upsert:true});
  }
 }catch(error){
  await jobs().updateOne({_id:job._id,revision:job.revision,lease},{$set:{availableAt:Date.now()+Math.min(3600000,1000*2**Math.min(job.attempts,12)),error:'retrieval_sync_failed'},$unset:{lease:''}});
  console.error('Retrieval sync retry',{kind:job.kind,name:error instanceof Error?error.name:'Error'});
 }
 return true;
}
/** Bounded resumable backfill also becomes a periodic reconciliation sweep. */
export async function backfillRetrieval(){
 if(!retrievalEnabled())return;
 for(const kind of ['public','chat','log'] as const){
  const state=await rows('retrievalMeta').findOne({_id:`backfill:${kind}`});
  if(state?.done&&Number(state.againAt)>Date.now())continue;
  const cursor=!state?.done&&state?.cursor?String(state.cursor):undefined;
  const collection=rows(kind==='public'?'searchDocuments':kind==='log'?'logSearchChunks':'chatSearchChunks');
  const page=await collection.find(cursor?{_id:{$gt:cursor}}:{}).sort({_id:1}).limit(50).project({_id:1,userId:1,messageId:1,entryId:1,sourceHash:1,sourceRevision:1,indexVersion:1}).toArray();
  const remote=await retrievalRevisions(kind,page.map(row=>row._id));
  await transaction(async session=>{
   for(const row of page){const found=remote.get(row._id);if(found?.sourceRevision===(row.sourceRevision||row.sourceHash)&&found?.indexVersion===row.indexVersion)continue;const sourceKey=kind==='public'?row._id:kind==='log'?String(row.entryId):String(row.messageId),id=hash(`${kind}:${sourceKey}`);await jobs().updateOne({_id:id},{$setOnInsert:{kind,sourceKey,...(kind==='chat'?{userId:String(row.userId)}:{}),revision:randomUUID(),availableAt:Date.now(),attempts:0}},{session,upsert:true});}
   await rows('retrievalMeta').updateOne({_id:`backfill:${kind}`},{$set:{cursor:page.at(-1)?._id||'',done:page.length<50,againAt:Date.now()+3600000}},{session,upsert:true});
  });
 }
}
export function startRetrievalWorker(){let stopped=false,pending:Promise<void>|undefined,cycles=0;const tick=()=>{if(stopped||pending||!retrievalEnabled())return;pending=(async()=>{if(cycles++%30===0)await backfillRetrieval();for(let i=0;i<8&&!stopped&&await replicateRetrievalOne();i++);})().catch(error=>console.error('Retrieval worker',{name:error.name})).finally(()=>{pending=undefined;});};const timer=setInterval(tick,2000);tick();return async()=>{stopped=true;clearInterval(timer);await pending;};}
