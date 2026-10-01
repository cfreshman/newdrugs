import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { connectDatabase, db, mongo, rows, transaction } from '../server/db';
import { createGuest, users, type Actor } from '../server/auth';
import { executeOperation } from '../server/operations';
import { ensureStarterPool } from '../server/starterPool';
import { enqueueSearch } from '../server/search/queue';
import { indexOne, backfillSearch } from '../server/search/worker';
import { sourceDocument } from '../server/search/sources';
import { PublicIndex, resetIndex } from '../server/search/index';
import { DIMENSIONS, type SearchDocument } from '../server/search/model';
import { normalize, dot, bm25, fuse, feedbackVector } from '../server/search/ranking';
import { nearestCoarseCell, coarsePoint } from '../shared/geo';
import type { SearchResult } from '../shared/search';
import { buildResourceLinks } from '../server/resourceLinks';

function vector(text:string) { const v=Array(DIMENSIONS).fill(0);v[/bike|cycl|bicycle|pedal/i.test(text)?0:/photo|camera|picture/i.test(text)?1:2]=1;return v; }
vi.mock('../server/search/embeddings',()=>({embed:vi.fn(async(text:string)=>vector(text))}));
beforeAll(async()=>{await connectDatabase();if(db().databaseName!=='newdrugs_test')throw new Error('Isolated cloud tests only.');});
async function clean(){if(db().databaseName!=='newdrugs_test')throw new Error('Refusing non-test DB.');for(const col of await db().collections())await col.deleteMany({});resetIndex();}
beforeEach(async()=>{await clean();await ensureStarterPool();});
afterAll(async()=>{await clean();await mongo.close();});
const near=nearestCoarseCell(41.82,-71.41),far=nearestCoarseCell(34.05,-118.24);
async function person(bio='',cell=near,discoverable=true){const user=await createGuest();await users().updateOne({_id:user._id},{$set:{handle:`s_${randomUUID().slice(0,8)}`,name:bio.slice(0,30),bio,discoverable,area:{cell,label:'Shared area',point:coarsePoint(cell)}}});await transaction(session=>enqueueSearch('profiles',user._id,session));return {userId:user._id,source:'external',scope:'write'} as Actor;}
async function drain(){for(let i=0;i<100&&await indexOne(async text=>vector(text));i++);resetIndex();}
async function search(actor:Actor,input:object={}){return executeOperation('search.query',{query:'bicycle rides',datasets:['profiles'],near,radiusMiles:25,...input},actor) as Promise<SearchResult>;}

describe('public semantic retrieval',()=>{
 it('omits hidden people from the ordinary semantic People list unless explicitly included',async()=>{
  const owner=await person(''),bike=await person('I cycle on weekends');await drain();
  expect((await executeOperation('people.search',{scope:'all',query:'bicycle'},owner) as any).items.map((item:any)=>item.id)).toContain(bike.userId);
  await executeOperation('people.hide',{personId:bike.userId,hidden:true},owner,randomUUID());
  expect((await executeOperation('people.search',{scope:'all',query:'bicycle'},owner) as any).items.map((item:any)=>item.id)).not.toContain(bike.userId);
  expect((await executeOperation('people.search',{scope:'all',query:'bicycle',includeHidden:true},owner) as any).items.map((item:any)=>item.id)).toContain(bike.userId);
 });
 it('combines semantic meaning with strict area, discovery and block filters, returning exact links',async()=>{
  const owner=await person(''),bike=await person('I cycle on weekends'),photo=await person('photography'),remote=await person('bicycle',far),hidden=await person('bicycle',near,false),blocked=await person('bicycle');
  await executeOperation('people.block',{personId:blocked.userId,blocked:true},owner,randomUUID());await drain();
  const result=await search(owner);expect(result.matches.map(item=>item.entityId)).toEqual([bike.userId]);
  const worldwide=await executeOperation('people.search',{scope:'all',query:'bicycle'},owner) as {items:unknown[]};expect(worldwide.items.length).toBeGreaterThan(0);
  expect(result.matches[0].record).toMatchObject({sameArea:true,distanceLabel:'In your approximate area'});expect(result.matches[0].record).not.toHaveProperty('approximateMiles');
  expect(buildResourceLinks('search.query',{},result,owner)[0]).toMatchObject({targetKind:'exact',resourceId:bike.userId});
  expect(JSON.stringify(result)).not.toContain(hidden.userId);expect(JSON.stringify(result)).not.toContain(remote.userId);expect(JSON.stringify(result)).not.toContain(blocked.userId);
  expect((await search(owner,{query:'@'+(await users().findOne({_id:photo.userId}))!.handle})).retrieval.mode).toBe('exact');
 });
 it('keeps friends browsing and semantic search inside current accepted connections',async()=>{
  const owner=await person(''),friend=await person(''),pending=await person(''),stranger=await person('');
  const posts=[];for(const actor of [friend,pending,stranger,owner])posts.push(await executeOperation('posts.create',{text:'bicycle ride'},actor,randomUUID(),{confirmed:true}) as {id:string});
  await rows('connections').insertMany([{_id:'friend-edge',members:[owner.userId,friend.userId],status:'accepted'},{_id:'pending-edge',members:[owner.userId,pending.userId],status:'pending'}]);
  const list=await executeOperation('posts.list',{scope:'friends'},owner) as {items:{id:string}[]};expect(list.items.map(p=>p.id)).toEqual([posts[0].id]);
  expect((await executeOperation('posts.list',{scope:'friends',authorId:stranger.userId},owner) as {items:unknown[]}).items).toEqual([]);
  await drain();const result=await executeOperation('posts.search',{scope:'friends',query:'bicycle'},owner) as SearchResult;expect(result.matches.map(p=>p.entityId)).toEqual([posts[0].id]);
  await rows('connections').updateOne({_id:'friend-edge'},{$set:{status:'disconnected'}});
  expect((await executeOperation('posts.list',{scope:'friends'},owner) as {items:unknown[]}).items).toEqual([]);
  await expect(executeOperation('search.explain',{retrievalId:result.retrieval.id,matchId:result.matches[0].id},owner)).rejects.toMatchObject({code:'search_changed'});
 });
 it('limits saved semantic results to the caller and rechecks removal',async()=>{
  const owner=await person(''),author=await person('');const post=await executeOperation('posts.create',{text:'bicycle ride'},author,randomUUID(),{confirmed:true}) as {id:string};
  await executeOperation('posts.save',{postId:post.id,saved:true},owner,randomUUID());await drain();
  const result=await executeOperation('posts.search',{scope:'saved',query:'bicycle'},owner) as SearchResult;expect(result.matches.map(p=>p.entityId)).toEqual([post.id]);
  expect((await executeOperation('posts.search',{scope:'saved',query:'bicycle'},author) as SearchResult).matches).toEqual([]);
  await executeOperation('posts.save',{postId:post.id,saved:false},owner,randomUUID());
  await expect(executeOperation('search.explain',{retrievalId:result.retrieval.id,matchId:result.matches[0].id},owner)).rejects.toMatchObject({code:'search_changed'});
 });
 it('writes an indexing job atomically, coalesces edits and refuses stale vectors',async()=>{
  const owner=await person('bicycle');await drain();
  await executeOperation('profile.update',{bio:'camera walks'},{...owner,source:'browser'},randomUUID());
  const prior=await rows('searchOutbox').findOne({_id:`profiles:${owner.userId}`});expect(prior).not.toBeNull();
  let release!:()=>void;const waiting=new Promise<void>(resolve=>{release=resolve;});let started!:()=>void;const ready=new Promise<void>(resolve=>{started=resolve;});
  const work=indexOne(async text=>{started();await waiting;return vector(text);});await ready;
  await executeOperation('profile.update',{bio:'pedaling on trails'},{...owner,source:'browser'},randomUUID());release();await work;
  expect((await rows('searchOutbox').findOne({_id:`profiles:${owner.userId}`}))?.revision).not.toBe(prior!.revision);
  await drain();expect((await rows('searchDocuments').findOne({_id:`profiles:${owner.userId}`}))?.sourceHash).toBe((await sourceDocument('profiles',owner.userId))?.sourceHash);
 });
 it('does not re-embed unchanged human text when only location changes',async()=>{
  const owner=await person('bicycle');await drain();const embedding=vi.fn(async text=>vector(text));
  await rows('locationAreas').insertOne({_id:far,label:'Far area',point:coarsePoint(far)});
  await executeOperation('profile.update',{locationCell:far},{...owner,source:'browser'},randomUUID());await indexOne(embedding);expect(embedding).not.toHaveBeenCalled();
 });
 it('reauthorizes cursor pages and explanations after blocks and privacy changes',async()=>{
  const owner=await person(''),a=await person('cycle'),b=await person('bicycle'),other=await person('camera');await drain();
  const first=await search(owner,{limit:1});expect(first.nextCursor).toBeTruthy();
  await expect(search(other,{limit:1,cursor:first.nextCursor})).rejects.toMatchObject({code:'search_expired'});
  await expect(search(owner,{query:'camera',limit:1,cursor:first.nextCursor})).rejects.toMatchObject({code:'search_changed'});
  for(const actor of [a,b])await executeOperation('profile.update',{discoverable:false},{...actor,source:'browser'},randomUUID());
  const second=await search(owner,{limit:1,cursor:first.nextCursor});expect(second.matches).toEqual([]);expect(second.retrieval.incomplete).toBe(true);
  await expect(executeOperation('search.explain',{retrievalId:first.retrieval.id,matchId:first.matches[0].id},owner)).rejects.toMatchObject({code:'search_changed'});
 });
 it('indexes posts/replies and removes deleted content before asynchronous cleanup',async()=>{
  const owner=await person(''),author=await person('');await drain();
  const post=await executeOperation('posts.create',{text:'cycle meetup'},author,randomUUID(),{confirmed:true}) as {id:string};
  const reply=await executeOperation('posts.reply',{postId:post.id,text:'bringing my bicycle'},owner,randomUUID(),{confirmed:true}) as {id:string};await drain();
  const found=await search(owner,{near:undefined,datasets:['posts','replies']});expect(found.matches.map(match=>match.entityId).sort()).toEqual([post.id,reply.id].sort());
  expect((found.matches.find(match=>match.entityId===reply.id)!.record as any).parent).toMatchObject({id:post.id,text:'cycle meetup'});
  await executeOperation('people.block',{personId:author.userId,blocked:true},owner,randomUUID());
  const blockedResult=await search(owner,{near:undefined,datasets:['posts','replies']});expect((blockedResult.matches[0].record as any).parent).toBeUndefined();
  await executeOperation('posts.delete',{postId:post.id},author,randomUUID(),{confirmed:true});
  const updated=await search(owner,{near:undefined,datasets:['posts','replies']});expect(updated.matches.map(match=>match.entityId)).toEqual([reply.id]);await drain();expect(await rows('searchDocuments').findOne({_id:`posts:${post.id}`})).toBeNull();
 });
 it('retains no private sources and enforces dates, author and owner-bound feedback',async()=>{
  const owner=await person(''),a=await person('cycle'),b=await person('photography');await drain();
  await rows('directMessages').insertOne({_id:'secret',text:'bicycle private phrase'});await rows('messages').insertOne({_id:'private-chat',text:'bicycle'});await backfillSearch();await drain();
  expect(await rows('searchDocuments').countDocuments({_id:{$in:['posts:secret','posts:private-chat']}})).toBe(0);
  expect((await search(owner,{authorId:b.userId})).matches).toEqual([]);expect((await search(owner,{after:'2099-01-01T00:00:00.000Z'})).matches).toEqual([]);
  const first=await search(owner);const explained=await executeOperation('search.explain',{retrievalId:first.retrieval.id,matchId:first.matches[0].id},owner) as any;expect(explained.match.evidence.some((item:any)=>item.text==='cycle')).toBe(true);
  const refined=await executeOperation('search.refine',{retrievalId:first.retrieval.id,positive:[`profiles:${a.userId}`]},owner) as SearchResult;expect(refined.matches[0].entityId).toBe(a.userId);
  await expect(executeOperation('search.refine',{retrievalId:first.retrieval.id,positive:['profiles:secret']},owner)).rejects.toMatchObject({code:'feedback'});
 });
});

describe('bounded ranking index',()=>{
 it('preserves lexical relevance, combines ranks and applies explicit negative feedback',()=>{
  expect(bm25(['quartz'],[{id:'a',terms:{quartz:2,rock:1}},{id:'b',terms:{rock:3}}])[0].id).toBe('a');
  expect(fuse([[{id:'a',score:100},{id:'b',score:99}],[{id:'b',score:.4}]])[0].id).toBe('b');
  expect(dot(feedbackVector([1,0],[],[[0,1]]),[0,1])).toBeLessThan(0);
 });
 it('releases retired native graphs only after the last active reader',()=>{
  const index=new PublicIndex();
  index.add({_id:'posts:one',dataset:'posts',entityId:'one',ownerId:'one',text:'',evidence:[],terms:{},area:null,createdAt:'',sourceHash:'',sourceRevision:'',indexVersion:'',indexedAt:'',vector:vector('bike')});
  const release=index.retain();index.retire();expect(index.vector('posts:one')?.[0]).toBe(1);release();expect(index.metadata.size).toBe(0);expect(index.graph.getCurrentCount()).toBe(0);
 });
 it('measures ANN recall against exact cosine on filtered candidates',()=>{
  const index=new PublicIndex();let seed=71;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
  const docs=Array.from({length:800},(_,i)=>({_id:`posts:${i}`,dataset:'posts',entityId:String(i),ownerId:String(i%100),text:'',evidence:[],terms:{},area:null,createdAt:'2026-01-01',sourceHash:'h',sourceRevision:'r',indexVersion:'v',indexedAt:'',vector:normalize(Array.from({length:DIMENSIONS},(_,d)=>d<32?random()-.5:0))} as SearchDocument));
  docs.forEach(doc=>index.add(doc));const eligible=new Set(docs.filter((_,i)=>i%5!==0).map(doc=>doc._id));let recall=0;
  for(const doc of docs.slice(1,21)){const exact=docs.filter(item=>eligible.has(item._id)).map(item=>({id:item._id,score:dot(doc.vector!,item.vector!)})).sort((a,b)=>b.score-a.score).slice(0,10);const actual=index.search(doc.vector!,eligible,10);expect(actual.every(item=>eligible.has(item.id))).toBe(true);recall+=actual.filter(item=>exact.some(target=>target.id===item.id)).length/10;}
  expect(recall/20).toBeGreaterThanOrEqual(.95);
 });
});
