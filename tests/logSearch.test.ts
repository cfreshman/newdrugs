import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {config} from '../server/config';
import {users,type User,type Actor} from '../server/auth';
import {queueLogSearch,indexLogEntry,relatedLog,searchLog,type LogSearchChunk} from '../server/search/log';
import {executeOperation} from '../server/operations';
import * as backend from '../server/search/backend';
import {buildResourceLinks} from '../server/resourceLinks';
import {logPersonGrams} from '../shared/logPeople';
const oldUrl=config.QDRANT_URL,vector=Array(512).fill(0).map((_,i)=>i===0?1:0),actor:Actor={userId:'me',source:'external',scope:'read'};
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated database required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{await connectDatabase();});beforeEach(async()=>{await clean();config.QDRANT_URL='https://retrieval.invalid';const base:User={_id:'me',handle:'me',name:'Me',bio:'',city:'',cityKey:'',interests:[],discoverable:false,balanceNanos:0,reservedNanos:0,createdAt:'2026-09-27T00:00:00Z'};await users().insertMany([base,{...base,_id:'friend',handle:'friend'},{...base,_id:'other',handle:'other'}]);});afterAll(async()=>{config.QDRANT_URL=oldUrl;await clean();await mongo.close();});
async function entry(members=['me'],note='A walk by the river'){
 const id=randomUUID();await rows('logEntries').insertOne({_id:id,ownerId:members[0],members,invited:[],date:'2026-09-20',title:'River walk',place:'Park',links:[],contributions:[{userId:members[0],note,fileIds:[]}],revision:1});await queueLogSearch(id);return id;
}
it('reuses unchanged note vectors for title, date and membership changes and removes deleted content',async()=>{
 const id=await entry(),embed=vi.fn(async()=>vector);await indexLogEntry(embed);expect(embed).toHaveBeenCalledTimes(2);
 await rows('logEntries').updateOne({_id:id},{$set:{title:'Morning walk',date:'2026-09-21',members:['me','friend'],revision:2}});await queueLogSearch(id);await indexLogEntry(embed);expect(embed).toHaveBeenCalledTimes(3);
 const chunks=await rows<LogSearchChunk>('logSearchChunks').find({entryId:id}).toArray();expect(chunks).toHaveLength(2);expect(chunks.every(chunk=>chunk.sourceRevision==='2'&&chunk.viewerIds.includes('friend'))).toBe(true);
 await rows('logEntries').updateOne({_id:id},{$set:{deletedAt:'now',revision:3}});await queueLogSearch(id);await indexLogEntry(embed);expect(await rows('logSearchChunks').countDocuments()).toBe(0);expect(await rows('retrievalJobs').countDocuments({kind:'log',sourceKey:id})).toBe(1);
});
it('fences out stale embeddings when an entry is changed during indexing',async()=>{
 const id=await entry();let edited=false;await indexLogEntry(async()=>{if(!edited){edited=true;await rows('logEntries').updateOne({_id:id},{$set:{title:'Changed',revision:2}});await queueLogSearch(id);}return vector;});
 expect(await rows('logSearchChunks').countDocuments()).toBe(0);await indexLogEntry(async()=>vector);expect((await rows('logSearchChunks').findOne({entryId:id}))?.sourceRevision).toBe('2');
});
it('filters private retrieval inside the index and reauthorizes stale access before exposing snippets',async()=>{
 const mine=await entry(),shared=await entry(['me','friend'],'SHARED SECRET'),foreign=await entry(['other'],'FOREIGN SECRET');while(await indexLogEntry(async()=>vector));
 const chunks=await rows<LogSearchChunk>('logSearchChunks').find({}).toArray();
 const query=vi.spyOn(backend,'queryRetrieval').mockResolvedValue({dense:chunks.map(chunk=>({id:chunk._id,sourceKey:chunk.entryId,sourceHash:chunk.sourceHash,sourceRevision:chunk.sourceRevision,ownerId:chunk.ownerId,score:1})),lexical:[]});
 try{
  await rows('blocks').insertOne({_id:'block',members:['me','friend']});
  const result=await searchLog({query:'river',scope:'all',limit:20},actor,async()=>vector);expect(result.items.map(item=>item.entryId)).toEqual([mine]);expect(JSON.stringify(result)).not.toContain('SECRET');
  expect(query).toHaveBeenCalledWith('log','me',expect.objectContaining({filter:expect.objectContaining({must_not:[{key:'viewerIds',match:{any:['friend']}}]})}));
  expect(buildResourceLinks('log.search',{},result,actor)[0]).toMatchObject({targetKind:'exact',resourceId:mine});
  await rows('blocks').deleteMany({});await rows('logEntries').updateOne({_id:shared},{$set:{members:['friend']}});
  expect((await searchLog({query:'river',scope:'all',limit:20},actor,async()=>vector)).items.some(item=>[shared,foreign].some(id=>id===item.entryId))).toBe(false);
 }finally{query.mockRestore();}
});
it('returns indexed text matches before semantic neighbors',async()=>{
 const text=await entry(['me'],'We watched a sunset'),related=await entry(['me'],'Golden evening by the shore');while(await indexLogEntry(async()=>vector));
 const documents=await rows<LogSearchChunk>('logSearchChunks').find({entryId:{$in:[text,related]},text:{$regex:'sunset|Golden'}}).toArray();
 const direct=documents.find(row=>row.entryId===text)!,neighbor=documents.find(row=>row.entryId===related)!;
 const hit=(row:LogSearchChunk,score:number)=>({id:row._id,sourceKey:row.entryId,sourceHash:row.sourceHash,sourceRevision:row.sourceRevision,ownerId:row.ownerId,score});
 const query=vi.spyOn(backend,'queryRetrieval').mockResolvedValue({lexical:[hit(direct,.2)],dense:[hit(neighbor,.9),hit(direct,.3)]});
 try{const result=await searchLog({query:'sunset',scope:'all',limit:20},actor,async()=>vector);expect(result.items.map(item=>[item.entryId,item.match])).toEqual([[text,'text'],[related,'semantic']]);}
 finally{query.mockRestore();}
});
it('matches attendee usernames and display names in Log search, list, and calendar',async()=>{
 await users().updateOne({_id:'friend'},{$set:{handle:'cyrus',name:'Cyrus Freshman',logHandleGrams:logPersonGrams('cyrus'),logNameGrams:logPersonGrams('Cyrus Freshman')}});
 await rows('connections').insertOne({_id:'friend:me',members:['friend','me'],status:'accepted'});
 const writer={...actor,scope:'write' as const};
 const created=await executeOperation('log.create',{entry:{date:'2026-09-20',title:'A day'},contribution:{note:''}},writer,randomUUID()) as {id:string;revision:number};
 await executeOperation('log.add_person',{entryId:created.id,revision:created.revision,personId:'friend'},writer,randomUUID(),{confirmed:true});
 const foreign=await entry(['other'],'Cyrus Freshman private memory');
 const query=vi.spyOn(backend,'queryRetrieval').mockResolvedValue({lexical:[],dense:[]});
 try{
  for(const text of ['cyrus','yrus','@yrus','Freshman','resh']){
   const result=await searchLog({query:text,scope:'all',limit:20},actor,async()=>vector);
   expect(result.items.map(item=>item.entryId)).toEqual([created.id]);
   expect(result.items[0].entry?.contributors.map(person=>person.name)).toContain('Cyrus Freshman');
   expect((await executeOperation('log.list',{query:text},actor)).items.map((item:any)=>item.id)).toEqual([created.id]);
   expect((await executeOperation('log.calendar',{from:'2026-09-20',through:'2026-09-20',today:'2026-09-20',scope:'all',query:text},actor)).days[0].items.map((item:any)=>item.id)).toEqual([created.id]);
  }
  expect(JSON.stringify(await searchLog({query:'Cyrus',scope:'all',limit:20},actor,async()=>vector))).not.toContain(foreign);
 }finally{query.mockRestore();}
});
it('finds related Log entries from saved vectors and reauthorizes every result',async()=>{
 const source=await entry(['me'],'A walk beside the river'),related=await entry(['me'],'Another walk near the water'),foreign=await entry(['other'],'PRIVATE NOTE'),stale=await entry(['me'],'Old note');
 while(await indexLogEntry(async()=>vector));
 const chunks=await rows<LogSearchChunk>('logSearchChunks').find({}).toArray();
 const hit=(row:LogSearchChunk)=>({id:row._id,sourceKey:row.entryId,sourceHash:row.sourceHash,sourceRevision:row.sourceRevision,ownerId:row.ownerId,score:.8});
 const query=vi.spyOn(backend,'queryRetrieval').mockResolvedValue({lexical:[],dense:chunks.map(hit)});
 try{
  await rows('logEntries').updateOne({_id:stale},{$set:{revision:2}});
  const result=await relatedLog(source,10,actor);
  expect(result.items.map(item=>item.entryId)).toEqual([related]);
  expect(JSON.stringify(result)).not.toContain('PRIVATE NOTE');
  expect(query).toHaveBeenCalledWith('log','me',expect.objectContaining({query:'',vector:expect.any(Array),filter:expect.objectContaining({must_not:expect.arrayContaining([{key:'sourceKey',match:{value:source}}])})}));
  expect(buildResourceLinks('log.related',{},result,actor)[0]).toMatchObject({targetKind:'exact',resourceId:related});
  expect((await executeOperation('log.related',{entryId:source},actor,randomUUID()) as typeof result).items.map(item=>item.entryId)).toEqual([related]);
 }finally{query.mockRestore();}
});
