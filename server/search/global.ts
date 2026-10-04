import type {Actor} from '../auth';
import {AppError} from '../errors';
import {config} from '../config';
import {destinationPath,type Destination} from '../../shared/navigation';
import type {GlobalSearchInput,GlobalSearchSource,GlobalSearchItem,GlobalSearchResult} from '../../shared/globalSearch';
import {embed} from './embeddings';
import {searchPublic} from './retrieve';
import {searchLog,LOG_INDEX_VERSION} from './log';
import {searchChat,CHAT_INDEX_VERSION} from './chat';
import {searchDM,DM_INDEX_VERSION} from './dm';
import {queryRetrieval,type RetrievalKind} from './backend';
import {words} from './ranking';

const sources:GlobalSearchSource[]=['public','log','chat','messages'];
const CANDIDATES_PER_SOURCE=30;
const link=(destination:Destination)=>new URL(destinationPath(destination),config.uiOrigin).href;
const unavailable=(error:unknown)=>error instanceof AppError?error.message:'Search is temporarily unavailable.';
type Candidate=Omit<GlobalSearchItem,'score'>&{semantic:number};

export function rankGlobalCandidates(candidates:Candidate[],query:string,limit:number):GlobalSearchItem[]{
 const terms=[...new Set(words(query))],phrase=query.trim().toLocaleLowerCase('en-US');
 return candidates.map(({semantic,...item})=>{
  const text=`${item.title} ${item.snippet}`.normalize('NFKC').toLocaleLowerCase('en-US'),found=new Set(words(text));
  const lexical=terms.length?terms.filter(term=>found.has(term)).length/terms.length:phrase.length>0&&text.includes(phrase)?1:0;
  // Uniform for every source. Neither source order nor source-specific rank is a boost.
  const score=.8*Math.max(0,Math.min(1,semantic))+.2*lexical;
  return {...item,score};
 }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)||a.url.localeCompare(b.url)).slice(0,limit);
}

/** The same embedding model gives a comparable cosine score for all four indexes. */
async function semanticScores(kind:RetrievalKind,userId:string,vector:number[]|undefined,indexVersion:string){
 const scores=new Map<string,number>();if(!vector)return scores;
 try{const hits=await queryRetrieval(kind,userId,{query:'',vector,limit:150,filter:{must:[{key:'indexVersion',match:{value:indexVersion}}]}});
  for(const hit of hits.dense){const id=kind==='log'?hit.sourceKey:hit.messageId;if(id)scores.set(id,Math.max(scores.get(id)||0,hit.score));}
 }catch{/* Authorized lexical results still rank when semantic retrieval is unavailable. */}
 return scores;
}

/** Each source authorizes and hydrates candidates; one shared formula orders the union. */
export async function searchGlobal(input:GlobalSearchInput,actor:Actor):Promise<GlobalSearchResult>{
 const allowed=(source:GlobalSearchSource)=>!actor.background||source==='public'||source==='log'&&Boolean(actor.logAccess)||source==='chat'&&Boolean(actor.privateChat)||source==='messages'&&Boolean(actor.accountActivity);
 const selected=input.sources?.length?[...new Set(input.sources)]:sources.filter(allowed);
 if(selected.some(source=>!allowed(source)))throw new AppError(403,'data_access','This search source is outside this agent’s data access.');
 let vector:number[]|undefined;try{vector=await embed(input.query,'query',`global:${actor.userId}`);}catch{/* Lexical search remains available. */}
 const reuse=async()=>{if(!vector)throw Error('embedding_unavailable');return vector;};
 const tasks=selected.map(async(source):Promise<{candidates:Candidate[];notices:string[]}>=>{
  if(source==='public'){
   const result=await searchPublic({query:input.query,datasets:['profiles','posts','replies','spaces'],mode:vector?'hybrid':'keyword',limit:CANDIDATES_PER_SOURCE},actor,vector);
   return {candidates:result.matches.map(match=>{
    const record=match.record&&typeof match.record==='object'?match.record as Record<string,unknown>:{},kind=match.entityType==='space'?'talk':match.entityType;
    const title=kind==='person'?String(record.name||record.handle||'Person'):kind==='talk'?String(record.title||'Talk'):String(record.text||'Post').slice(0,100);
    const destination:Destination=kind==='person'?{view:'person',resourceId:match.entityId}:kind==='talk'?{view:'spaces',resourceId:match.entityId}:{view:'post',resourceId:match.entityId};
    return {source,kind,id:match.entityId,title,snippet:match.evidence.map(part=>part.text).join(' ').slice(0,500),url:link(destination),semantic:match.signals.semantic||0};
   }),notices:result.retrieval.notices};
  }
  if(source==='log'){
   const [result,scores]=await Promise.all([searchLog({query:input.query,scope:'all',limit:CANDIDATES_PER_SOURCE},actor,reuse),semanticScores('log',actor.userId,vector,LOG_INDEX_VERSION)]);
   return {candidates:result.items.map(row=>({source,kind:'log',id:row.entryId,title:row.title||row.date,snippet:row.snippet,url:link({view:'log',resourceId:row.entryId}),semantic:scores.get(row.entryId)||0})),notices:result.notices};
  }
  if(source==='chat'){
   const [result,scores]=await Promise.all([searchChat({query:input.query,role:'all',limit:CANDIDATES_PER_SOURCE},actor,reuse),semanticScores('chat',actor.userId,vector,CHAT_INDEX_VERSION)]);
   return {candidates:result.items.map(row=>({source,kind:'chat',id:row.id,title:row.role==='user'?'You':'Agent',snippet:row.text,url:link({view:'chat',resourceId:row.id}),semantic:scores.get(row.id)||0})),notices:result.notices};
  }
  const [result,scores]=await Promise.all([searchDM({query:input.query,limit:CANDIDATES_PER_SOURCE},actor,reuse),semanticScores('dm',actor.userId,vector,DM_INDEX_VERSION)]);
  return {candidates:result.items.map(row=>({source,kind:'message',id:row.id,title:row.person.handle?`@${row.person.handle}`:row.person.name,snippet:row.text,url:link({view:'messages',resourceId:row.connectionId,messageId:row.id}),semantic:scores.get(row.id)||0})),notices:result.notices};
 });
 const settled=await Promise.allSettled(tasks),candidates:Candidate[]=[],notices:GlobalSearchResult['notices']=[],errors:GlobalSearchResult['errors']=[];
 settled.forEach((result,index)=>{const source=selected[index];if(result.status==='fulfilled'){candidates.push(...result.value.candidates);notices.push(...result.value.notices.map(text=>({source,text})));}else errors.push({source,message:unavailable(result.reason)});});
 if(!candidates.length&&errors.length===selected.length)throw new AppError(503,'search_unavailable','Search is temporarily unavailable. Try again shortly.');
 const items=rankGlobalCandidates(candidates,input.query,input.limit||20);
 return {items,notices,errors};
}
