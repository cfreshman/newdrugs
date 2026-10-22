import {randomUUID} from 'node:crypto';
import {EventEmitter} from 'node:events';
import type {Server} from 'node:http';
import type {Response} from 'express';
import {afterAll,beforeAll,it,expect,vi} from 'vitest';
import {createApp} from '../server/app';
import {connectDatabase,db,mongo,rows,transaction} from '../server/db';
import {users,hash,type Actor,type User} from '../server/auth';
import {config} from '../server/config';
import {executeOperation} from '../server/operations';
import {resolveRecordContexts} from '../server/recordContext';
import {resolvePageContext} from '../server/pageContext';
import {validateInboxLinks} from '../server/inbox';
import {publishArtifactChange} from '../server/artifacts';
import {pagePreview} from '../server/pagePreviews';
import {streamLiveState,stopLiveState} from '../server/liveState';
import {ARTIFACT_REQUEST_BYTES,type ArtifactDetail,type ArtifactSummary} from '../shared/artifacts';

const owner=`artifact-integration-${randomUUID()}`,other=`artifact-integration-${randomUUID()}`;
const token=`nd_${randomUUID()}`,actor:Actor={userId:owner,source:'external',scope:'write'};
let server:Server,origin:string;
const write=(name:string,input:unknown,confirmed=false)=>executeOperation(name,input,actor,randomUUID(),{confirmed}) as Promise<any>;
const request=(name:string,input:unknown)=>fetch(`${origin}/api/operations/${name}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'X-NewDrugs-Dev-Key':config.DEV_ACCESS_KEY,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:typeof input==='string'?input:JSON.stringify(input)});
beforeAll(async()=>{
 if(new URL(config.MONGODB_URI).pathname!=='/newdrugs_test')throw Error('Isolated test database required');
 await connectDatabase();
 for(const id of [owner,other])await users().insertOne({_id:id,handle:id,name:'Artifact test',bio:'',city:'',cityKey:'',interests:[],discoverable:false,balanceNanos:0,reservedNanos:0,createdAt:new Date().toISOString()} as User);
 await rows('tokens').insertOne({_id:randomUUID(),userId:owner,hash:hash(token),scope:'write',revokedAt:null,expiresAt:null});
 server=createApp().listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
afterAll(async()=>{
 await stopLiveState();if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));
 if(db().databaseName==='newdrugs_test'){
  for(const name of ['artifacts','artifactVersions','receipts','tokens','sessions','liveSubscriptions'])await rows(name).deleteMany({userId:{$in:[owner,other]}});
  await rows('artifactUsage').deleteMany({_id:{$in:[owner,other]}});await rows('recordEvents').deleteMany({userIds:{$in:[owner,other]}});await users().deleteMany({_id:{$in:[owner,other]}});
 }
 await mongo.close();
});
it('uses a narrow artifact HTTP allowance without raising ordinary JSON limits',async()=>{
 const created=await request('artifacts.create',{title:'Large private display',bodyHtml:`<p>${'a'.repeat(40_000)}</p>`,ephemeral:true});expect(created.status).toBe(200);
 const value=(await created.json()).data as ArtifactSummary;
 expect((await request('artifacts.update',{artifactId:value.id,revision:value.revision,data:{caption:'b'.repeat(35_000)}})).status).toBe(200);
 const ordinary=await request('identity.get',' '.repeat(33_000)+'{}');expect(ordinary.status).toBe(413);
 const tooLarge=await request('artifacts.create',JSON.stringify({title:'Too large',bodyHtml:'a'.repeat(ARTIFACT_REQUEST_BYTES)}));expect(tooLarge.status).toBe(413);
 const conflicting=await request('artifacts.update',{artifactId:value.id,revision:2,data:{x:1},dataPatches:[{op:'set',path:['x'],value:2}]});expect(conflicting.status).toBe(422);
});
it('reauthorizes exact refresh context and keeps HTML/data out of attached model context',async()=>{
 const created=await write('artifacts.create',{title:'Selected graph',bodyHtml:'<p>private body payload</p>',data:{secret:'private data payload'},refreshInstruction:'Read current records.',ephemeral:true});
 const context=await resolveRecordContexts(owner,[{kind:'artifact',id:created.id,revision:created.revision}]);expect(context.attachments).toEqual([{kind:'artifact',id:created.id,revision:1,title:'Selected graph'}]);
 expect(JSON.stringify(context.content)).toContain(created.id);expect(JSON.stringify(context.content)).not.toContain('private body payload');expect(JSON.stringify(context.content)).not.toContain('private data payload');
 expect((await resolveRecordContexts(other,[{kind:'artifact',id:created.id}])).attachments[0].id).toBe(created.id);
 expect(await resolvePageContext(owner,{route:`/friends/artifacts/${created.id}`})).toMatchObject({surfaceId:'artifacts',resourceId:created.id,resourceType:'artifact'});
 expect(await resolvePageContext(other,{route:`/artifacts/${created.id}`})).toMatchObject({resourceId:created.id,resourceType:'artifact'});
 await validateInboxLinks(owner,[{title:'Graph',url:`https://dev.druggie.org/artifacts/${created.id}`}]);
 await write('artifacts.update',{artifactId:created.id,revision:1,data:{fresh:true}});
 await expect(resolveRecordContexts(owner,[{kind:'artifact',id:created.id,revision:1}])).rejects.toMatchObject({code:'artifact_changed'});
 await write('artifacts.delete',{artifactId:created.id,revision:2},true);
 await expect(validateInboxLinks(owner,[{title:'Graph',url:`https://dev.druggie.org/artifacts/${created.id}`}])).rejects.toBeTruthy();
});
it('opens shared artifact content and its generic shell without a session while management remains protected',async()=>{
 const created=await write('artifacts.create',{title:'Shared graph',bodyHtml:'<p>Shared output</p>',data:{value:7},ephemeral:true,refreshInstruction:'Owner-private instruction'});
 const headers={'X-NewDrugs-Dev-Key':config.DEV_ACCESS_KEY};
 const result=await fetch(`${origin}/api/artifacts/${created.id}`,{headers});expect(result.status).toBe(200);
 const content=await result.json();expect(content).toMatchObject({id:created.id,title:'Shared graph',data:{value:7}});
 const state=await fetch(`${origin}/api/artifacts/${created.id}/state`,{headers});expect(state.status).toBe(200);expect(await state.json()).toEqual({id:created.id,revision:1,contentRevision:1,updatedAt:content.updatedAt,assets:[]});
 expect(JSON.stringify(content)).not.toContain('Owner-private instruction');expect(content).not.toHaveProperty('producer');expect(content).not.toHaveProperty('ephemeral');expect(result.headers.get('x-robots-tag')).toContain('noindex');
 const shell=await fetch(`${origin}/api/artifacts/frame`,{headers});expect(shell.status).toBe(200);expect(shell.headers.get('content-security-policy')).toContain('sandbox allow-scripts');expect(await shell.text()).not.toContain('Shared output');
 const managed=await fetch(`${origin}/api/operations/artifacts.update`,{method:'POST',headers:{...headers,Origin:config.APP_ORIGIN,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({artifactId:created.id,revision:1,title:'Unauthorized'})});expect(managed.status).toBe(401);
 const preview=await pagePreview(`/artifacts/${created.id}`);expect(preview).toMatchObject({title:'Shared graph (New Drugs)',private:true,imagePath:'/share.png?v=gradient'});
 expect(JSON.stringify(preview)).not.toContain('Owner-private');
 await write('artifacts.delete',{artifactId:created.id,revision:1},true);
 expect((await fetch(`${origin}/api/artifacts/${created.id}`,{headers})).status).toBe(404);
 expect((await pagePreview(`/artifacts/${created.id}`)).title).toBe('View artifact (New Drugs)');
});
it('ignores unrelated invalid reader identity only for gated capability GET and HEAD reads',async()=>{
 const created=await write('artifacts.create',{title:'Bearer link',bodyHtml:'<p>Public to the link holder</p>'});
 const invalid={'X-NewDrugs-Dev-Key':config.DEV_ACCESS_KEY,Authorization:'Bearer invalid'};
 const anonymousRateId=hash(JSON.stringify(['api:operations',60000,'127.0.0.1']));
 const before=Number((await rows('requestRates').findOne({_id:anonymousRateId}))?.totalHits||0);
 const content=await fetch(`${origin}/api/artifacts/${created.id}`,{headers:invalid});expect(content.status).toBe(200);expect((await content.json()).id).toBe(created.id);
 expect(Number((await rows('requestRates').findOne({_id:anonymousRateId}))?.totalHits)).toBeGreaterThan(before);
 expect((await fetch(`${origin}/api/artifacts/${created.id}`,{method:'HEAD',headers:invalid})).status).toBe(200);
 expect((await fetch(`${origin}/api/artifacts/${created.id}/state`,{headers:invalid})).status).toBe(200);
 expect((await fetch(`${origin}/api/artifacts/frame`,{headers:invalid})).status).toBe(200);
 expect((await fetch(`${origin}/api/artifacts/${created.id}/assets/missing`,{headers:invalid})).status).toBe(404);
 // An invalid bearer alone must not bypass the staging gate.
 expect((await fetch(`${origin}/api/artifacts/${created.id}`,{headers:{Authorization:'Bearer invalid'}})).status).toBe(401);
 expect((await fetch(`${origin}/api/artifacts/${created.id}`)).status).toBe(404);
 expect((await fetch(`${origin}/api/bootstrap`,{headers:invalid})).status).toBe(401);
 expect((await fetch(`${origin}/api/operations/artifacts.get`,{method:'POST',headers:{...invalid,'Content-Type':'application/json'},body:JSON.stringify({artifactId:created.id})})).status).toBe(401);
 expect((await fetch(`${origin}/api/artifacts/${created.id}`,{method:'POST',headers:invalid})).status).toBe(401);

 const secret=randomUUID();await rows('sessions').insertOne({_id:hash(secret),userId:other,expiresAt:new Date(Date.now()+60000)});
 await users().updateOne({_id:other},{$set:{suspendedAt:new Date().toISOString()}});
 try{
  const headers={'X-NewDrugs-Dev-Key':config.DEV_ACCESS_KEY,Cookie:`${config.SESSION_COOKIE}=${secret}`};
  expect((await fetch(`${origin}/api/artifacts/${created.id}`,{headers})).status).toBe(200);
  expect((await fetch(`${origin}/api/bootstrap`,{headers})).status).toBe(403);
 }finally{await users().updateOne({_id:other},{$unset:{suspendedAt:''}});}
 await users().updateOne({_id:owner},{$set:{suspendedAt:new Date().toISOString()}});
 try{expect((await fetch(`${origin}/api/artifacts/${created.id}`,{headers:invalid})).status).toBe(404);}
 finally{await users().updateOne({_id:owner},{$unset:{suspendedAt:''}});}
});
it('keeps numeric and legacy version URLs fixed while the canonical URL opens the latest source',async()=>{
 const created=await write('artifacts.create',{title:'Versioned graph',bodyHtml:'<p>Graph</p>',data:{value:1},refreshInstruction:'Owner-private instruction'});
 await write('artifacts.update',{artifactId:created.id,revision:1,title:'Current graph',data:{value:2}});
 const headers={'X-NewDrugs-Dev-Key':config.DEV_ACCESS_KEY};
 for(const version of ['1','legacy']){
  const result=await fetch(`${origin}/api/artifacts/${created.id}?version=${version}`,{headers});expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({title:'Versioned graph',data:{value:1},revision:1,contentRevision:1});
  const state=await fetch(`${origin}/api/artifacts/${created.id}/state?version=${version}`,{headers});expect(state.status).toBe(200);expect(await state.json()).toMatchObject({revision:1,contentRevision:1,assets:[]});
 }
 const current=await fetch(`${origin}/api/artifacts/${created.id}`,{headers});expect(await current.json()).toMatchObject({title:'Current graph',data:{value:2},revision:2,contentRevision:2});
 expect((await fetch(`${origin}/api/artifacts/${created.id}?version=3`,{headers})).status).toBe(404);
 for(const version of ['0','01','1.0','1e0','-1','latest','1&version=2'])expect((await fetch(`${origin}/api/artifacts/${created.id}?version=${version}`,{headers})).status).toBe(422);
 expect((await fetch(`${origin}/api/artifacts/${created.id}/assets/missing?version=1`,{headers})).status).toBe(404);
 await write('artifacts.delete',{artifactId:created.id,revision:2},true);
 expect((await fetch(`${origin}/api/artifacts/${created.id}?version=1`,{headers})).status).toBe(404);
});
async function subscribe(userId:string,interests:string){
 const secret=randomUUID(),channel=randomUUID(),chunks:string[]=[];
 await rows('sessions').insertOne({_id:hash(secret),userId,expiresAt:new Date(Date.now()+60000)});
 const emitter=new EventEmitter();
 const response=Object.assign(emitter,{writableLength:0,writableEnded:false,status(){return this;},set(){return this;},flushHeaders(){},write(value:string){chunks.push(value);return true;},end(){this.writableEnded=true;emitter.emit('close');}});
 await streamLiveState({actor:{userId,source:'browser',scope:'write'},cookies:{[config.SESSION_COOKIE]:secret},query:{channel,records:interests}} as any,response as unknown as Response);
 return {events:()=>chunks.filter(value=>value.startsWith('event: records')).map(value=>JSON.parse(value.split('data: ')[1]))};
}
it('coalesces changed artifact IDs only to the owner sessions interested in artifacts',async()=>{
 const visible=await subscribe(owner,'artifacts'),uninterested=await subscribe(owner,'posts'),unrelated=await subscribe(other,'artifacts');
 const id=randomUUID();await transaction(session=>publishArtifactChange(owner,id,session));
 await vi.waitFor(()=>expect(visible.events().some(event=>event.artifacts?.some((item:{id:string})=>item.id===id))).toBe(true));
 expect(uninterested.events()).toEqual([]);expect(unrelated.events()).toEqual([]);
 await transaction(session=>publishArtifactChange(owner,id,session,true));
 await vi.waitFor(()=>expect(visible.events().some(event=>event.artifacts?.some((item:{id:string;deleted?:boolean})=>item.id===id&&item.deleted))).toBe(true));
});
