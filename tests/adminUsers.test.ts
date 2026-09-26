import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {config} from '../server/config';
import {users,hash,type User} from '../server/auth';
import {listAdminUsers} from '../server/adminUsers';
import {adminKeys,executeAdminOperation} from '../server/adminCli';
import {createApp} from '../server/app';
import type {Server} from 'node:http';
import type {AddressInfo} from 'node:net';
let server:Server,origin:string;
async function clean(){if(db().databaseName!=='newdrugs_test'||config.STARTER_POOL_DB!=='newdrugs_test')throw new Error('Isolated test database required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{
 if(new URL(config.MONGODB_URI).pathname!=='/newdrugs_test'||config.STARTER_POOL_DB!=='newdrugs_test')throw new Error('Isolated test database required');
 await connectDatabase();await new Promise<void>(resolve=>{server=createApp().listen(0,'127.0.0.1',()=>resolve());});origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(async()=>{
 await clean();const base:User={_id:'base',name:'',city:'',cityKey:'',bio:'private profile text',interests:[],discoverable:false,createdAt:'2026-09-26T12:00:00.000Z',balanceNanos:855690460,reservedNanos:10000000,passwordHash:'private-password-hash',starterClaimKey:'private-claim-fingerprint',starterGranted:true};
 await users().insertMany([{...base,_id:'a',handle:'alice',name:'Alice'},{...base,_id:'b',handle:'bob',name:'Bob [test]',suspendedAt:'2026-09-26T13:00:00.000Z'},{...base,_id:'c',handle:'charlie',name:'Charlie'},{...base,_id:'guest'},{...base,_id:'internal',handle:'internal',internalTestAccount:true}]);
});
afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await clean();await mongo.close();});
it('lists registered accounts with an explicit metadata projection and excludes guests/test accounts',async()=>{
 const result=await listAdminUsers({});expect(result.total).toBe(3);expect(result.items.map(user=>user.id)).toEqual(['c','b','a']);expect(result.items.find(user=>user.id==='b')?.suspended).toBe(true);
 expect(result.items[0]).toMatchObject({balanceNanos:855690460,reservedNanos:10000000,starterGranted:true});
 expect(JSON.stringify(result)).not.toMatch(/private-password|private-claim|private profile|passwordHash|starterClaimKey|photos/);
});
it('paginates through equal creation dates even if the boundary account disappears',async()=>{
 const first=await listAdminUsers({limit:1});expect(first.items[0].id).toBe('c');await users().deleteOne({_id:'c'});
 const second=await listAdminUsers({limit:1,cursor:first.nextCursor!});expect(second.items[0].id).toBe('b');
 const third=await listAdminUsers({limit:1,cursor:second.nextCursor!});expect(third.items[0].id).toBe('a');expect(third.nextCursor).toBeNull();
 await expect(listAdminUsers({query:'alice',cursor:first.nextCursor!})).rejects.toThrow('Restart');await expect(listAdminUsers({cursor:'bad cursor'})).rejects.toThrow('Restart');
});
it('searches name or handle literally, including punctuation, and validates page limits',async()=>{
 expect((await listAdminUsers({query:'@ALICE'})).items.map(user=>user.id)).toEqual(['a']);expect((await listAdminUsers({query:'[test]'})).items.map(user=>user.id)).toEqual(['b']);expect((await listAdminUsers({query:'.*'})).total).toBe(0);
 await expect(listAdminUsers({limit:10000})).rejects.toThrow();expect((await listAdminUsers({limit:'2'})).items).toHaveLength(2);
});
it('requires owner authentication in the admin UI and accepts only authorized operator keys in the CLI',async()=>{
 const headers={'X-NewDrugs-Dev-Key':config.DEV_ACCESS_KEY};expect((await fetch(`${origin}/api/admin/users`,{headers})).status).toBe(401);
 await rows('sessions').insertOne({_id:hash('social-session'),userId:'a',expiresAt:new Date(Date.now()+60000)});
 expect((await fetch(`${origin}/api/admin/users`,{headers:{...headers,Cookie:`${config.SESSION_COOKIE}=social-session`}})).status).toBe(401);
 await rows('adminOwners').insertOne({_id:'owner',username:'owner',passwordHash:'test-hash',createdAt:new Date().toISOString()});await rows('adminSessions').insertOne({_id:hash('owner-session'),ownerId:'owner',expiresAt:new Date(Date.now()+60000)});
 const response=await fetch(`${origin}/api/admin/users?query=alice&limit=1`,{headers:{...headers,Cookie:`${config.SESSION_COOKIE}_admin=owner-session`}});expect(response.status).toBe(200);expect((await response.json()).items.map((user:{id:string})=>user.id)).toEqual(['a']);expect(response.headers.get('Cache-Control')).toBe('no-store');
 const key={_id:'operator',label:'Test operator',stages:['dev'],revokedAt:null,createdAt:new Date().toISOString()};await adminKeys().insertOne(key);
 expect(await executeAdminOperation(key,'users.list',{query:'bob'})).toMatchObject({total:1,items:[{id:'b'}]});await adminKeys().updateOne({_id:key._id},{$set:{revokedAt:new Date().toISOString()}});await expect(executeAdminOperation(key,'users.list',{})).rejects.toThrow();
});
