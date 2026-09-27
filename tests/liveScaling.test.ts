import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {EventEmitter} from 'node:events';import {randomUUID} from 'node:crypto';
import type {Request,Response} from 'express';
import {connectDatabase,db,mongo,rows,transaction} from '../server/db';
import {users,hash,type User} from '../server/auth';import {config} from '../server/config';
import {streamLiveState,stopLiveState,liveStateMetrics} from '../server/liveState';
import {publishLogChange} from '../server/recordEvents';
import {acquireLiveLease,liveLeases,liveInstance} from '../server/liveSubscriptions';
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated DB required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{await connectDatabase();});beforeEach(async()=>{await stopLiveState();await clean();for(const id of ['one','two'])await users().insertOne({_id:id,handle:id,name:id,bio:'',city:'',cityKey:'',interests:[],discoverable:false,balanceNanos:0,reservedNanos:0,createdAt:new Date().toISOString()} as User);});afterAll(async()=>{await stopLiveState();await clean();await mongo.close();});
async function subscribe(userId:string,interests='log'){
 const secret=randomUUID(),channel=randomUUID(),chunks:string[]=[];await rows('sessions').insertOne({_id:hash(secret),userId,expiresAt:new Date(Date.now()+60000)});
 const emitter=new EventEmitter();const response=Object.assign(emitter,{writableLength:0,writableEnded:false,status(){return this;},set(){return this;},flushHeaders(){},write(value:string){chunks.push(value);return true;},end(){this.writableEnded=true;emitter.emit('close');}});
 await streamLiveState({actor:{userId,source:'browser',scope:'write'},cookies:{[config.SESSION_COOKIE]:secret},query:{channel,records:interests}} as any,response as unknown as Response);
 return {response,chunks,channel,events:()=>chunks.filter(value=>value.startsWith('event: records')).map(value=>JSON.parse(value.split('data: ')[1]))};
}
it('targets Log changes and removals without notifying unrelated accounts or uninterested views',async()=>{
 const a=await subscribe('one'),uninterested=await subscribe('one','posts'),b=await subscribe('two');
 await transaction(session=>publishLogChange(null,{_id:'entry',members:['one'],date:'2026-09-27'},session));
 await vi.waitFor(()=>expect(a.events().some(value=>value.log?.[0]?.id==='entry')).toBe(true));expect(uninterested.events()).toEqual([]);expect(b.events()).toEqual([]);
 await transaction(session=>publishLogChange({_id:'entry',members:['one','two'],date:'2026-09-27'},{_id:'entry',members:['two'],date:'2026-09-27'},session));
 await vi.waitFor(()=>expect(b.events()).toHaveLength(1));expect(a.events()).toHaveLength(2);
});
it('shares a wallet projection between tabs and enforces the account connection slots across instances',async()=>{
 const a=await subscribe('one'),b=await subscribe('one'),before=liveStateMetrics().projectionReads;
 await users().updateOne({_id:'one'},{$inc:{balanceNanos:100}});
 await vi.waitFor(()=>expect([a,b].every(tab=>tab.chunks.some(value=>value.includes('"balanceNanos":100')))).toBe(true));expect(liveStateMetrics().projectionReads-before).toBe(1);
 for(let index=0;index<6;index++)await acquireLiveLease('one','other-session',randomUUID(),[]);
 await expect(acquireLiveLease('one','last-session',randomUUID(),[])).rejects.toMatchObject({code:'live_limit'});
 await liveLeases().updateOne({userId:'one',sessionId:'other-session'},{$set:{instance:'another-process',expiresAt:new Date(0)}});
 expect((await acquireLiveLease('one','new-session',randomUUID(),[])).instance).toBe(liveInstance);
});
