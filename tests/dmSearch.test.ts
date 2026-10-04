import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {createGuest,users,type Actor} from '../server/auth';
import {enqueueDMSearch,indexDMMessage,searchDM,DM_INDEX_VERSION,backfillDMSearch} from '../server/search/dm';
import {searchGlobal} from '../server/search/global';
import {parseDestination} from '../shared/navigation';
import {buildResourceLinks} from '../server/resourceLinks';
import {outputs} from '../shared/contracts';
import type {GlobalSearchResult} from '../shared/globalSearch';

const retrieval=vi.hoisted(()=>({query:vi.fn()}));
vi.mock('../server/search/embeddings',()=>({embed:async()=>[1,...Array(511).fill(0)]}));
vi.mock('../server/search/backend',async original=>({...await original<typeof import('../server/search/backend')>(),retrievalEnabled:()=>true,queryRetrieval:retrieval.query}));

async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated cloud tests only.');for(const collection of await db().collections())await collection.deleteMany({});}
async function person(){const user=await createGuest();await users().updateOne({_id:user._id},{$set:{handle:`dm_${randomUUID().slice(0,8)}`,name:'Member'}});return {userId:user._id,source:'external',scope:'read'} as Actor;}
async function connection(a:Actor,b:Actor){const id=randomUUID();await rows('connections').insertOne({_id:id,members:[a.userId,b.userId],status:'accepted',fromId:a.userId,toId:b.userId,note:'Hi',createdAt:new Date().toISOString()});return id;}
async function message(connectionId:string,fromId:string,text:string){const id=randomUUID();await rows('directMessages').insertOne({_id:id,connectionId,fromId,text,createdAt:new Date().toISOString()});await enqueueDMSearch(id);return id;}
beforeAll(async()=>{await connectDatabase();});
beforeEach(async()=>{await clean();retrieval.query.mockReset().mockImplementation(async(_kind:string,_userId:string,input:{query:string})=>{const chunks=await rows('dmSearchChunks').find({indexVersion:DM_INDEX_VERSION}).toArray();const hits=chunks.filter(row=>String(row.text).toLowerCase().includes(input.query.toLowerCase())).map(row=>({id:row._id,score:2,sourceHash:row.sourceHash,sourceRevision:row.sourceHash,sourceKey:row.messageId,ownerId:row.connectionId,messageId:row.messageId,connectionId:row.connectionId,offset:0}));return {lexical:hits,dense:[]};});});
afterAll(async()=>{await clean();await mongo.close();});

it('indexes DMs separately, checks current membership and blocks, and links exact messages',async()=>{
 const a=await person(),b=await person(),c=await person(),ab=await connection(a,b),bc=await connection(b,c);
 const first=await message(ab,a.userId,'The cycling link is here'),second=await message(bc,c.userId,'Another cycling link');
 while(await indexDMMessage());
 const found=await searchDM({query:'cycling'},a);expect(found.items.map(row=>row.id)).toEqual([first]);
 expect(retrieval.query).toHaveBeenCalledWith('dm',a.userId,expect.objectContaining({filter:expect.objectContaining({must:expect.arrayContaining([expect.objectContaining({key:'indexVersion'})])})}));
 const link=buildResourceLinks('messages.search',{},found,a)[0];expect(parseDestination(link.url,'https://dev.druggie.org')).toEqual({view:'messages',resourceId:ab,messageId:first});
 const global=outputs['search.global'].parse(await searchGlobal({query:'cycling',sources:['messages']},a)) as GlobalSearchResult;
 expect(global.groups[0].items).toMatchObject([{kind:'message',id:first,url:expect.stringContaining(`message=${first}`)}]);
 const all=outputs['search.global'].parse(await searchGlobal({query:'cycling'},a)) as GlobalSearchResult;
 expect(all.groups.map(group=>group.source)).toEqual(['public','log','chat','messages']);
 expect(all.groups.find(group=>group.source==='messages')?.items.map(item=>item.id)).toEqual([first]);
 expect((await searchDM({query:'cycling'},c)).items.map(row=>row.id)).toEqual([second]);
 await rows('blocks').insertOne({_id:randomUUID(),members:[a.userId,b.userId],pairId:[a.userId,b.userId].sort().join(':')});
 expect((await searchDM({query:'cycling'},a)).items).toEqual([]);
 await rows('blocks').deleteMany({});await users().updateOne({_id:b.userId},{$set:{suspendedAt:new Date().toISOString()}});
 expect((await searchDM({query:'cycling'},a)).items).toEqual([]);
});

it('drops moderated text and rechecks a changed message before returning a cached search',async()=>{
 const a=await person(),b=await person(),ab=await connection(a,b),id=await message(ab,a.userId,'cycling link');
 while(await indexDMMessage());const found=await searchDM({query:'cycling'},a);expect(found.items[0].id).toBe(id);
 await rows('directMessages').updateOne({_id:id},{$set:{text:'changed completely'}});
 expect((await searchDM({query:'cycling'},a)).items).toEqual([]);
 await rows('directMessages').updateOne({_id:id},{$set:{moderatedAt:new Date().toISOString()}});await enqueueDMSearch(id);while(await indexDMMessage());
 expect(await rows('dmSearchChunks').countDocuments({messageId:id})).toBe(0);
});

it('backfills old messages and forbids background search of an ungranted private source',async()=>{
 const a=await person(),b=await person(),ab=await connection(a,b),id=randomUUID();await rows('directMessages').insertOne({_id:id,connectionId:ab,fromId:a.userId,text:'old cycling link',createdAt:new Date().toISOString()});
 await backfillDMSearch();expect(await rows('dmSearchJobs').findOne({messageId:id})).not.toBeNull();
 await expect(searchGlobal({query:'cycling',sources:['messages']},{...a,background:true,accountActivity:false})).rejects.toMatchObject({code:'data_access'});
});
