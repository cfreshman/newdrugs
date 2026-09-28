import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {config} from '../server/config';
import {claimAgentRun} from '../server/agentAdmission';
const clean=async()=>{if(db().databaseName!=='newdrugs_test')throw Error('Isolated database required');for(const collection of await db().collections())await collection.deleteMany({});};
beforeAll(async()=>{if(new URL(config.MONGODB_URI).pathname!=='/newdrugs_test')throw Error('Isolated database required');await connectDatabase();});beforeEach(clean);afterAll(async()=>{await clean();await mongo.close();});
const limits={global:4,interactive:1,perAccount:2};
const queued=(_id:string,userId:string,purpose='automation',priority=10)=>({_id,userId,purpose,priority,status:'queued',nextAttempt:0,attempts:0,updatedAt:'2026-09-27T00:00:00Z'});
it('bounds a thousand-job burst across concurrent workers and leaves interactive capacity',async()=>{
 await rows('runs').insertMany(Array.from({length:1000},(_,i)=>queued(`job-${String(i).padStart(4,'0')}`,`user-${i%100}`)));
 const attempts=await Promise.all(Array.from({length:8},()=>claimAgentRun([],limits)));expect(attempts.filter(Boolean)).toHaveLength(3);expect(await rows('runs').countDocuments({status:'running'})).toBe(3);
 await rows('runs').insertOne(queued('interactive','chat-user','interactive',0));expect((await claimAgentRun([],limits))?._id).toBe('interactive');expect(await claimAgentRun([],limits)).toBeNull();
});
it('does not let an account occupy multiple automation slots or starve another account',async()=>{
 await rows('runs').insertMany([queued('a','same'),queued('b','same'),queued('c','other'),queued('chat','same','interactive',0)]);
 const first=await claimAgentRun([],limits);expect(first?._id).toBe('chat');expect((await claimAgentRun([],limits))?._id).toBe('a');expect((await claimAgentRun([],limits))?._id).toBe('c');expect(await claimAgentRun([],limits)).toBeNull();
});
it('reclaims an expired lease once and excludes work already active in this process',async()=>{
 await rows('runs').insertOne({...queued('expired','a'),status:'running',lease:'old',leaseUntil:Date.now()-1});
 expect(await claimAgentRun(['expired'],limits)).toBeNull();const attempts=await Promise.all([claimAgentRun([],limits),claimAgentRun([],limits)]);expect(attempts.filter(Boolean)).toHaveLength(1);expect(attempts.find(Boolean)?.lease).not.toBe('old');
});

it('does not write an admission fence when the queue has no eligible work',async()=>{
 for(let i=0;i<20;i++)expect(await claimAgentRun([],limits)).toBeNull();
 await rows('runs').insertOne({...queued('future','owner'),nextAttempt:Date.now()+60000});
 expect(await claimAgentRun([],limits)).toBeNull();expect(await rows('agentAdmission').countDocuments({})).toBe(0);
});
