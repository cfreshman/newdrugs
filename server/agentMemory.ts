import type {ClientSession} from 'mongodb';
import {rows} from './db';
import {hash,type Actor} from './auth';
import {AppError,requireValue} from './errors';
import type {MemoryContext,MemoryNote,MemoryPressure,MemorySource} from '../shared/agentMemory';
import {workGate} from './workGate';
interface Note extends MemoryNote {_id:string;userId:string;sourceProofs:string[]}
interface State {_id:string;coreUsed:number;noncoreUsed:number;slots:number;coreSlots:number;revision:number}
const notes=()=>rows<Note>('agentMemorySlots'),states=()=>rows<State>('agentMemoryState'),sourceGate=workGate(8,256);
const empty=(userId:string):State=>({_id:userId,coreUsed:0,noncoreUsed:0,slots:0,coreSlots:0,revision:0});
export const memoryEstimate=(title:string,content:string,sources:MemorySource[])=>Math.ceil(Buffer.byteLength(title+'\n'+content+JSON.stringify(sources),'utf8')/3)+24;
export function pressure(state:State):MemoryPressure{
 const utilization=state.coreUsed/4000;
 return {coreUsed:state.coreUsed,coreLimit:4000,coreRemaining:Math.max(0,4000-state.coreUsed),coreSlots:state.coreSlots,coreSlotLimit:32,noncoreUsed:state.noncoreUsed,noncoreLimit:32000,slots:state.slots,slotLimit:128,utilization,status:state.coreUsed>=4000||state.coreSlots>=32?'full':utilization>=.8?'near_limit':'comfortable',estimator:'utf8-third-v1'};
}
const view=(note:Note):MemoryNote=>({key:note.key,title:note.title,content:note.content,core:note.core,sources:note.sources,revision:note.revision,estimatedTokens:note.estimatedTokens,updatedAt:note.updatedAt});
/** Evidence identity excludes counters and caller-specific presentation state. */
export function memorySourceContent(kind:MemorySource['kind'],value:Record<string,any>){
 const pick=(keys:string[])=>Object.fromEntries(keys.map(key=>[key,value[key]]));
 if(kind==='post')return pick(['id','userId','text','links','photos','createdAt','parentId','deleted','moderated']);
 if(kind==='person')return pick(['id','name','handle','bio','interests','city','area','photos','discoverable']);
 if(kind==='log')return {...pick(['id','ownerId','title','date','place','links','recurrence','historicalPeople']),contributors:value.contributors?.map((person:any)=>({userId:person.userId,note:person.note,files:person.files})),invitations:value.invitations?.map((person:any)=>person.userId)};
 return pick(['id','connectionId','fromId','text','files','createdAt','moderatedAt']);
}
async function proof(userId:string,source:MemorySource){
 if(source.kind==='chat'){
  const message=requireValue(await rows('messages').findOne({_id:source.id,userId},{projection:{role:1,text:1,files:1}}),'This chat message is unavailable.');
  return hash(JSON.stringify(message));
 }
 const {executeOperation}=await import('./operations');
 const operation=source.kind==='log'?'log.get':source.kind==='post'?'posts.get':source.kind==='person'?'people.get':'messages.get';
 const input=source.kind==='log'?{entryId:source.id}:source.kind==='post'?{postId:source.id}:source.kind==='person'?{personId:source.id}:{messageId:source.id};
 const result=await executeOperation(operation,input,{userId,source:'external',scope:'read'}) as {deleted?:boolean};
 if(result.deleted)throw new AppError(404,'source_unavailable','This source is unavailable.');
 return hash(JSON.stringify(memorySourceContent(source.kind,result)));
}
async function sourceStatus(note:Note,cache=new Map<string,Promise<string>>()){
 try{const proofs=await Promise.all(note.sources.map(source=>{const key=`${source.kind}:${source.id}`;if(!cache.has(key))cache.set(key,sourceGate.run(()=>proof(note.userId,source)));return cache.get(key)!;}));return proofs.every((value,index)=>value===note.sourceProofs[index])?'current' as const:'changed' as const;}
 catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return 'unavailable' as const;throw error;}
}
export async function personalInstructions(userId:string,session?:ClientSession){const row=await rows('agentInstructions').findOne({_id:userId},{session});return {text:String(row?.text||''),revision:Number(row?.revision||0)};}
export async function agentMemoryContext(userId:string):Promise<MemoryContext>{
 const [instructions,slots,state]=await Promise.all([personalInstructions(userId),notes().find({userId,core:true}).sort({key:1}).limit(32).toArray(),states().findOne({_id:userId})]);
 const cache=new Map<string,Promise<string>>(),checks=await Promise.all(slots.map(note=>sourceStatus(note,cache)));
 return {instructions,slots:slots.filter((_,i)=>checks[i]==='current').map(view),omittedSlots:checks.filter(status=>status!=='current').length,pressure:pressure(state||empty(userId))};
}
export async function memoryOperation(name:string,data:Record<string,unknown>,actor:Actor,session?:ClientSession){
 const userId=actor.userId;
 if(actor.background)throw new AppError(403,'memory_scope','Agent notes are available in your primary chat and connected agents.');
 if(name==='agent.instructions.get')return personalInstructions(userId,session);
 if(name==='agent.instructions.update'){
  const old=await personalInstructions(userId,session);if(old.revision!==data.revision)throw new AppError(409,'instructions_changed','Your instructions changed. Read them again before saving.');
  const result={text:String(data.text),revision:old.revision+1};await rows('agentInstructions').updateOne({_id:userId},{$set:{...result,updatedAt:new Date().toISOString()}},{session,upsert:true});return result;
 }
 if(name==='agent.memory.context')return agentMemoryContext(userId);
 const state=await states().findOne({_id:userId},{session})||empty(userId),used=pressure(state);
 if(name==='agent.memory.list'){
  const limit=Number(data.limit||20),found=await notes().find({userId,...(data.core===undefined?{}:{core:Boolean(data.core)}),...(data.before?{key:{$gt:String(data.before)}}:{})},{session,projection:{content:0,sourceProofs:0}}).sort({key:1}).limit(limit+1).toArray();
  return {items:found.slice(0,limit).map(note=>{const {content,...metadata}=view(note);return metadata;}),nextCursor:found.length>limit?found[limit-1].key:null,pressure:used};
 }
 const id=hash(JSON.stringify([userId,data.key])),previous=await notes().findOne({_id:id,userId},{session});
 if(name==='agent.memory.get'){const note=requireValue(previous,'This note is unavailable.');return {slot:{...view(note),sourceStatus:await sourceStatus(note)},pressure:used};}
 if(Number(data.revision)!==(previous?.revision||0))throw new AppError(409,'memory_changed','This note changed. Read it again before saving.');
 if(name==='agent.memory.delete'){
  requireValue(previous,'This note is unavailable.');await notes().deleteOne({_id:id,userId},{session});
  const next={...state,slots:state.slots-1,coreSlots:state.coreSlots-Number(previous!.core),coreUsed:state.coreUsed-(previous!.core?previous!.estimatedTokens:0),noncoreUsed:state.noncoreUsed-(previous!.core?0:previous!.estimatedTokens),revision:state.revision+1};await states().replaceOne({_id:userId},next,{session,upsert:true});return {deleted:true,pressure:pressure(next)};
 }
 if(name!=='agent.memory.save')throw new AppError(404,'operation','Unknown memory operation.');
 const core=Boolean(data.core),sources=data.sources as MemorySource[],estimatedTokens=memoryEstimate(String(data.title),String(data.content),sources);
 const next={...state,slots:state.slots+Number(!previous),coreSlots:state.coreSlots-Number(previous?.core||false)+Number(core),coreUsed:state.coreUsed-(previous?.core?previous.estimatedTokens:0)+(core?estimatedTokens:0),noncoreUsed:state.noncoreUsed-(previous&&!previous.core?previous.estimatedTokens:0)+(core?0:estimatedTokens),revision:state.revision+1};
 if(next.coreUsed>4000||next.coreSlots>32||next.noncoreUsed>32000||next.slots>128)return {saved:false,pressure:used,reason:next.coreUsed>4000||next.coreSlots>32?'Core memory is full. Shorten, merge or demote a note before retrying.':'Memory storage is full. Remove or shorten a note before retrying.'};
 const sourceProofs=await Promise.all(sources.map(source=>sourceGate.run(()=>proof(userId,source))));
 const note:Note={_id:id,userId,key:String(data.key),title:String(data.title),content:String(data.content),core,sources,sourceProofs,estimatedTokens,revision:(previous?.revision||0)+1,updatedAt:new Date().toISOString()};
 await notes().replaceOne({_id:id},note,{session,upsert:true});await states().replaceOne({_id:userId},next,{session,upsert:true});return {saved:true,slot:view(note),pressure:pressure(next)};
}
