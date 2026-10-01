import {hiddenPersonIds} from '../peopleHides';
import {queryRetrieval,retrievalEnabled,type RetrievalFilter} from './backend';
import {postAudience} from '../socialCollections';
import { randomUUID } from 'node:crypto';
import { rows } from '../db';
import { currentUser, profile, users, type Actor } from '../auth';
import { AppError } from '../errors';
import { postCards } from '../postProjection';
import { coarsePoint, distanceMeters, METERS_PER_MILE, sharedAreaDistance } from '../../shared/geo';
import type { SearchConstraints, SearchDataset, SearchMatch, SearchMode, SearchResult, SearchRetrieval } from '../../shared/search';
import { EMBEDDING_MODEL, DIMENSIONS, INDEX_VERSION, type SearchDocument } from './model';
import { sourceDocument } from './sources';
import {spaceOperation} from '../spaces';
import { getIndex } from './index';
import { embed } from './embeddings';
import { bm25, semanticCandidate, diversify, feedbackVector, fuse, hybridRank, hashText, words } from './ranking';

export interface SearchInput extends SearchConstraints {
  query: string; datasets: SearchDataset[]; mode: SearchMode; limit: number; cursor?: string; interest?: string;
}
type Ranked = { id: string; sourceHash: string; sourceRevision: string; score: number; signals: SearchMatch['signals'] };
type Snapshot = { _id: string; userId: string; identity: string; input: SearchInput; vector?: number[]; ranked: Ranked[]; retrieval: SearchRetrieval; expiresAt: Date };
async function blockedBy(userId: string) { return (await rows('blocks').find({ members: userId }).toArray()).flatMap(row => (row.members as string[]).filter(id => id !== userId)); }
const hiddenFor=(input:SearchInput,userId:string)=>input.datasets.includes('profiles')&&!input.includeHidden?hiddenPersonIds(userId):Promise.resolve<string[]>([]);
function within(document: Omit<SearchDocument, 'vector'>, input: SearchInput, actor: Actor, blocked: string[], audience:Awaited<ReturnType<typeof postAudience>> = null, hidden:string[] = []) {
  if(audience && (document.dataset==='profiles'||(audience.authorIds&&!audience.authorIds.has(document.ownerId))||(audience.postIds&&!audience.postIds.has(document.entityId))))return false;
  if (blocked.includes(document.ownerId) || (document.dataset === 'profiles' && (document.ownerId === actor.userId || hidden.includes(document.ownerId)))) return false;
  if (!input.datasets.includes(document.dataset) && !(input.datasets.includes('threads') && ['posts','replies'].includes(document.dataset))) return false;
  if (input.authorId && document.ownerId !== input.authorId || input.after && document.createdAt < input.after || input.beforeDate && document.createdAt >= input.beforeDate) return false;
  if (input.interest && !document.evidence.some(item => item.field === 'interests' && item.text.split(', ').includes(input.interest!.toLowerCase()))) return false;
  if (input.near) { if (!document.area) return false; const [lng, lat] = coarsePoint(input.near).coordinates, [otherLng, otherLat] = document.area.point.coordinates; if (distanceMeters([lat,lng], [otherLat,otherLng]) > (input.radiusMiles || 25) * METERS_PER_MILE) return false; }
  return true;
}
async function hydrate(ranked: Ranked[], input: SearchInput, actor: Actor): Promise<SearchMatch[]> {
  const [blocked,hidden] = await Promise.all([blockedBy(actor.userId),hiddenFor(input,actor.userId)]), results: SearchMatch[] = [];
  const audience=await postAudience(input.scope,actor);
  // Bounded parallel canonical reads, never cached result payloads.
  for (let offset = 0; offset < ranked.length; offset += 8) {
    const batch = await Promise.all(ranked.slice(offset,offset+8).map(async rank => {
      const split = rank.id.indexOf(':'), kind = rank.id.slice(0,split) as 'profiles' | 'posts' | 'spaces', entityId = rank.id.slice(split+1);
      if (!['profiles','posts','spaces'].includes(kind)) return null;
      const source = await sourceDocument(kind, entityId);
      if (!source || source.sourceHash !== rank.sourceHash || source.sourceRevision !== rank.sourceRevision || !within(source, input, actor, blocked,audience,hidden)) return null;
      let record: unknown;
      if (kind === 'profiles') {
        const person = await users().findOne({ _id: entityId, discoverable: true }); if (!person) return null;
        record = profile(person);
      } else if(kind==='spaces'){
        try{record=await spaceOperation('spaces.get',{spaceId:entityId},actor);}catch(error){if(error instanceof AppError&&[403,404,409].includes(error.status))return null;throw error;}
      }else {
        const post = await rows('posts').findOne({ _id: entityId, deletedAt: { $exists: false } }); if (!post) return null;
        record = (await postCards([post], actor.userId, blocked))[0];
      }
      if (input.near && source.area) { const [lng,lat] = coarsePoint(input.near).coordinates, [otherLng,otherLat] = source.area.point.coordinates; record = { ...(record as object), ...sharedAreaDistance(input.near, source.area.cell, distanceMeters([lat,lng],[otherLat,otherLng])) }; }
      return { id: source._id, dataset: source.dataset, entityType: kind === 'profiles' ? 'person' : kind==='spaces'?'space':'post', entityId, ownerId: source.ownerId, score: rank.score,
        evidence: source.evidence, signals: rank.signals, sourceHash: source.sourceHash, sourceRevision: source.sourceRevision, record } as SearchMatch;
    }));
    results.push(...batch.filter((item): item is SearchMatch => Boolean(item)));
  }
  return results;
}
const identity = (input: SearchInput) => hashText(JSON.stringify({ ...input, cursor: undefined, limit: undefined }));
async function ownedSnapshot(id: string, actor: Actor) {
  const snapshot = await rows<Snapshot>('searchRetrievals').findOne({ _id: id, userId: actor.userId, expiresAt: { $gt: new Date() } });
  if (!snapshot) throw new AppError(409, 'search_expired', 'This search expired. Search again.'); return snapshot;
}
async function page(snapshot: Snapshot, offset: number, limit: number, actor: Actor): Promise<SearchResult> {
  const matches: SearchMatch[] = []; let skipped = 0;
  while (offset < snapshot.ranked.length && matches.length < limit) {
    const selected = snapshot.ranked.slice(offset,offset+limit-matches.length); offset += selected.length;
    const current = await hydrate(selected, snapshot.input, actor); skipped += selected.length-current.length; matches.push(...current);
  }
  return { matches, retrieval: { ...snapshot.retrieval, incomplete: snapshot.retrieval.incomplete || Boolean(skipped), notices: [...snapshot.retrieval.notices, ...(skipped ? ['Some results changed or became unavailable. Search again for current matches.'] : [])] }, nextCursor: offset < snapshot.ranked.length ? `${snapshot._id}.${offset}` : null };
}
export function publicRetrievalFilter(input:SearchInput,userId:string,blocked:string[],audience:{authorIds?:Set<string>;postIds?:Set<string>}|null,excluded:string[]=[],hidden:string[]=[]):RetrievalFilter{
 const datasets=[...new Set(input.datasets.flatMap(dataset=>dataset==='threads'?['posts','replies']:[dataset]))];
 const must:Record<string,unknown>[]=[{key:'indexVersion',match:{value:INDEX_VERSION}},{key:'dataset',match:{any:datasets}}];
 const must_not:Record<string,unknown>[]=[{must:[{key:'dataset',match:{value:'profiles'}},{key:'ownerId',match:{value:userId}}]}];
 if(!input.includeHidden&&hidden.length)must_not.push({must:[{key:'dataset',match:{value:'profiles'}},{key:'ownerId',match:{any:hidden}}]});
 if(blocked.length)must_not.push({key:'ownerId',match:{any:blocked}});if(excluded.length)must_not.push({key:'id',match:{any:excluded}});
 if(audience){must_not.push({key:'dataset',match:{value:'profiles'}});if(audience.authorIds)must.push({key:'ownerId',match:{any:[...audience.authorIds]}});if(audience.postIds)must.push({key:'entityId',match:{any:[...audience.postIds]}});}
 if(input.authorId)must.push({key:'ownerId',match:{value:input.authorId}});
 if(input.after||input.beforeDate)must.push({key:'createdAt',range:{...(input.after?{gte:input.after}:{}),...(input.beforeDate?{lt:input.beforeDate}:{})}});
 if(input.interest)must.push({key:'interests',match:{value:input.interest.toLowerCase()}});
 if(input.near){const[lon,lat]=coarsePoint(input.near).coordinates;must.push({key:'area',geo_radius:{center:{lon,lat},radius:(input.radiusMiles||25)*METERS_PER_MILE}});}
 return {must,must_not};
}
export async function searchPublic(input: SearchInput, actor: Actor, prepared?: number[], excluded: string[] = []): Promise<SearchResult> {
  const user = await currentUser(actor.userId); if (!user.handle) throw new AppError(403, 'account_required', 'Create your account to search.');
  const audience=await postAudience(input.scope,actor);
  if (input.near) coarsePoint(input.near);
  if (input.after && input.beforeDate && input.after >= input.beforeDate) throw new AppError(422,'date_range','Choose an end date after the start date.');
  if (input.cursor) {
    const [id, value] = input.cursor.split('.'), offset = Number(value), snapshot = await ownedSnapshot(id,actor);
    if (!Number.isSafeInteger(offset) || offset < 0 || snapshot.identity !== identity(input)) throw new AppError(409,'search_changed','The search changed. Start again without a cursor.');
    return page(snapshot,offset,input.limit,actor);
  }
  const rateId = `${actor.userId}:${Math.floor(Date.now()/60000)}`;
  const rate = await rows<{_id:string;count:number}>('searchRates').findOneAndUpdate({_id:rateId},{$inc:{count:1},$set:{expiresAt:new Date(Date.now()+120000)}},{upsert:true,returnDocument:'after'});
  if (rate && rate.count > 30) throw new AppError(429,'search_rate','Give search a moment before trying again.');
  const [blocked, hidden, pending] = await Promise.all([blockedBy(actor.userId),hiddenFor(input,actor.userId),rows('searchOutbox').countDocuments({}, {limit:1})]);
  let release=()=>{};
  try {
  const notices: string[] = []; let vector = prepared, mode: SearchRetrieval['mode'] = input.mode;
  const exactText = input.query.replace(/^@/,'').trim().toLowerCase();
  const exact = input.datasets.includes('profiles') ? await users().find({ discoverable:true, suspendedAt:null, _id:{$ne:actor.userId,$nin:[...blocked,...hidden]}, $or:[{handle:exactText},{name:{$regex:`^${exactText.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`,$options:'i'}}] }).limit(30).toArray() : [];
  const exactDocuments = (await Promise.all(exact.map(user=>sourceDocument('profiles',user._id)))).filter((document):document is SearchDocument=>Boolean(document && within(document,input,actor,blocked,audience,hidden)));
  if (exactDocuments.length) mode = 'exact';
  else if (input.mode !== 'keyword' && !vector) { try { vector = await embed(input.query,'query'); } catch { mode = 'keyword'; notices.push('Semantic search is temporarily unavailable. These are keyword matches.'); } }
  let metadata=new Map<string,Omit<SearchDocument,'vector'>>(),vectors=new Map<string,number[]>(),candidateCount=0,incomplete=false,indexedAt:string|undefined;
  let lexical:{id:string;score:number}[]=[],dense:{id:string;score:number}[]=[];
  if(!exactDocuments.length&&retrievalEnabled()){
    const filter=publicRetrievalFilter(input,actor.userId,blocked,audience,excluded,hidden);
    let lanes;try{lanes=await queryRetrieval('public',undefined,{query:input.query,vector,filter});}catch{throw new AppError(503,'search_unavailable','Search is temporarily unavailable. Try again shortly.');}
    const offered=[...lanes.lexical,...lanes.dense],ids=[...new Set(offered.map(item=>item.id))];
    const documents=await rows<SearchDocument>('searchDocuments').find({_id:{$in:ids},indexVersion:INDEX_VERSION,...(hidden.length?{$nor:[{dataset:'profiles',ownerId:{$in:hidden}}]}:{})}).toArray();
    for(const document of documents){if(!within(document,input,actor,blocked,audience,hidden))continue;metadata.set(document._id,document);if(document.vector)vectors.set(document._id,document.vector);}
    const current=(item:typeof offered[number])=>{const doc=metadata.get(item.id);return doc?.sourceHash===item.sourceHash&&doc?.sourceRevision===item.sourceRevision;};
    lexical=lanes.lexical.filter(current);dense=lanes.dense.filter(current).filter(item=>semanticCandidate(item.score,lexical.find(match=>match.id===item.id)?.score));
    candidateCount=ids.length;incomplete=documents.length<ids.length||Boolean(await rows('retrievalJobs').findOne({kind:'public'},{projection:{_id:1}}))||!(await rows('retrievalMeta').findOne({_id:'backfill:public'}))?.done;
    indexedAt=documents.map(doc=>doc.indexedAt).sort().at(-1);
  }else if(!exactDocuments.length){
    const held=await getIndex();release=held.release;const index=held.index;
    const eligible=[...index.metadata.values()].filter(document=>!excluded.includes(document._id)&&within(document,input,actor,blocked,audience,hidden));
    metadata=index.metadata;candidateCount=eligible.length;incomplete=index.incomplete;indexedAt=[...metadata.values()].map(doc=>doc.indexedAt).sort().at(-1);
    lexical=bm25(words(input.query),eligible.map(document=>({id:document._id,terms:document.terms}))).slice(0,150);
    dense=vector?index.search(vector,new Set(eligible.map(document=>document._id))).filter(item=>semanticCandidate(item.score,lexical.find(match=>match.id===item.id)?.score)):[];
    for(const item of [...dense,...lexical]){const value=index.vector(item.id);if(value)vectors.set(item.id,value);}
  }
  const lexScores = new Map(lexical.map(item=>[item.id,item.score])), denseScores = new Map(dense.map(item=>[item.id,item.score]));
  const ranking = mode === 'keyword' ? fuse([lexical]) : input.mode === 'semantic' ? dense : hybridRank(dense,lexical);
  const fused = ranking.map(item => {
    const document = metadata.get(item.id)!;
    const freshness = document.dataset === 'profiles' ? 0 : Math.exp(-Math.max(0,Date.now()-Date.parse(document.createdAt))/(30*86400000));
    return {...item,score:item.score*(1+.05*freshness),ownerId:document.ownerId,vector:vectors.get(item.id),sourceHash:document.sourceHash,sourceRevision:document.sourceRevision,
      signals:{semantic:denseScores.get(item.id),lexical:lexScores.get(item.id),freshness}};
  }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  const ranked: Ranked[] = exactDocuments.length ? exactDocuments.map(document=>({id:document._id,sourceHash:document.sourceHash,sourceRevision:document.sourceRevision,score:1,signals:{exact:true}}))
    : diversify(fused,100).map(({id,score,sourceHash,sourceRevision,signals})=>({id,score,sourceHash,sourceRevision,signals}));
  if (pending) notices.push('Recent changes are still being indexed.');
  if (incomplete) notices.push(retrievalEnabled()?'Some search updates are still being indexed.':'The search index has reached its current capacity. Results are incomplete.');
  const id = randomUUID(), retrieval: SearchRetrieval = {id,mode,model:EMBEDDING_MODEL,dimensions:DIMENSIONS,indexVersion:INDEX_VERSION,constraints:{includeHidden:input.includeHidden,scope:input.scope,near:input.near,radiusMiles:input.radiusMiles,authorId:input.authorId,after:input.after,beforeDate:input.beforeDate},candidates:exactDocuments.length||candidateCount,incomplete:Boolean(pending)||incomplete||(mode==='keyword'&&input.mode!=='keyword'),notices,approximate:(retrievalEnabled()||candidateCount>500)&&Boolean(vector),indexedAt};
  const snapshot: Snapshot = {_id:id,userId:actor.userId,identity:identity(input),input:{...input,cursor:undefined},...(vector?{vector}:{}),ranked,retrieval,expiresAt:new Date(Date.now()+600000)};
  await rows<Snapshot>('searchRetrievals').insertOne({...JSON.parse(JSON.stringify(snapshot)),expiresAt:snapshot.expiresAt});
  // Bound short-lived owner-only retrieval memory. No saved inferred preferences.
  const old = await rows('searchRetrievals').find({userId:actor.userId}).sort({expiresAt:-1}).skip(20).project({_id:1}).toArray();
  if(old.length)await rows('searchRetrievals').deleteMany({_id:{$in:old.map(row=>row._id)},userId:actor.userId});
  return await page(snapshot,0,input.limit,actor);
  } finally { release(); }
}
export async function similarPublic(id: string, input: SearchInput, actor: Actor) {
  const split=id.indexOf(':'),kind=id.slice(0,split),entityId=id.slice(split+1);
  if(!['profiles','posts','spaces'].includes(kind))throw new AppError(422,'source','Choose a returned search record.');
  const source=await sourceDocument(kind as 'profiles'|'posts'|'spaces',entityId),blocked=await blockedBy(actor.userId);
  if(!source||blocked.includes(source.ownerId))throw new AppError(404,'unavailable','This record is unavailable.');
  const stored=await rows<SearchDocument>('searchDocuments').findOne({_id:id,sourceHash:source.sourceHash,indexVersion:INDEX_VERSION});
  const vector=stored?.vector||await embed(source.text,'document');
  return searchPublic({...input,query:input.query||source.text.slice(0,500)},actor,vector,[id]);
}
export async function refinePublic(retrievalId: string, positive: string[], negative: string[], actor: Actor) {
  const snapshot=await ownedSnapshot(retrievalId,actor);
  if(!snapshot.vector)throw new AppError(409,'semantic_unavailable','Run a semantic search before refining it.');
  const selected=[...new Set([...positive,...negative])];
  if(!selected.length||positive.some(id=>negative.includes(id))||selected.some(id=>!snapshot.ranked.some(rank=>rank.id===id)))throw new AppError(422,'feedback','Choose distinct results from this search.');
  const current=await hydrate(snapshot.ranked.filter(rank=>selected.includes(rank.id)),snapshot.input,actor);
  if(current.length!==selected.length)throw new AppError(409,'search_changed','A selected result changed. Search again.');
  const docs=await rows<SearchDocument>('searchDocuments').find({_id:{$in:selected},indexVersion:INDEX_VERSION}).toArray();
  const vectorFor=(id:string)=>{const doc=docs.find(doc=>doc._id===id);if(!doc?.vector||doc.sourceHash!==current.find(item=>item.id===id)?.sourceHash)throw new AppError(409,'search_changed','A selected result is being indexed. Search again.');return doc.vector;};
  return searchPublic(snapshot.input,actor,feedbackVector(snapshot.vector,positive.map(vectorFor),negative.map(vectorFor)),negative);
}
export async function explainPublic(retrievalId: string, id: string, actor: Actor) {
  const snapshot=await ownedSnapshot(retrievalId,actor),rank=snapshot.ranked.find(rank=>rank.id===id);
  if(!rank)throw new AppError(404,'unavailable','This result is unavailable.');
  const match=(await hydrate([rank],snapshot.input,actor))[0];
  if(!match)throw new AppError(409,'search_changed','This result changed or is no longer visible. Search again.');
  return {match,retrieval:snapshot.retrieval};
}
export async function searchStatus() {
  const [counts,pending,failed]=await Promise.all([rows('searchDocuments').aggregate< {_id:string;count:number}>([{$group:{_id:'$dataset',count:{$sum:1}}}]).toArray(),rows('searchOutbox').countDocuments({status:{$ne:'failed'}}),rows('searchOutbox').countDocuments({status:'failed'})]);
  return {datasets:['profiles','posts','replies','spaces'].map(dataset=>({dataset,count:counts.find(item=>item._id===dataset)?.count||0})),pending,failed,model:EMBEDDING_MODEL,dimensions:DIMENSIONS,indexVersion:INDEX_VERSION,capacity:retrievalEnabled()?null:10000,notice:'Public human-written profiles, posts, replies and live Talk titles and descriptions only. No DMs, agent chats, files or inferred interests are indexed.'};
}
