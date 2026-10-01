import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {users,type Actor,type User} from '../server/auth';
import {executeOperation} from '../server/operations';
import {processCircleWork} from '../server/circle';
import {config} from '../server/config';

const actor=(userId:string):Actor=>({userId,source:'external',scope:'write'});
const call=(name:string,input:unknown,userId:string,confirmed=false)=>executeOperation(name,input,actor(userId),randomUUID(),{confirmed}) as Promise<any>;
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated test database required');for(const collection of await db().collections())await collection.deleteMany({});}
async function drain(){for(let index=0;index<100;index++){await processCircleWork();if((await rows('circleMeta').findOne({_id:'backfill'}))?.done&&!await rows('circleJobs').countDocuments({}))return;}throw Error('Circle indexing did not drain');}
beforeAll(async()=>{if(new URL(config.MONGODB_URI).pathname!=='/newdrugs_test')throw Error('Isolated test database required');await connectDatabase();});
beforeEach(async()=>{await clean();const base:User={_id:'a',handle:'a',name:'A',bio:'',city:'',cityKey:'',interests:[],discoverable:true,balanceNanos:0,reservedNanos:0,createdAt:new Date().toISOString()};await users().insertMany(['a','b','c','d'].map(id=>({...base,_id:id,handle:id,name:id.toUpperCase()})));const edge=(a:string,b:string)=>({ _id:[a,b].sort().join(':'),members:[a,b],fromId:a,toId:b,note:'Hi',status:'accepted',createdAt:new Date().toISOString()});await rows('connections').insertMany([edge('a','b'),edge('a','d'),edge('b','c'),edge('c','d')]);});
afterAll(async()=>{await clean();await mongo.close();});

it('precomputes mutual counts and updates them after a disconnect and block',async()=>{
 await drain();
 let circle=await call('people.search',{scope:'circle'},'a');
 expect(circle.items.find((person:any)=>person.id==='c')?.mutualCount).toBe(2);
 expect(circle.items.find((person:any)=>person.id==='c')?.mutualFriends.map((person:any)=>person.id).sort()).toEqual(['b','d']);
 expect((await call('people.mutuals',{personId:'c',limit:20},'a')).items.map((person:any)=>person.id)).toEqual(['b','d']);
 await rows('circlePairs').updateOne({_id:'a:c'},{$unset:{previewIds:''}});
 await rows('circleMeta').updateOne({_id:'preview-backfill'},{$set:{done:false,cursor:''}});
 await processCircleWork();
 expect((await rows('circlePairs').findOne({_id:'a:c'}))?.previewIds).toEqual(['b','d']);
 expect((await call('people.search',{scope:'all'},'a')).items.find((person:any)=>person.id==='c')?.mutualCount).toBe(2);
 await call('connections.disconnect',{connectionId:'a:d'},'a',true);await drain();
 circle=await call('people.search',{scope:'circle'},'a');expect(circle.items.find((person:any)=>person.id==='c')?.mutualCount).toBe(1);
 expect(circle.items.find((person:any)=>person.id==='c')?.mutualFriends.map((person:any)=>person.id)).toEqual(['b']);
 await call('people.block',{personId:'b',blocked:true},'a');await drain();
 circle=await call('people.search',{scope:'circle'},'a');expect(circle.items.some((person:any)=>person.id==='c')).toBe(false);
 await call('people.block',{personId:'b',blocked:false},'a');await drain();
 circle=await call('people.search',{scope:'circle'},'a');expect(circle.items.find((person:any)=>person.id==='c')?.mutualCount).toBe(1);
});
