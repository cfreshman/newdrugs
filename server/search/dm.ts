import {randomUUID} from 'node:crypto';
import type {ClientSession} from 'mongodb';
import type {Actor} from '../auth';
import {users} from '../auth';
import {rows,transaction,type Row} from '../db';
import {AppError,requireValue} from '../errors';
import {config} from '../config';
import {embed} from './embeddings';
import {DIMENSIONS,EMBEDDING_MODEL} from './model';
import {hashText,words} from './ranking';
import {queryRetrieval,retrievalEnabled} from './backend';
import {queueRetrieval} from './replication';
import type {DMSearchInput,DMSearchResult} from '../../shared/dmSearch';

export const DM_INDEX_VERSION=`private-dm-v1:${EMBEDDING_MODEL}:${DIMENSIONS}`;
interface Job {_id:string;messageId:string;revision:string;attempts:number;availableAt:number;lease?:string;error?:string}
export interface DMSearchChunk {_id:string;messageId:string;connectionId:string;viewerIds:string[];sourceHash:string;indexVersion:string;text:string;offset:number;createdAt:string;vector:number[]}
interface Ranked {messageId:string;connectionId:string;sourceHash:string;score:number;offset:number}
interface Snapshot {_id:string;userId:string;identity:string;ranked:Ranked[];mode:'hybrid'|'keyword';indexing:boolean;notices:string[];expiresAt:Date}
const jobs=()=>rows<Job>('dmSearchJobs'),chunks=()=>rows<DMSearchChunk>('dmSearchChunks'),snapshots=()=>rows<Snapshot>('dmSearchResults');
const searchable=(message:Row|null)=>Boolean(message&&typeof message.text==='string'&&message.text.trim()&&!message.moderatedAt);
export const dmMessageHash=(message:Row,viewerIds:string[])=>hashText(JSON.stringify([DM_INDEX_VERSION,message.connectionId,message.fromId,message.text,Boolean(message.moderatedAt),viewerIds]));
export async function enqueueDMSearch(messageId:string,session?:ClientSession){await jobs().updateOne({_id:hashText(messageId)},{$set:{messageId,revision:randomUUID(),attempts:0,availableAt:Date.now()},$unset:{lease:'',error:''}},{session,upsert:true});}

export async function indexDMMessage(embedding=embed){
 const lease=randomUUID(),job=await jobs().findOneAndUpdate({availableAt:{$lte:Date.now()}},{$set:{lease,availableAt:Date.now()+300000},$inc:{attempts:1}},{sort:{availableAt:1},returnDocument:'after'});
 if(!job)return false;
 try{
  const message=await rows('directMessages').findOne({_id:job.messageId});
  const connection=message&&await rows('connections').findOne({_id:String(message.connectionId)});
  const viewerIds=connection&&Array.isArray(connection.members)?connection.members as string[]:[];
  const sourceHash=message&&connection?dmMessageHash(message,viewerIds):'';
  const existing=await chunks().find({messageId:job.messageId}).limit(3).toArray();
  const next:DMSearchChunk[]=[];
  if(searchable(message)&&viewerIds.length===2){
   const text=String(message!.text),previous=existing.find(part=>part.text===text&&part.sourceHash===sourceHash&&part.indexVersion===DM_INDEX_VERSION);
   const vector=previous?.vector||await embedding(text,'document',`dm:${message!.connectionId}`);
   if(vector.length!==DIMENSIONS||!vector.every(Number.isFinite))throw Error('embedding_invalid');
   next.push({_id:hashText(`dm:${job.messageId}`),messageId:job.messageId,connectionId:String(message!.connectionId),viewerIds,sourceHash,indexVersion:DM_INDEX_VERSION,text,offset:0,createdAt:String(message!.createdAt),vector});
   const held=await jobs().updateOne({_id:job._id,revision:job.revision,lease},{$set:{availableAt:Date.now()+300000}});if(!held.matchedCount)return true;
  }
  await transaction(async session=>{
   const owned=await jobs().deleteOne({_id:job._id,revision:job.revision,lease},{session});if(!owned.deletedCount)return;
   const current=await rows('directMessages').findOne({_id:job.messageId},{session}),currentConnection=current&&await rows('connections').findOne({_id:String(current.connectionId)},{session}),currentViewers=currentConnection&&Array.isArray(currentConnection.members)?currentConnection.members as string[]:[];
   if((current&&currentConnection?dmMessageHash(current,currentViewers):'')!==sourceHash){await enqueueDMSearch(job.messageId,session);return;}
   await chunks().deleteMany({messageId:job.messageId},{session});if(next.length)await chunks().insertMany(next,{session});
   await queueRetrieval('dm',job.messageId,session,{viewerIds});
  });
 }catch(error){
  const code=error instanceof Error&&/^embedding_/.test(error.message)?error.message:'index_failure';
  await jobs().updateOne({_id:job._id,revision:job.revision,lease},{$set:{error:code,availableAt:Date.now()+Math.min(3600000,2000*2**Math.min(job.attempts,11))},$unset:{lease:''}});
  console.error('DM indexing retry',{error:code});
 }
 return true;
}

export async function backfillDMSearch(){
 const state=await rows('dmSearchMeta').findOne({_id:DM_INDEX_VERSION});if(state?.done)return;
 const messages=await rows('directMessages').find(state?.cursor?{_id:{$gt:String(state.cursor)}}:{}).sort({_id:1}).limit(50).project<Row>({_id:1,connectionId:1,moderatedAt:1,text:1}).toArray();
 await transaction(async session=>{
  for(const message of messages)if(searchable(message)&&!await chunks().findOne({messageId:message._id,indexVersion:DM_INDEX_VERSION},{session,projection:{_id:1}})&&!await jobs().findOne({messageId:message._id},{session,projection:{_id:1}}))await enqueueDMSearch(message._id,session);
  await rows('dmSearchMeta').updateOne({_id:DM_INDEX_VERSION},{$set:{cursor:messages.at(-1)?._id||state?.cursor||'',done:messages.length<50}},{session,upsert:true});
 });
}
export function startDMSearchWorker(){let stopped=false,pending:Promise<void>|undefined,cycles=0;const tick=()=>{if(stopped||pending||!config.aiEnabled)return;pending=(async()=>{if(cycles++%10===0)await backfillDMSearch();for(let i=0;i<4&&!stopped&&await indexDMMessage();i++);})().catch(error=>console.error('DM search worker:',error instanceof Error?error.name:'Error')).finally(()=>{pending=undefined;});};const timer=setInterval(tick,2000);tick();return async()=>{stopped=true;clearInterval(timer);await pending;};}

export async function searchDM(input:DMSearchInput,actor:Actor,embedding=embed):Promise<DMSearchResult>{
 const userId=actor.userId;requireValue(await users().findOne({_id:userId,handle:{$type:'string'}}),'Create an account to search messages.');
 if(!retrievalEnabled())throw new AppError(503,'search_unavailable','Message search is temporarily unavailable.');
 if(input.connectionId){const connection=requireValue(await rows('connections').findOne({_id:input.connectionId,members:userId,$or:[{status:'accepted'},{initialInvitation:{$exists:true}}]}),'This conversation is unavailable.');const other=(connection.members as string[]).find(id=>id!==userId);if(await rows('blocks').findOne({members:{$all:[userId,other]}})||await users().findOne({_id:other,suspendedAt:{$type:'string'}},{projection:{_id:1}}))throw new AppError(404,'unavailable','This conversation is unavailable.');}
 const identity=hashText(JSON.stringify([input.query.trim(),input.connectionId||''])),limit=input.limit||20;
 let snapshot:Snapshot,offset=0;
 if(input.cursor){const [id,position]=input.cursor.split('.');offset=Number(position);snapshot=requireValue(await snapshots().findOne({_id:id,userId,expiresAt:{$gt:new Date()}}),'This search expired. Search again.');if(snapshot.identity!==identity||!Number.isSafeInteger(offset)||offset<0||offset>snapshot.ranked.length)throw new AppError(409,'search_changed','Start this search again without a cursor.');}
 else{
  if(actor.source!=='browser'){const rateId=`dm:${userId}:${Math.floor(Date.now()/60000)}`,rate=await rows<{_id:string;count:number}>('searchRates').findOneAndUpdate({_id:rateId},{$inc:{count:1},$set:{expiresAt:new Date(Date.now()+120000)}},{upsert:true,returnDocument:'after'});if(rate&&rate.count>20)throw new AppError(429,'search_rate','Give search a moment before trying again.');}
  let vector:number[]|undefined;const notices:string[]=[];try{vector=await embedding(input.query,'query',`dm:${userId}`);}catch{notices.push('Semantic search is temporarily unavailable. Showing keyword matches.');}
  let lanes;try{lanes=await queryRetrieval('dm',userId,{query:input.query,vector,filter:{must:[{key:'indexVersion',match:{value:DM_INDEX_VERSION}},...(input.connectionId?[{key:'connectionId',match:{value:input.connectionId}}]:[])]}});}catch{throw new AppError(503,'search_unavailable','Message search is temporarily unavailable.');}
  const lexicalScores=new Map(lanes.lexical.map(hit=>[hit.id,hit.score])),ranked=new Map<string,Ranked>();
  const offer=(hit:typeof lanes.lexical[number],score:number)=>{if(!hit.messageId||!hit.connectionId)return;const value={messageId:hit.messageId,connectionId:hit.connectionId,sourceHash:hit.sourceHash,offset:hit.offset||0,score};if((ranked.get(value.messageId)?.score||-1)<score)ranked.set(value.messageId,value);};
  for(const hit of lanes.dense){const lex=lexicalScores.get(hit.id)||0;if(hit.score>=(lex>0?.2:.23))offer(hit,.9*Math.max(0,hit.score)+.1*lex/(lex+3));}
  // A literal word match should lead the result list, followed by semantic matches.
  for(const hit of lanes.lexical)offer(hit,vector?1+hit.score/(hit.score+3):hit.score);
  const indexing=!(await rows('dmSearchMeta').findOne({_id:DM_INDEX_VERSION}))?.done||Boolean(await rows('retrievalJobs').findOne({kind:'dm',viewerIds:userId},{projection:{_id:1}}));
  if(indexing)notices.push('Some messages are still being indexed.');
  snapshot={_id:randomUUID(),userId,identity,ranked:[...ranked.values()].sort((a,b)=>b.score-a.score||a.messageId.localeCompare(b.messageId)).slice(0,100),mode:vector?'hybrid':'keyword',indexing,notices,expiresAt:new Date(Date.now()+600000)};
  await snapshots().insertOne(snapshot);const old=await snapshots().find({userId}).sort({expiresAt:-1}).skip(20).project({_id:1}).toArray();if(old.length)await snapshots().deleteMany({userId,_id:{$in:old.map(row=>row._id)}});
 }
 const items:DMSearchResult['items']=[],queryTerms=words(input.query).filter(term=>term.length>=3).sort((a,b)=>b.length-a.length);
 while(offset<snapshot.ranked.length&&items.length<limit){const page=snapshot.ranked.slice(offset,offset+limit-items.length);offset+=page.length;
  const messages=await rows('directMessages').find({_id:{$in:page.map(row=>row.messageId)},moderatedAt:{$exists:false}}).toArray();
  const connections=await rows('connections').find({_id:{$in:[...new Set(messages.map(row=>String(row.connectionId)))]},members:userId,$or:[{status:'accepted'},{initialInvitation:{$exists:true}}]}).toArray();
  const blocked=await rows('blocks').find({members:userId},{projection:{members:1}}).limit(1001).toArray();if(blocked.length>1000)throw new AppError(422,'block_limit','Please contact support about your block list.');
  const blockedIds=new Set(blocked.flatMap(row=>(row.members as string[]).filter(id=>id!==userId)));
  const people=await users().find({_id:{$in:[...new Set(connections.flatMap(row=>(row.members as string[]).filter(id=>id!==userId)))]}},{projection:{name:1,handle:1,photos:1,suspendedAt:1}}).toArray();
  for(const rank of page){const message=messages.find(row=>row._id===rank.messageId),connection=connections.find(row=>row._id===rank.connectionId&&row._id===message?.connectionId);if(!message||!connection||dmMessageHash(message,connection.members as string[])!==rank.sourceHash)continue;const personId=(connection.members as string[]).find(id=>id!==userId)!;if(blockedIds.has(personId))continue;const person=people.find(row=>row._id===personId);if(!person||person.suspendedAt)continue;const text=String(message.text),lower=text.toLowerCase(),exact=lower.indexOf(input.query.trim().toLowerCase()),term=queryTerms.map(word=>lower.indexOf(word)).find(index=>index>=0),matchAt=exact>=0?exact:term??rank.offset,start=Math.max(0,matchAt-80);items.push({id:message._id,connectionId:connection._id,fromId:String(message.fromId),text:text.slice(start,start+500),createdAt:String(message.createdAt),score:rank.score,person:{id:personId,name:String(person.name||person.handle||'Member'),...(person.handle?{handle:String(person.handle)}:{}),...(person.photos?.[0]?{photoId:String(person.photos[0])}:{})}});}
 }
 return {items,nextCursor:offset<snapshot.ranked.length?`${snapshot._id}.${offset}`:null,mode:snapshot.mode,indexing:snapshot.indexing,notices:snapshot.notices};
}
