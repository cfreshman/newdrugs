import {randomUUID} from 'node:crypto';
import type {ClientSession} from 'mongodb';
import {rows,transaction,type Row} from '../db';
import type {Actor} from '../auth';
import {AppError,requireValue} from '../errors';
import {config} from '../config';
import {embed} from './embeddings';
import {DIMENSIONS,EMBEDDING_MODEL} from './model';
import {hashText,hybridRank,semanticCandidate} from './ranking';
import {queryRetrieval,retrievalEnabled} from './backend';
import {queueRetrieval} from './replication';
import type {LogSearchInput,LogSearchResult} from '../../shared/logSearch';
export const LOG_INDEX_VERSION=`private-log-v1:${EMBEDDING_MODEL}:${DIMENSIONS}`;
export interface LogSearchChunk {_id:string;entryId:string;date:string;ownerId:string;viewerIds:string[];memberCount:number;invitedCount:number;indexVersion:string;sourceHash:string;sourceRevision:string;text:string;snippet:string;vector:number[]}
interface Job {_id:string;viewerIds?:string[];revision:string;availableAt:number;attempts:number;lease?:string}
const jobs=()=>rows<Job>('logSearchJobs'),chunks=()=>rows<LogSearchChunk>('logSearchChunks');
export async function queueLogSearch(entryId:string,session?:ClientSession,viewers?:string[]){
 const previous=await jobs().findOne({_id:entryId},{session,projection:{viewerIds:1}}),source=viewers?null:await rows('logEntries').findOne({_id:entryId},{session,projection:{members:1}});
 const viewerIds=[...new Set([...(previous?.viewerIds||[]),...(viewers||source?.members as string[]||[])])];
 await jobs().updateOne({_id:entryId},{$set:{viewerIds,revision:randomUUID(),availableAt:Date.now(),attempts:0},$unset:{lease:''}},{session,upsert:true});
}
export function logPassages(row:Row){
 const metadata=[row.title,row.place,...(row.links as string[]||[])].filter(Boolean).join('\n').slice(0,1200),passages:{key:string;text:string;snippet:string}[]=[];
 if(metadata.trim())passages.push({key:'details',text:metadata,snippet:metadata});
 for(const contribution of row.contributions as {userId:string;note:string}[]||[]){
  if(!(row.members as string[]||[]).includes(contribution.userId)||!contribution.note?.trim())continue;
  for(let offset=0;offset<contribution.note.length;offset+=1800){const snippet=contribution.note.slice(offset,offset+2000);passages.push({key:`${contribution.userId}:${offset}`,text:snippet,snippet});if(offset+2000>=contribution.note.length)break;}
 }
 return passages;
}
export async function indexLogEntry(embedding=embed){
 const lease=randomUUID(),job=await jobs().findOneAndUpdate({availableAt:{$lte:Date.now()}},{$set:{lease,availableAt:Date.now()+120000},$inc:{attempts:1}},{sort:{availableAt:1},returnDocument:'after'});if(!job)return false;
 try{
  const source=await rows('logEntries').findOne({_id:job._id,deletedAt:{$exists:false}}),revision=String(source?.revision||0);
  const previous=await chunks().find({entryId:job._id}).limit(161).toArray(),next:LogSearchChunk[]=[];
  if(source)for(const part of logPassages(source)){
   const id=hashText(`${job._id}:${part.key}`),sourceHash=hashText(`${LOG_INDEX_VERSION}:${part.text}`),old=previous.find(chunk=>chunk._id===id&&chunk.sourceHash===sourceHash&&chunk.indexVersion===LOG_INDEX_VERSION);
   const vector=old?.vector||await embedding(part.text,'document',`log:${String(source.ownerId)}`);
   if(vector.length!==DIMENSIONS||!vector.every(Number.isFinite))throw Error('embedding_invalid');
   next.push({_id:id,entryId:job._id,ownerId:String(source.ownerId),viewerIds:source.members as string[],memberCount:(source.members as string[]).length,invitedCount:(source.invited as string[]||[]).length,date:String(source.date),sourceHash,sourceRevision:revision,indexVersion:LOG_INDEX_VERSION,text:part.text,snippet:part.snippet,vector});
   if(!(await jobs().updateOne({_id:job._id,revision:job.revision,lease},{$set:{availableAt:Date.now()+120000}})).matchedCount)return true;
  }
  await transaction(async session=>{
   if(!(await jobs().deleteOne({_id:job._id,revision:job.revision,lease},{session})).deletedCount)return;
   const current=await rows('logEntries').findOne({_id:job._id,deletedAt:{$exists:false}},{session,projection:{revision:1}});
   if(String(current?.revision||0)!==revision){await queueLogSearch(job._id,session);return;}
   await chunks().deleteMany({entryId:job._id},{session});if(next.length)await chunks().insertMany(next,{session});
   await rows('logSearchSources').updateOne({_id:job._id},{$set:{revision,indexVersion:LOG_INDEX_VERSION,chunks:next.length}},{session,upsert:true});
   await queueRetrieval('log',job._id,session,{viewerIds:[...new Set([...(job.viewerIds||[]),...(source?.members as string[]||[])])]});
  });
 }catch(error){await jobs().updateOne({_id:job._id,revision:job.revision,lease},{$set:{availableAt:Date.now()+Math.min(3600000,2000*2**Math.min(job.attempts,11)),error:error instanceof Error&&/^embedding_/.test(error.message)?error.message:'index_failure'},$unset:{lease:''}});}
 return true;
}
async function backfillLogSearch(){
 const state=await rows('logSearchMeta').findOne({_id:LOG_INDEX_VERSION});if(state?.done)return;
 const page=await rows('logEntries').find(state?.cursor?{_id:{$gt:String(state.cursor)}}:{}).sort({_id:1}).limit(30).project({_id:1,revision:1}).toArray();
 await transaction(async session=>{for(const row of page){if(!await rows('logSearchSources').findOne({_id:row._id,revision:String(row.revision||0),indexVersion:LOG_INDEX_VERSION},{session})&&!await jobs().findOne({_id:row._id},{session}))await queueLogSearch(row._id,session);}await rows('logSearchMeta').updateOne({_id:LOG_INDEX_VERSION},{$set:{cursor:page.at(-1)?._id||state?.cursor||'',done:page.length<30}},{session,upsert:true});});
}
export function startLogSearchWorker(){let stopped=false,pending:Promise<void>|undefined,cycles=0;const tick=()=>{if(stopped||pending||!retrievalEnabled()||!config.aiEnabled)return;pending=(async()=>{if(cycles++%10===0)await backfillLogSearch();for(let i=0;i<4&&!stopped&&await indexLogEntry();i++);})().catch(error=>console.error('Log indexing',{name:error.name})).finally(()=>{pending=undefined;});};const timer=setInterval(tick,2000);tick();return async()=>{stopped=true;clearInterval(timer);await pending;};}
interface Rank {id:string;sourceHash:string;sourceRevision:string;entryId:string;score:number;match:'text'|'semantic'}
interface Snapshot {_id:string;userId:string;identity:string;ranked:Rank[];input:LogSearchInput;mode:'hybrid'|'keyword';notices:string[];expiresAt:Date}
export async function searchLog(input:LogSearchInput,actor:Actor,embedding=embed):Promise<LogSearchResult>{
 if(!retrievalEnabled())throw new AppError(503,'search_unavailable','Log search is not configured yet.');
 if(input.from&&input.through&&input.from>input.through)throw new AppError(422,'log_dates','Choose an end date after the start date.');
 const userId=actor.userId,identity=hashText(JSON.stringify([input.query,input.from,input.through,input.personId,input.scope]));let snapshot:Snapshot,offset=0;
 if(input.cursor){const[id,position]=input.cursor.split('.');offset=Number(position);snapshot=requireValue(await rows<Snapshot>('logSearchResults').findOne({_id:id,userId,expiresAt:{$gt:new Date()}}),'This search expired. Search again.');if(snapshot.identity!==identity||!Number.isSafeInteger(offset)||offset<0||offset>snapshot.ranked.length)throw new AppError(409,'search_changed','Start this search again without a cursor.');}
 else{
  const rate=await rows<{_id:string;count:number}>('searchRates').findOneAndUpdate({_id:`log:${userId}:${Math.floor(Date.now()/60000)}`},{$inc:{count:1},$set:{expiresAt:new Date(Date.now()+120000)}},{upsert:true,returnDocument:'after'});if(rate&&rate.count>20)throw new AppError(429,'search_rate','Give search a moment before trying again.');
  const must:Record<string,unknown>[]=[{key:'indexVersion',match:{value:LOG_INDEX_VERSION}}];
  if(input.personId)must.push({key:'viewerIds',match:{value:input.personId}});
  if(input.scope==='private')must.push({key:'memberCount',match:{value:1}},{key:'invitedCount',match:{value:0}});
  if(input.scope==='shared')must.push({should:[{key:'memberCount',range:{gt:1}},{key:'invitedCount',range:{gt:0}}]});
  if(input.from||input.through)must.push({key:'createdAt',range:{...(input.from?{gte:`${input.from}T00:00:00Z`}:{}),...(input.through?{lte:`${input.through}T00:00:00Z`}:{})}});
  let vector:number[]|undefined;const notices:string[]=[];try{vector=await embedding(input.query,'query',`log:${userId}`);}catch{notices.push('Semantic search is temporarily unavailable. Showing keyword matches.');}
  const blocked=(await rows('blocks').find({members:userId},{projection:{members:1}}).toArray()).flatMap(row=>(row.members as string[]).filter(id=>id!==userId));
  let lanes;try{lanes=await queryRetrieval('log',userId,{query:input.query,vector,filter:{must,...(blocked.length?{must_not:[{key:'viewerIds',match:{any:blocked}}]}:{})}});}catch{throw new AppError(503,'search_unavailable','Log search is temporarily unavailable. Try again shortly.');}
  const dense=lanes.dense.filter(item=>semanticCandidate(item.score,lanes.lexical.find(other=>other.id===item.id)?.score));
  const textIds=new Set(lanes.lexical.map(item=>item.id));
  const ranked=[...lanes.lexical.map(item=>({...item,match:'text' as const})),...(vector?hybridRank(dense,lanes.lexical).filter(item=>!textIds.has(item.id)).map(item=>({...item,match:'semantic' as const})):[])];
  const metadata=new Map([...lanes.lexical,...dense].map(item=>[item.id,item]));
  // One best matching passage per entry, for variety without hiding the source.
  const seen=new Set<string>(),selected:Rank[]=[];for(const rank of ranked){const item=metadata.get(rank.id)!;if(seen.has(item.sourceKey))continue;seen.add(item.sourceKey);selected.push({id:item.id,sourceHash:item.sourceHash,sourceRevision:item.sourceRevision,entryId:item.sourceKey,score:rank.score,match:rank.match});if(selected.length===100)break;}
  snapshot={_id:randomUUID(),userId,identity,ranked:selected,input,mode:vector?'hybrid':'keyword',notices,expiresAt:new Date(Date.now()+600000)};await rows<Snapshot>('logSearchResults').insertOne(snapshot);const expired=await rows<Snapshot>('logSearchResults').find({userId}).sort({expiresAt:-1,_id:-1}).skip(20).limit(100).project({_id:1}).toArray();if(expired.length)await rows('logSearchResults').deleteMany({_id:{$in:expired.map(row=>row._id)}});
 }
 const items:LogSearchResult['items']=[],{logEntryFor}=await import('../log');
 while(offset<snapshot.ranked.length&&items.length<input.limit){
  const selected=snapshot.ranked.slice(offset,offset+Math.min(8,input.limit-items.length));offset+=selected.length;
  const stored=await chunks().find({_id:{$in:selected.map(item=>item.id)},viewerIds:userId,indexVersion:LOG_INDEX_VERSION}).toArray();
  const results=await Promise.all(selected.map(async rank=>{const chunk=stored.find(item=>item._id===rank.id&&item.sourceHash===rank.sourceHash&&item.sourceRevision===rank.sourceRevision);if(!chunk)return null;let row;try{row=await logEntryFor(userId,rank.entryId);}catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return null;throw error;}
   if(!row.members.includes(userId)||String(row.revision)!==rank.sourceRevision||input.personId&&!row.members.includes(input.personId)||input.from&&row.date<input.from||input.through&&row.date>input.through)return null;
   const shared=row.members.length>1||row.invited.length>0;if(input.scope==='shared'&&!shared||input.scope==='private'&&shared)return null;
   return {entryId:row._id,title:row.title,date:row.date,place:row.place,snippet:chunk.snippet.slice(0,500),score:rank.score,match:rank.match};}));items.push(...results.filter((value):value is LogSearchResult['items'][number]=>Boolean(value)));
 }
 const indexing=Boolean(await jobs().findOne({viewerIds:userId},{projection:{_id:1}}))||Boolean(await rows('retrievalJobs').findOne({kind:'log',viewerIds:userId},{projection:{_id:1}}))||!(await rows('logSearchMeta').findOne({_id:LOG_INDEX_VERSION}))?.done;
 return {items,nextCursor:offset<snapshot.ranked.length?`${snapshot._id}.${offset}`:null,mode:snapshot.mode,indexing,notices:[...snapshot.notices,...(indexing?['Recent or older Log entries are still being indexed.']:[])]};
}
