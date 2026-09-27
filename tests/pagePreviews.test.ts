import {linkPreview,previewImage} from '../server/linkPreviews';
import {Binary} from 'mongodb';
import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';import {randomUUID,createHash} from 'node:crypto';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {connectDatabase,db,mongo,rows} from '../server/db';import {users,type User} from '../server/auth';import {config} from '../server/config';
import {pagePreview,readPagePreviewImage} from '../server/pagePreviews';import {renderPagePreview} from '../shared/pagePreview';import {createApp} from '../server/app';import type {Server} from 'node:http';
let folder:string,server:Server,origin:string;const originalData=config.DATA_DIR,originalStage=config.APP_ENV;const imageId=randomUUID(),privateImageId=randomUUID(),userId=randomUUID(),otherId=randomUUID(),code='a'.repeat(32);
const bytes=Buffer.from('test verified media'),hash=createHash('sha256').update(bytes).digest('hex');
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated DB required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{await connectDatabase();if(db().databaseName!=='newdrugs_test')throw Error('Isolated DB required');folder=await fs.mkdtemp(path.join(os.tmpdir(),'nd-preview-'));config.DATA_DIR=folder;await fs.mkdir(path.join(folder,'files'));await fs.writeFile(path.join(folder,'files',imageId),bytes);await fs.writeFile(path.join(folder,'files',privateImageId),bytes);server=createApp().listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;});
beforeEach(async()=>{config.APP_ENV=originalStage;await clean();const user:User={_id:userId,handle:'public_person',name:'A Person',bio:'Public bio',city:'',cityKey:'',interests:[],discoverable:true,balanceNanos:0,reservedNanos:0,createdAt:new Date().toISOString(),photos:[imageId]};await users().insertMany([user,{...user,_id:otherId,handle:'private_person',name:'PRIVATE NAME',bio:'PRIVATE BIO',discoverable:false,photos:[privateImageId]}]);await rows('uploads').insertMany([{_id:imageId,userId,name:'Public.webp',mime:'image/webp',ready:true,sha256:hash,bytes:bytes.length},{_id:privateImageId,userId:otherId,name:'PRIVATE.webp',mime:'image/webp',ready:true,sha256:hash,bytes:bytes.length}]);});
afterAll(async()=>{config.APP_ENV=originalStage;await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));await clean();await mongo.close();config.DATA_DIR=originalData;await fs.rm(folder,{recursive:true,force:true});});
it('never reads private hangout content into ordinary or alternate-mode link previews',async()=>{
 await rows('logEntries').insertOne({_id:'private',title:'SECRET TITLE',place:'SECRET PLACE',date:'2026-09-27',joinKey:code,members:[otherId],contributions:[{userId:otherId,note:'SECRET NOTE',fileIds:[privateImageId]}],coverFileId:privateImageId});
 for(const link of ['/log/private','/friends/log/private','/posts/log/private','/log/missing','/log/code/private']){const preview=await pagePreview(link);expect(preview.title).toBe('View hangout (New Drugs)');expect(preview.imagePath).toBe('/share.png?v=gradient');expect(preview.private).toBe(true);expect(JSON.stringify(preview)).not.toMatch(/SECRET|PRIVATE|private_person/);}
});
it('allows only the first eligible image through a current invite capability, and revokes it on reset or deletion',async()=>{
 await rows('logEntries').insertOne({_id:'private',title:'SECRET TITLE',joinKey:code,members:[userId,otherId],contributions:[{userId, note:'SECRET NOTE',fileIds:[imageId]},{userId:otherId,fileIds:[privateImageId]}],coverFileId:privateImageId});
 const preview=await pagePreview(`/log/join/${code}`);expect(preview.imagePath).toContain(`/api/share-images/log-invite/${code}`);expect(preview.private).toBe(true);expect(preview.title).toBe('SECRET TITLE (New Drugs)');expect(JSON.stringify(preview)).not.toContain('SECRET NOTE');expect((await readPagePreviewImage('log-invite',code)).file._id).toBe(privateImageId);
 await rows('logEntries').updateOne({_id:'private'},{$set:{joinKey:'b'.repeat(32)}});await expect(readPagePreviewImage('log-invite',code)).rejects.toMatchObject({status:404});expect((await pagePreview(`/log/join/${code}`)).imagePath).toBe('/share.png?v=gradient');
 await rows('logEntries').updateOne({_id:'private'},{$set:{deletedAt:'now'}});await expect(readPagePreviewImage('log-invite','b'.repeat(32))).rejects.toMatchObject({status:404});
});
it('publishes public posts and opted-in profiles, but not private profiles or removed/moderated/suspended content',async()=>{
 expect(await pagePreview(`/people/${otherId}`)).toMatchObject({title:'View profile (New Drugs)',description:'Made in New England',private:true});await expect(readPagePreviewImage('person',otherId)).rejects.toMatchObject({status:404});
 expect(await pagePreview(`/people/${userId}`)).toMatchObject({description:'Public bio',private:false});expect((await readPagePreviewImage('person',userId)).file._id).toBe(imageId);
 await rows('posts').insertOne({_id:'post',userId:otherId,text:'Intentionally public post',fileIds:[privateImageId]});expect(await pagePreview('/posts/post')).toMatchObject({description:'Intentionally public post',private:false});expect((await readPagePreviewImage('post','post')).file._id).toBe(privateImageId);
 await rows('posts').updateOne({_id:'post'},{$set:{moderatedAt:'now'}});expect((await pagePreview('/posts/post')).description).toBe('Made in New England');await expect(readPagePreviewImage('post','post')).rejects.toMatchObject({status:404});
 await users().updateOne({_id:userId},{$set:{discoverable:false}});await expect(readPagePreviewImage('person',userId)).rejects.toMatchObject({status:404});await users().updateOne({_id:otherId},{$set:{suspendedAt:'now'}});expect((await pagePreview('/posts/post')).private).toBe(true);
});
it('escapes preview text and preserves PWA/viewport metadata without duplicating old tags',async()=>{
 const template=await fs.readFile('index.html','utf8'),preview=await pagePreview(`/people/${userId}`);preview.title='Title <img src=x onerror="alert(1)">';preview.description='"/><script>bad()</script>';
 const html=renderPagePreview(template,preview,'https://druggie.org');expect(html).not.toContain('<script>bad');expect(html).not.toContain('<img src=x');expect(html).toContain('&lt;script&gt;');expect(html.match(/property="og:title"/g)).toHaveLength(1);expect(html.match(/<title>/g)).toHaveLength(1);expect(html).toContain('viewport-fit=cover');expect(html).toContain('/manifest.webmanifest');expect(html).not.toContain('og:image:width');
 const privateHtml=renderPagePreview(template,await pagePreview('/log/private'),'https://druggie.org');expect(privateHtml).toContain('noindex, nofollow');expect(await pagePreview('//evil.test/private')).toMatchObject({path:'/'});
});
it('exposes only public projections without login in production while keeping dev gated',async()=>{
 const route=`/api/page-preview?path=${encodeURIComponent('/people/'+userId)}`;
 expect((await fetch(origin+route)).status).toBe(404);expect((await fetch(origin+route,{headers:{Authorization:'Bearer fake'}})).status).toBe(401);
 const dev=await fetch(origin+route,{headers:{'X-NewDrugs-Dev-Key':config.DEV_ACCESS_KEY}});expect(dev.status).toBe(200);expect((await dev.json()).description).toBe('Public bio');
 config.APP_ENV='production';const response=await fetch(origin+route);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
 const photo=await fetch(`${origin}/api/share-images/person/${userId}`);expect(photo.status).toBe(200);expect(photo.headers.get('cache-control')).toBe('no-store');expect(Buffer.from(await photo.arrayBuffer())).toEqual(bytes);
 expect((await fetch(`${origin}/api/share-images/person/${otherId}`)).status).toBe(404);
});
it('shows invite notes, facts and photos before sign-in, and scopes every photo to that code',async()=>{
 await rows('logEntries').insertOne({_id:'invite',title:'A shared walk',date:'2026-09-27',place:'Park',joinKey:code,members:[otherId],coverFileId:privateImageId,contributions:[{userId:otherId,note:'SECRET DIARY NOTE',fileIds:[privateImageId]}]});
 config.APP_ENV='production';const response=await fetch(`${origin}/api/log-invites/${code}`);expect(response.status).toBe(200);const preview=await response.json();
 expect(preview).toMatchObject({title:'A shared walk',date:'2026-09-27',place:'Park',joined:false,photos:[{id:privateImageId,url:`/api/log-invites/${code}/photos/${privateImageId}`}],people:[{id:otherId}]});expect(preview.contributors).toEqual([expect.objectContaining({userId:otherId,note:'SECRET DIARY NOTE'})]);expect(JSON.stringify(preview)).not.toContain('PRIVATE BIO');
 const photo=await fetch(origin+preview.photos[0].url);expect(photo.status).toBe(200);expect(Buffer.from(await photo.arrayBuffer())).toEqual(bytes);
 expect((await fetch(`${origin}/api/log-invites/${code}/photos/${imageId}`)).status).toBe(404);
 await rows('logEntries').updateOne({_id:'invite'},{$set:{joinKey:'c'.repeat(32)}});expect((await fetch(origin+preview.photos[0].url)).status).toBe(404);expect((await fetch(`${origin}/api/log-invites/${code}`)).status).toBe(404);expect(await users().countDocuments()).toBe(2);
});

it('keeps first-party link cards fresh and never serves older cached invite photos',async()=>{
 const url=`${config.APP_ORIGIN}/log/join/${code}`,cacheId=createHash('sha256').update(`rich-v3:${url}`).digest('hex');
 await rows('logEntries').insertOne({_id:'live-invite',title:'Current title',date:'2026-09-27',place:'Park',joinKey:code,members:[otherId],coverFileId:privateImageId,contributions:[{userId:otherId,fileIds:[privateImageId]}]});
 await rows('linkPreviews').insertOne({_id:cacheId,preview:{url,hostname:new URL(url).hostname,title:'STALE TITLE',description:'Old description'},image:new Binary(bytes),expiresAt:new Date(Date.now()+86400000)});
 expect(await linkPreview(url,userId)).toMatchObject({title:'Current title (New Drugs)',imageUrl:expect.stringContaining(`/api/share-images/log-invite/${code}`)});
 await expect(previewImage(cacheId)).rejects.toMatchObject({status:404});
 await rows('logEntries').updateOne({_id:'live-invite'},{$set:{joinKey:'d'.repeat(32)}});expect(await linkPreview(url,userId)).toMatchObject({title:'View hangout (New Drugs)',imageUrl:'/share.png?v=gradient'});
 const direct=await linkPreview(`${config.APP_ORIGIN}/api/log-invites/${code}/photos/${privateImageId}`,userId);expect(direct.imageUrl).toBe(`/api/log-invites/${code}/photos/${privateImageId}`);
});


it('previews full contributions and links while authorizing every media request against the current code',async()=>{
 const audio=randomUUID(),video=randomUUID(),gone=randomUUID();
 for(const [id,mime] of [[audio,'audio/webm'],[video,'video/mp4'],[gone,'audio/webm']]){await fs.writeFile(path.join(folder,'files',id),bytes);await rows('uploads').insertOne({_id:id,userId:otherId,name:id,mime,ready:true,sha256:hash,bytes:bytes.length});}
 const note='A complete note. '.repeat(500);
 await rows('logEntries').insertOne({_id:'full-invite',title:'Full hangout',date:'2026-09-27',place:'Park',links:['https://freshman.dev'],recurrence:'anniversary',historicalPeople:['Historical friend'],joinKey:code,members:[otherId],contributions:[{userId:otherId,note,fileIds:[privateImageId,audio,video,imageId]},{userId,note:'REMOVED MEMBER NOTE',fileIds:[gone]}]});
 config.APP_ENV='production';
 const preview=await (await fetch(`${origin}/api/log-invites/${code}`)).json();
 expect(preview).toMatchObject({links:['https://freshman.dev'],recurrence:'anniversary',historicalPeople:['Historical friend'],contributors:[{userId:otherId,note}]});
 expect(preview.contributors[0].files.map((file:any)=>file.id)).toEqual([privateImageId,audio,video]);expect(JSON.stringify(preview)).not.toContain('REMOVED MEMBER NOTE');
 const mediaUrl=`${origin}/api/log-invites/${code}/media/${audio}`;
 const response=await fetch(mediaUrl,{headers:{Range:'bytes=1-4'}});expect(response.status).toBe(206);expect(response.headers.get('content-range')).toBe(`bytes 1-4/${bytes.length}`);expect(response.headers.get('cache-control')).toBe('no-store');expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes.subarray(1,5));
 expect((await fetch(`${origin}/api/log-invites/${code}/media/${video}`)).status).toBe(200);
 expect((await fetch(`${origin}/api/log-invites/${code}/photos/${audio}`)).status).toBe(404);
 for(const id of [gone,imageId])expect((await fetch(`${origin}/api/log-invites/${code}/media/${id}`)).status).toBe(404);
 expect((await fetch(mediaUrl,{headers:{Range:'bytes=900-'}})).status).toBe(416);
 await rows('uploads').updateOne({_id:audio},{$set:{moderatedAt:'now'}});expect((await fetch(mediaUrl)).status).toBe(404);
 await rows('uploads').updateOne({_id:audio},{$unset:{moderatedAt:''}});
 await rows('logEntries').updateOne({_id:'full-invite'},{$set:{'contributions.0.fileIds':[privateImageId,video]}});expect((await fetch(mediaUrl)).status).toBe(404);
 await users().updateOne({_id:otherId},{$set:{suspendedAt:'now'}});expect((await fetch(`${origin}/api/log-invites/${code}`)).status).toBe(404);expect((await fetch(`${origin}/api/log-invites/${code}/media/${video}`)).status).toBe(404);
 await users().updateOne({_id:otherId},{$unset:{suspendedAt:''}});
 await rows('logEntries').updateOne({_id:'full-invite'},{$set:{joinKey:'e'.repeat(32)}});expect((await fetch(`${origin}/api/log-invites/${code}/media/${video}`)).status).toBe(404);
 expect(JSON.stringify(await pagePreview('/log/full-invite'))).not.toContain('Full hangout');expect(JSON.stringify(await pagePreview(`/log/join/${'e'.repeat(32)}`))).not.toContain(note);
});
