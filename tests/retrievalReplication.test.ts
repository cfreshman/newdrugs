import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {config} from '../server/config';
import {queueRetrieval,replicateRetrievalOne} from '../server/search/replication';
import {DIMENSIONS,INDEX_VERSION} from '../server/search/model';
import * as backend from '../server/search/backend';
import * as native from '../server/search/index';
import {searchPublic} from '../server/search/retrieve';
import {searchChat,chatMessageHash} from '../server/search/chat';
import {users,type User,type Actor} from '../server/auth';
const oldUrl=config.QDRANT_URL;
const vector=Array(DIMENSIONS).fill(0).map((_,i)=>i===0?1:0);
vi.mock('../server/search/embeddings',()=>({embed:vi.fn(async()=>Array(512).fill(0).map((_,i)=>i===0?1:0))}));
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated database required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{await connectDatabase();});beforeEach(async()=>{await clean();config.QDRANT_URL='https://retrieval.invalid';});
afterAll(async()=>{config.QDRANT_URL=oldUrl;await clean();await mongo.close();});
it('repairs a source edit that wins while an older index update is in flight',async()=>{
 const source={_id:'posts:one',dataset:'posts',entityId:'one',ownerId:'me',text:'first',evidence:[],terms:{},area:null,createdAt:'2026-09-27T00:00:00Z',sourceHash:'old',sourceRevision:'old',vector,indexVersion:INDEX_VERSION,indexedAt:'now'};
 await rows('searchDocuments').insertOne(source);await queueRetrieval('public',source._id);
 const writes:unknown[]=[];
 await replicateRetrievalOne(async(_kind,_key,documents)=>{writes.push(documents);await rows('searchDocuments').updateOne({_id:source._id},{$set:{text:'second',sourceHash:'new',sourceRevision:'new'}});await queueRetrieval('public',source._id);});
 expect(await rows('retrievalJobs').countDocuments()).toBe(1);
 await replicateRetrievalOne(async(_kind,_key,documents)=>{writes.push(documents);});
 expect(writes).toMatchObject([[{sourceRevision:'old'}],[{sourceRevision:'new'}]]);expect(await rows('retrievalJobs').countDocuments()).toBe(0);
 await rows('searchDocuments').deleteOne({_id:source._id});await queueRetrieval('public',source._id);const remove=vi.fn(async()=>{});await replicateRetrievalOne(remove);expect(remove).toHaveBeenCalledWith('public',source._id,[]);
});
it('reauthorizes persistent search hits against current source ownership without building the native graph',async()=>{
 const base:User={_id:'me',handle:'me',name:'Me',bio:'',city:'',cityKey:'',interests:[],discoverable:true,balanceNanos:0,reservedNanos:0,createdAt:'2026-09-27T00:00:00Z'};await users().insertMany([base,{...base,_id:'other',handle:'other'}]);
 const actor:Actor={userId:'me',source:'external',scope:'read'};
 const mine={_id:'mine',userId:'me',role:'user',text:'weekend plans',createdAt:base.createdAt},foreign={...mine,_id:'foreign',userId:'other',text:'private weekend plans'};
 await rows('messages').insertMany([mine,foreign]);
 const hit=(message:typeof mine)=>({id:`chunk:${message._id}`,sourceKey:message._id,sourceHash:chatMessageHash(message),sourceRevision:chatMessageHash(message),ownerId:message.userId,messageId:message._id,offset:0,score:1});
 const query=vi.spyOn(backend,'queryRetrieval').mockResolvedValue({dense:[hit(mine),hit(foreign)],lexical:[]}),graph=vi.spyOn(native,'getIndex').mockRejectedValue(Error('Native graph must not be built'));
 try{
  expect((await searchChat({query:'weekend'},actor)).items.map(item=>item.id)).toEqual(['mine']);
  expect(query).toHaveBeenCalledWith('chat','me',expect.objectContaining({filter:{must:expect.arrayContaining([{key:'generation',match:{value:0}}])}}));
  query.mockResolvedValue({dense:[],lexical:[]});expect((await searchPublic({query:'weekend',datasets:['posts'],mode:'hybrid',limit:10},actor)).matches).toEqual([]);expect(graph).not.toHaveBeenCalled();
 }finally{query.mockRestore();graph.mockRestore();}
});
it('assigns pre-migration chunks their current chat generation and repairs a clear during replication',async()=>{
 await rows('users').insertOne({_id:'me',chatGeneration:3});
 await rows('chatSearchChunks').insertOne({_id:'chunk',userId:'me',messageId:'message',sourceHash:'hash',text:'A memory',vector,indexVersion:'fixture',role:'user',offset:0,createdAt:'2026-09-27T00:00:00Z'});
 await queueRetrieval('chat','message',undefined,{userId:'me'});
 await replicateRetrievalOne(async(_kind,_source,documents)=>{expect(documents[0].generation).toBe(3);await rows('chatSearchChunks').deleteMany({userId:'me'});await rows('users').updateOne({_id:'me'},{$set:{chatGeneration:4}});await queueRetrieval('chat','message',undefined,{userId:'me'});});
 const replace=vi.fn(async()=>{});await replicateRetrievalOne(replace);expect(replace).toHaveBeenCalledWith('chat','message',[]);
});
it('pages index metadata to remove orphaned chat and Log sources without retrieving vectors or text',async()=>{
 const {reconcileRetrieval}=await import('../server/search/replication');
 const page=vi.spyOn(backend,'retrievalPage').mockImplementation(async(kind)=>({points:kind==='public'?[]:[{id:'a',payload:{id:'gone-chat',kind:'chat',sourceKey:'old-message',ownerId:'me',sourceRevision:'old',indexVersion:'fixture'}},{id:'b',payload:{id:'gone-log',kind:'log',sourceKey:'old-entry',ownerId:'me',sourceRevision:'old',indexVersion:'fixture'}}],next_page_offset:null}));
 try{await reconcileRetrieval();expect(await rows('retrievalJobs').countDocuments()).toBe(2);const replace=vi.fn(async()=>{});await replicateRetrievalOne(replace);await replicateRetrievalOne(replace);expect(replace).toHaveBeenCalledWith('chat','old-message',[]);expect(replace).toHaveBeenCalledWith('log','old-entry',[]);expect((await rows('retrievalMeta').findOne({_id:'reconcile:chat'}))?.done).toBe(true);}finally{page.mockRestore();}
});
