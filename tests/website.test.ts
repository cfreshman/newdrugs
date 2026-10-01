import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import sharp from 'sharp';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {users,profile,registerAccount,type Actor,type User} from '../server/auth';
import {changeUsername} from '../server/account';
import {executeOperation} from '../server/operations';
import {websiteRequest} from '../server/websiteServing';
import {deleteUpload} from '../server/uploads';
import {config} from '../server/config';
import * as publicFetch from '../server/publicFetch';
import {applyWebsiteChange,reservedWebsiteUsername,validateWebsiteFiles,websiteHostLabel} from '../shared/website';

const actor:Actor={userId:'owner',source:'external',scope:'write'};
const call=(name:string,input:unknown={},confirmed=false)=>executeOperation(name,input,actor,randomUUID(),{confirmed}) as Promise<any>;
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated database required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{await connectDatabase();});
beforeEach(async()=>{await clean();const user:User={_id:'owner',handle:'my_site',name:'Owner',bio:'',city:'',cityKey:'',interests:[],discoverable:true,balanceNanos:0,reservedNanos:0,createdAt:new Date().toISOString()};await users().insertOne(user);});
afterAll(async()=>{await clean();await mongo.close();});

it('validates paths, byte limits and exact single-file replacements',()=>{
 expect(websiteHostLabel('my_site')).toBe('my-site');
 expect(reservedWebsiteUsername('u_anything')).toBe(true);
 expect(reservedWebsiteUsername('understory')).toBe(false);
 expect(()=>validateWebsiteFiles([{path:'pages/index.html',content:'Home'},{path:'pages/index.html',content:'Duplicate'}])).toThrow(/different path/);
 expect(()=>validateWebsiteFiles([{path:'../secret.html' as 'pages/index.html',content:'No'}])).toThrow();
 expect(applyWebsiteChange([{path:'pages/index.html',content:'Hello friend'}],{kind:'replace',path:'pages/index.html',oldText:'friend',newText:'world'})[0].content).toBe('Hello world');
 expect(()=>applyWebsiteChange([{path:'pages/index.html',content:'a a'}],{kind:'replace',path:'pages/index.html',oldText:'a',newText:'b'})).toThrow(/not unique/);
});
it('reserves the code-host username prefix for new and renamed accounts',async()=>{
 const owner=(await users().findOne({_id:'owner'}))!;
 await expect(registerAccount('owner','u_example','encoded')).rejects.toMatchObject({code:'username_reserved'});
 await expect(changeUsername(owner,'u_example')).rejects.toMatchObject({code:'username_reserved'});
 expect((await users().findOne({_id:'owner'}))!.handle).toBe('my_site');
});

it('keeps a stable preview, revisioned draft and separate published snapshot across username changes',async()=>{
 const created=await call('website.create',{files:[{path:'pages/index.html',content:'<h1>Hello</h1>'}]});
 expect(created.revision).toBe(1);expect(created.previewUrl).toMatch(/website-preview/);
 expect((await call('website.get')).site.code).toBe(created.code);
 expect((await call('website.file',{path:'pages/index.html'})).content).toBe('<h1>Hello</h1>');
 expect((await call('website.file',{path:'pages/index.html',offset:4,limit:5})).content).toBe('Hello');
 expect((await call('website.search',{query:'Hello'})).items[0]).toMatchObject({path:'pages/index.html',offset:4});
 const edited=await call('website.patch',{revision:1,change:{kind:'replace',path:'pages/index.html',oldText:'Hello',newText:'Hi'}});
 expect(edited.revision).toBe(2);expect(edited.previewUrl).toBe(created.previewUrl);
 await expect(call('website.patch',{revision:1,change:{kind:'write',path:'pages/index.html',content:'Stale'}})).rejects.toMatchObject({code:'website_changed'});
 await expect(call('website.publish',{revision:2})).rejects.toBeTruthy();
 const published=await call('website.publish',{revision:2},true);expect(published.publishedRevision).toBe(2);
 expect(profile((await users().findOne({_id:'owner'}))!).websiteUrl).toContain(created.code);
 await call('website.patch',{revision:2,change:{kind:'write',path:'pages/index.html',content:'Draft again'}});
 expect((await rows('websites').findOne({_id:'owner'}) as any).published.files[0].content).toBe('<h1>Hi</h1>');
 await users().updateOne({_id:'owner'},{$set:{handle:'renamed'}});
 expect((await call('website.get')).site.code).toBe(created.code);
 expect((await call('website.revisions')).items.map((item:{revision:number})=>item.revision)).toEqual([2,1]);
 const restored=await call('website.restore',{revision:3,fromRevision:1});expect(restored.revision).toBe(4);
 const offline=await call('website.unpublish',{publishedRevision:2},true);expect(offline.publicUrl).toBeNull();
 expect(profile((await users().findOne({_id:'owner'}))!).websiteUrl).toBeUndefined();
});
it('keeps named checkpoints beyond ordinary edits and restores one without publishing',async()=>{
 await call('website.create',{files:[{path:'pages/index.html',content:'<h1>First</h1>'}]});
 const saved=await call('website.checkpoint.create',{revision:1,label:'First version'});
 await call('website.patch',{revision:1,change:{kind:'replace',path:'pages/index.html',oldText:'First',newText:'Second'}});
 expect((await call('website.checkpoint.file',{checkpointId:saved.id,path:'pages/index.html'})).content).toBe('<h1>First</h1>');
 expect((await call('website.checkpoints')).items[0].label).toBe('First version');
 const restored=await call('website.checkpoint.restore',{revision:2,checkpointId:saved.id});
 expect(restored.revision).toBe(3);expect(restored.publishedRevision).toBeNull();
 expect((await call('website.file',{path:'pages/index.html'})).content).toBe('<h1>First</h1>');
 await expect(call('website.checkpoint.delete',{checkpointId:saved.id})).rejects.toBeTruthy();
 expect((await call('website.checkpoint.delete',{checkpointId:saved.id},true)).deleted).toBe(true);
});
it('saves one bounded public reference source for later ranged inspection',async()=>{
 const source=Buffer.from('<html><title>Reference</title><h1>Work</h1><a href="/about">About</a><link rel="stylesheet" href="/site.css"></html>');
 const fetch=vi.spyOn(publicFetch,'fetchPublic').mockResolvedValue({bytes:source,url:'https://example.com/',mime:'text/html'});
 try{
  const opened=await call('website.source.open',{url:'https://example.com/'});
  expect(opened.title).toBe('Reference');expect(opened.links[0].url).toBe('https://example.com/about');
  expect((await call('website.source.list')).items[0].sourceId).toBe(opened.sourceId);
  expect((await call('website.source.read',{sourceId:opened.sourceId,offset:13,limit:9})).content).toBe('Reference');
  expect((await call('website.source.search',{sourceId:opened.sourceId,query:'site.css'})).items).toHaveLength(1);
  expect((await call('website.source.open',{url:'https://example.com/'})).cached).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
 }finally{fetch.mockRestore();}
});
it('serves the draft as sandboxed content and removes published bytes on unpublish',async()=>{
 const site=await call('website.create',{files:[{path:'pages/index.html',content:'<link href="../styles/site.css"><img src="../assets/photo.webp"><h1>Draft</h1>'},{path:'styles/site.css',content:'h1{color:red}'}]});
 const token=(await rows('websites').findOne({_id:'owner'}))!.previewToken;
 const response=()=>{const state={status:200,headers:{} as Record<string,string>,body:''};const res:any={set(name:string|Record<string,string>,value?:string){if(typeof name==='string')state.headers[name]=value||'';else Object.assign(state.headers,name);return this;},status(value:number){state.status=value;return this;},send(value:string){state.body=value;return this;},end(){return this;}};return {state,res};};
 const request=async(path:string)=>{const {state,res}=response();await websiteRequest({method:'GET',path,headers:{host:'localhost:7330'}} as any,res,err=>{throw err;});return state;};
 const preview=await request(`/api/website-preview/${token}/`);
 expect(preview.body).toContain(`/api/website-preview/${token}/styles/site.css`);
 expect(preview.body).toContain(`/api/website-preview/${token}/assets/photo.webp`);
 expect(preview.headers['Content-Security-Policy']).toContain('sandbox');
 expect(preview.headers['X-Robots-Tag']).toContain('noindex');
 expect((await request(`/api/website-preview/${token}/styles/site.css`)).body).toBe('h1{color:red}');
 await call('website.publish',{revision:1},true);
 expect((await request(`/api/website-published/${site.code}/`)).body).toContain('Draft');
 await call('website.unpublish',{publishedRevision:1},true);
 expect((await request(`/api/website-published/${site.code}/`)).status).toBe(404);
});
it('uses an owned image only after attachment and removes its public reference on deletion',async()=>{
 const site=await call('website.create',{files:[{path:'pages/index.html',content:'<img src="/assets/photo.webp">'}]});
 const fileId=randomUUID();await rows('uploads').insertOne({_id:fileId,userId:'owner',name:'photo.webp',purpose:'agent_input',expectedBytes:5,sourceHash:'hash',bytes:5,mime:'image/webp',sha256:'hash',ready:true,createdAt:new Date().toISOString()});
 await users().updateOne({_id:'owner'},{$set:{storageBytes:5}});
 const attached=await call('website.asset.add',{revision:1,fileId});
 expect(attached.assets[0]).toMatchObject({path:`assets/${fileId}.webp`,fileId});
 expect(attached.assets[0].previewUrl).toContain(`/assets/${fileId}.webp`);
 const stored=await call('storage.list',{attachedTo:'websites'});expect(stored.items.map((item:{id:string})=>item.id)).toEqual([fileId]);expect(stored.items[0].attachments[0].url).toContain('website-preview');
 await call('website.publish',{revision:2},true);
 expect((await rows('websites').findOne({_id:'owner'}) as any).published.assets).toEqual([{path:`assets/${fileId}.webp`,fileId}]);
 await deleteUpload(actor,fileId);
 const after=await rows('websites').findOne({_id:'owner'}) as any;
 expect(after.revision).toBe(3);expect(after.assets).toEqual([]);expect(after.published.assets).toEqual([]);
 expect((await call('website.get')).site.code).toBe(site.code);
});
it('attaches existing profile and Log media without exposing original filenames',async()=>{
 await call('website.create',{files:[{path:'pages/index.html',content:'<h1>Media</h1>'}]});
 const photoId=randomUUID(),audioId=randomUUID();
 await rows('uploads').insertMany([
  {_id:photoId,userId:'owner',name:'private-profile-name.webp',purpose:'profile_photo',expectedBytes:5,sourceHash:'hash',bytes:5,mime:'image/webp',sha256:'hash',ready:true,createdAt:new Date().toISOString()},
  {_id:audioId,userId:'owner',name:'private-log-name.mp3',purpose:'log_media',logEntryId:randomUUID(),expectedBytes:5,sourceHash:'hash',bytes:5,mime:'audio/mpeg',sha256:'hash',ready:true,createdAt:new Date().toISOString()},
 ]);
 const photo=await call('website.asset.add',{revision:1,fileId:photoId});
 const audio=await call('website.asset.add',{revision:2,fileId:audioId});
 expect(photo.assets[0].path).toBe(`assets/${photoId}.webp`);
 expect(audio.assets[1].path).toBe(`assets/${audioId}.mp3`);
 expect(JSON.stringify(audio)).not.toContain('private-profile-name');
 expect(JSON.stringify(audio)).not.toContain('private-log-name');
});
it('imports one selected public image into owned storage and retries without duplicating it',async()=>{
 await call('website.create',{files:[{path:'pages/index.html',content:'<h1>Import</h1>'}]});
 const bytes=await sharp({create:{width:2,height:2,channels:4,background:'#88ccff'}}).png().toBuffer();
 const fetch=vi.spyOn(publicFetch,'fetchPublic').mockResolvedValue({bytes,url:'https://example.com/photo.png',mime:'image/png'});
 const key=randomUUID();
 try{
  const first=await executeOperation('website.media.import',{revision:1,url:'https://example.com/photo.png'},actor,key) as any;
  expect(first.assets).toHaveLength(1);expect(first.assets[0].path).toMatch(/^assets\/[a-f0-9-]+\.webp$/);
  const retry=await executeOperation('website.media.import',{revision:1,url:'https://example.com/photo.png'},actor,key) as any;
  expect(retry.assets).toEqual(first.assets);expect(fetch).toHaveBeenCalledTimes(1);
  expect(await rows('uploads').countDocuments({userId:'owner',ready:true})).toBe(1);
 }finally{fetch.mockRestore();}
});
it('serves both public hostnames and moves the friendly one when the username changes',async()=>{
 const site=await call('website.create',{files:[{path:'pages/index.html',content:'<h1>My site</h1>'}]});
 await call('website.publish',{revision:1},true);
 const prior=config.APP_ENV;config.APP_ENV='production';
 const request=async(host:string,path='/')=>{const state={status:200,body:'',headers:{} as Record<string,string>};const res:any={set(name:string|Record<string,string>,value?:string){if(typeof name==='string')state.headers[name]=value||'';else Object.assign(state.headers,name);return this;},status(value:number){state.status=value;return this;},send(value:string){state.body=value;return this;},end(){return this;}};await websiteRequest({method:'GET',path,headers:{host}} as any,res,err=>{throw err;});return state;};
 try{
  expect((await request('my-site.druggie.org')).body).toContain('My site');
  expect((await request(`u-${site.code}.druggie.org`)).body).toContain('My site');
  expect((await request('unknown.druggie.org')).status).toBe(404);
  expect((await request('my-site.druggie.org','/api/bootstrap')).status).toBe(404);
  await users().updateOne({_id:'owner'},{$set:{handle:'new_name'}});
  expect((await request('my-site.druggie.org')).status).toBe(404);
  expect((await request('new-name.druggie.org')).body).toContain('My site');
  expect((await request(`u-${site.code}.druggie.org`)).body).toContain('My site');
  await users().updateOne({_id:'owner'},{$set:{handle:'u_legacy'}});
  expect(profile((await users().findOne({_id:'owner'}))!).websiteUrl).toBe(`https://u-${site.code}.druggie.org/`);
  expect((await request('u-legacy.druggie.org')).status).toBe(404);
 }finally{config.APP_ENV=prior;}
});
