import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {connectDatabase,db,mongo,rows,transaction} from '../server/db';
import {config} from '../server/config';
import {users,type Actor,type User} from '../server/auth';
import {syncLogContacts,listLogContacts,invalidateLogContacts,invalidateAllLogContacts,repairLogContacts,backfillLogContacts} from '../server/logContacts';
const actor:Actor={userId:'me',source:'external',scope:'write'};
const clean=async()=>{if(db().databaseName!=='newdrugs_test')throw Error('Isolated test database required');for(const collection of await db().collections())await collection.deleteMany({});};
beforeAll(async()=>{if(new URL(config.MONGODB_URI).pathname!=='/newdrugs_test')throw Error('Isolated test database required');await connectDatabase();});
beforeEach(async()=>{await clean();const base:User={_id:'me',handle:'me',name:'Me',bio:'',city:'',cityKey:'',interests:[],discoverable:true,balanceNanos:0,reservedNanos:0,createdAt:new Date().toISOString()};await users().insertMany([base,{...base,_id:'a',handle:'a'},{...base,_id:'b',handle:'b'},{...base,_id:'friend',handle:'friend'}]);await rows('connections').insertOne({_id:'friend:me',members:['me','friend'],status:'accepted'});});
afterAll(async()=>{await clean();await mongo.close();});
async function entry(members=['me','a','b']){const _id=randomUUID();await rows('logEntries').insertOne({_id,members});await syncLogContacts(_id);return _id;}
it('maintains exact counters idempotently through membership edits and deletion',async()=>{
 const first=await entry(),second=await entry(['me','a']);await syncLogContacts(first);let page=await listLogContacts(actor,{});expect(page.items.find(person=>person.id==='a')?.sharedHangouts).toBe(2);expect(page.items.find(person=>person.id==='b')?.sharedHangouts).toBe(1);
 await rows('logEntries').updateOne({_id:first},{$set:{members:['me','b']}});await syncLogContacts(first);page=await listLogContacts(actor,{});expect(page.items.find(person=>person.id==='a')?.sharedHangouts).toBe(1);
 await rows('logEntries').updateOne({_id:second},{$set:{deletedAt:new Date().toISOString()}});await syncLogContacts(second);expect((await listLogContacts(actor,{})).items.map(person=>person.id)).not.toContain('a');
});
it('withholds stale third-party counts after blocking, then repairs in bounded batches',async()=>{
 await entry();await entry(['me','b']);await transaction(async session=>{await rows('blocks').insertOne({_id:'me:a',pairId:'a:me',members:['me','a']},{session});await invalidateLogContacts(['me','a'],session);});
 const pending=await listLogContacts(actor,{});expect(pending.indexing).toBe(true);expect(pending.items.map(person=>person.id)).toEqual(['friend']);
 for(let i=0;i<8;i++)await repairLogContacts(1);const current=await listLogContacts(actor,{});expect(current.items.find(person=>person.id==='b')?.sharedHangouts).toBe(1);expect(current.items.map(person=>person.id)).not.toContain('a');
});
it('invalidates aggregate generations on suspension and never exposes a hidden shared entry count',async()=>{
 await entry();await transaction(async session=>{await users().updateOne({_id:'a'},{$set:{suspendedAt:new Date().toISOString()}},{session});await invalidateAllLogContacts(session);});
 expect((await listLogContacts(actor,{})).items.map(person=>person.id)).toEqual(['friend']);await repairLogContacts();expect((await listLogContacts(actor,{})).items.map(person=>person.id)).toEqual(['friend']);
 await transaction(async session=>{await users().updateOne({_id:'a'},{$unset:{suspendedAt:''}},{session});await invalidateAllLogContacts(session);});await listLogContacts(actor,{});await repairLogContacts();expect((await listLogContacts(actor,{})).items.find(person=>person.id==='b')?.sharedHangouts).toBe(1);
});
it('backfills existing entries and pages candidates without hydrating or aggregating hangout history',async()=>{
 await rows('logEntries').insertMany([{_id:'one',members:['me','a']},{_id:'two',members:['me','b']}]);expect(await backfillLogContacts(1)).toBe(1);expect(await backfillLogContacts(1)).toBe(1);expect(await backfillLogContacts(1)).toBe(0);expect(await backfillLogContacts(1)).toBe(0);
 const first=await listLogContacts(actor,{limit:1}),second=await listLogContacts(actor,{limit:1,before:first.nextCursor!}),third=await listLogContacts(actor,{limit:1,before:second.nextCursor!});expect(new Set([...first.items,...second.items,...third.items].map(person=>person.id)).size).toBe(3);expect(first.indexing).toBe(false);expect(third.nextCursor).toBeNull();
 expect((await listLogContacts({...actor,background:true,accountActivity:false},{query:'friend'})).items).toEqual([]);
});
