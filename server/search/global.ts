import type {Actor} from '../auth';
import {AppError} from '../errors';
import {config} from '../config';
import {destinationPath,type Destination} from '../../shared/navigation';
import type {GlobalSearchInput,GlobalSearchSource,GlobalSearchGroup,GlobalSearchResult} from '../../shared/globalSearch';
import {embed} from './embeddings';
import {searchPublic} from './retrieve';
import {searchLog} from './log';
import {searchChat} from './chat';
import {searchDM} from './dm';

const sources:GlobalSearchSource[]=['public','log','chat','messages'];
const link=(destination:Destination)=>new URL(destinationPath(destination),config.uiOrigin).href;
const unavailable=(error:unknown)=>error instanceof AppError?error.message:'Search is temporarily unavailable.';

/** Search each authorized index independently. Scores are never compared across datasets. */
export async function searchGlobal(input:GlobalSearchInput,actor:Actor):Promise<GlobalSearchResult>{
 const allowed=(source:GlobalSearchSource)=>!actor.background||source==='public'||source==='log'&&Boolean(actor.logAccess)||source==='chat'&&Boolean(actor.privateChat)||source==='messages'&&Boolean(actor.accountActivity);
 const selected=input.sources?.length?[...new Set(input.sources)]:sources.filter(allowed);
 if(selected.some(source=>!allowed(source)))throw new AppError(403,'data_access','This search source is outside this agent’s data access.');
 const limit=input.limitPerSource||5;
 // One query embedding can serve all four indexes. Source reads still enforce their own authorization.
 let vector:number[]|undefined;try{vector=await embed(input.query,'query',`global:${actor.userId}`);}catch{/* each source falls back to lexical retrieval */}
 const reuse=async()=>{if(!vector)throw Error('embedding_unavailable');return vector;};
 const tasks=selected.map(async(source):Promise<GlobalSearchGroup>=>{
  if(source==='public'){
   const result=await searchPublic({query:input.query,datasets:['profiles','posts','replies','spaces'],mode:'hybrid',limit},actor,vector);
   return {source,items:result.matches.map(match=>{
    const record=match.record&&typeof match.record==='object'?match.record as Record<string,unknown>:{},kind=match.entityType==='space'?'talk':match.entityType;
    const title=kind==='person'?String(record.name||record.handle||'Person'):kind==='talk'?String(record.title||'Talk'):String(record.text||'Post').slice(0,100);
    const destination:Destination=kind==='person'?{view:'person',resourceId:match.entityId}:kind==='talk'?{view:'spaces',resourceId:match.entityId}:{view:'post',resourceId:match.entityId};
    return {kind,id:match.entityId,title,snippet:match.evidence.map(part=>part.text).join(' ').slice(0,500),url:link(destination)};
   }),nextCursor:result.nextCursor,notices:result.retrieval.notices};
  }
  if(source==='log'){
   const result=await searchLog({query:input.query,scope:'all',limit},actor,reuse);
   return {source,items:result.items.map(row=>({kind:'log' as const,id:row.entryId,title:row.title||row.date,snippet:row.snippet,url:link({view:'log',resourceId:row.entryId})})),nextCursor:result.nextCursor,notices:result.notices};
  }
  if(source==='chat'){
   const result=await searchChat({query:input.query,role:'all',limit},actor,reuse);
   return {source,items:result.items.map(row=>({kind:'chat' as const,id:row.id,title:row.role==='user'?'You':'Agent',snippet:row.text,url:link({view:'chat',resourceId:row.id})})),nextCursor:result.nextCursor,notices:result.notices};
  }
  const result=await searchDM({query:input.query,limit},actor,reuse);
  return {source,items:result.items.map(row=>({kind:'message' as const,id:row.id,title:row.person.handle?`@${row.person.handle}`:row.person.name,snippet:row.text,url:link({view:'messages',resourceId:row.connectionId,messageId:row.id})})),nextCursor:result.nextCursor,notices:result.notices};
 });
 const settled=await Promise.allSettled(tasks),groups:GlobalSearchGroup[]=[],errors:GlobalSearchResult['errors']=[];
 settled.forEach((result,index)=>{if(result.status==='fulfilled')groups.push(result.value);else errors.push({source:selected[index],message:unavailable(result.reason)});});
 if(!groups.length&&errors.length)throw new AppError(503,'search_unavailable','Search is temporarily unavailable. Try again shortly.');
 return {groups,errors};
}
