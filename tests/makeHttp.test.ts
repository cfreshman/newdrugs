import {beforeAll,afterAll,it,expect} from 'vitest';
import type {Server} from 'node:http';
import {randomUUID} from 'node:crypto';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {createApp} from '../server/app';
import {hash,users,type User} from '../server/auth';
import {config} from '../server/config';

let server:Server,origin:string;
const token=`nd_${randomUUID()}`;
const request=(name:string,body:string)=>fetch(`${origin}/api/operations/${name}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-NewDrugs-Dev-Key':config.DEV_ACCESS_KEY,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body});
beforeAll(async()=>{
 if(new URL(config.MONGODB_URI).pathname!=='/newdrugs_test')throw Error('Isolated test database required');
 await connectDatabase();
 for(const collection of await db().collections())await collection.deleteMany({});
 const user:User={_id:'maker',handle:'maker',name:'Maker',city:'',cityKey:'',bio:'',interests:[],discoverable:false,balanceNanos:0,reservedNanos:0,createdAt:new Date().toISOString()};
 await users().insertOne(user);
 await rows('tokens').insertOne({_id:randomUUID(),userId:user._id,hash:hash(token),scope:'write',revokedAt:null,expiresAt:null});
 server=createApp().listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));if(db().databaseName==='newdrugs_test')for(const collection of await db().collections())await collection.deleteMany({});await mongo.close();});

it('accepts Make projects above the ordinary 32 KB request limit and reports oversized JSON as 413',async()=>{
 const src=`data:image/png;base64,${Buffer.alloc(105000,42).toString('base64')}`;
 const project={version:1,color:'#ffffff',layers:[{id:randomUUID(),type:'draw',x:0,y:0,w:1,h:1,src}]};
 const createBody=JSON.stringify({project});expect(Buffer.byteLength(createBody)).toBeGreaterThan(140000);
 const created=await request('make.create',createBody);expect(created.status).toBe(200);
 const draft=(await created.json()).data;
 const edited=await request('make.edit',JSON.stringify({draftId:draft.draftId,revision:draft.revision,project}));expect(edited.status).toBe(200);
 const ordinary=await request('identity.get',' '.repeat(33000)+'{}');expect(ordinary.status).toBe(413);
 expect((await ordinary.json()).error.code).toBe('request_too_large');
 const oversized=await request('make.create',JSON.stringify({project:{...project,layers:[{...project.layers[0],src:'A'.repeat(9*1024*1024)}]}}));
 expect(oversized.status).toBe(413);expect((await oversized.json()).error.code).toBe('request_too_large');
});
