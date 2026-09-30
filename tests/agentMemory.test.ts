import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {users,type User,type Actor} from '../server/auth';
import {executeOperation} from '../server/operations';
import {agentMemoryContext} from '../server/agentMemory';
import {messageInput} from '../server/sessionContext';
import type {RunRecord} from '../server/runTypes';
const actor:Actor={userId:'me',source:'external',scope:'write'};
const call=(name:string,input:unknown={},confirmed=false,key=randomUUID(),who:Actor=actor)=>executeOperation(name,input,who,key,{confirmed}) as Promise<any>;
const save=(key:string,content='A durable preference',core=true,revision=0)=>call('agent.memory.save',{key,title:key,content,core,revision});
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated database required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{await connectDatabase();});beforeEach(async()=>{await clean();const base:User={_id:'me',handle:'me',name:'Me',bio:'',city:'',cityKey:'',interests:[],discoverable:false,balanceNanos:1e9,reservedNanos:0,createdAt:new Date().toISOString()};await users().insertMany([base,{...base,_id:'other',handle:'other'}]);});afterAll(async()=>{await clean();await mongo.close();});
it('separates core/on-demand slots, revisions, idempotency and account ownership',async()=>{
 const key=randomUUID(),input={key:'voice',title:'Voice',content:'Keep it brief',core:true,revision:0};
 const first=await call('agent.memory.save',input,false,key);expect(first.saved).toBe(true);expect(await call('agent.memory.save',input,false,key)).toEqual(first);
 await save('idea','One future idea',false);const context=await call('agent.memory.context');expect(context.slots.map((note:any)=>note.key)).toEqual(['voice']);expect(context.pressure.slots).toBe(2);expect(context.pressure.estimator).toBe('utf8-third-v1');
 expect((await call('agent.memory.list',{core:false})).items.map((note:any)=>note.key)).toEqual(['idea']);
 await expect(save('voice','Changed',true,0)).rejects.toMatchObject({code:'memory_changed'});
 await expect(call('agent.memory.get',{key:'voice'},false,randomUUID(),{...actor,userId:'other'})).rejects.toMatchObject({status:404});
 await call('agent.memory.delete',{key:'voice',revision:1});expect((await call('agent.memory.context')).pressure.slots).toBe(1);
});
it('rejects over-budget saves without evicting other slots, including concurrent writes',async()=>{
 await save('one','a'.repeat(2500));await save('two','b'.repeat(2500));
 const results=await Promise.all([save('three','c'.repeat(3500)),save('four','d'.repeat(3500))]);expect(results.filter(result=>result.saved)).toHaveLength(1);
 const rejected=results.find(result=>!result.saved);expect(rejected.reason).toContain('Core memory is full');expect(rejected.pressure.coreUsed).toBeLessThanOrEqual(4000);
 let context=await call('agent.memory.context');expect(context.slots).toHaveLength(3);
 await save('one','a'.repeat(2500),false,1);context=await call('agent.memory.context');expect(context.slots).toHaveLength(2);expect(context.pressure.noncoreUsed).toBeGreaterThan(0);
});
it('requires explicit review for user instructions and snapshots personal context once per run',async()=>{
 await expect(call('agent.instructions.update',{text:'Keep it brief.',revision:0})).rejects.toMatchObject({code:'confirmation_required'});
 await call('agent.instructions.update',{text:'Keep it brief.',revision:0},true);await save('voice','Short answers');
 const run={_id:'fixture-run',userId:'me',text:'Hello',fileIds:[],timezone:'UTC',status:'queued'} as unknown as RunRecord;await rows<RunRecord>('runs').insertOne(run);
 const original=JSON.stringify(await messageInput(run));expect(original).toContain('Short answers');expect(original).toContain('Keep it brief.');
 await save('voice','Longer answers',true,1);expect(JSON.stringify(await messageInput({...run}))).toBe(original);
 const next={...run,_id:'next-run',memorySnapshot:undefined};await rows<RunRecord>('runs').insertOne({...next,memorySnapshot:undefined});expect(JSON.stringify(await messageInput(next))).toContain('Longer answers');
});
it('omits changed or revoked sources from automatic context and rejects another account’s chat as evidence',async()=>{
 await rows('messages').insertMany([{_id:'mine',userId:'me',role:'user',text:'I like short replies',createdAt:'2026-09-29T08:00:00.000Z'},{_id:'theirs',userId:'other',role:'user',text:'A private message',createdAt:'2026-09-29T08:01:00.000Z'}]);
 await call('agent.memory.save',{key:'voice',title:'Voice',content:'Short replies',core:true,revision:0,sources:[{kind:'chat',id:'mine'}]});
 expect((await agentMemoryContext('me')).slots).toMatchObject([{sources:[{kind:'chat',id:'mine',date:'2026-09-29'}]}]);
 await rows('messages').updateOne({_id:'mine'},{$set:{text:'I prefer detail now'}});expect(await agentMemoryContext('me')).toMatchObject({slots:[],omittedSlots:1});
 await rows('messages').deleteOne({_id:'mine'});expect((await call('agent.memory.get',{key:'voice'})).slot.sourceStatus).toBe('unavailable');
 await expect(call('agent.memory.save',{key:'bad',title:'Bad',content:'Not mine',core:true,revision:0,sources:[{kind:'chat',id:'theirs'}]})).rejects.toMatchObject({status:404});
});
