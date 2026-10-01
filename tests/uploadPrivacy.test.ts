import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import {unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import sharp from 'sharp';
import {config} from '../server/config';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {users,type Actor,type User} from '../server/auth';
import {acceptUpload,prepareUpload,uploadMetadata,uploads,fileInput,retainUploads} from '../server/uploads';
import {executeOperation} from '../server/operations';
import {postCards} from '../server/postProjection';
import {projectLogEntries} from '../server/log';
import {publicInvitePreview} from '../server/logInvites';
import type {UploadRef} from '../shared/uploads';
const owner:Actor={userId:'owner',source:'external',scope:'write'},viewer:Actor={...owner,userId:'viewer'},created:string[]=[];
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated database required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{if(new URL(config.MONGODB_URI).pathname!=='/newdrugs_test')throw Error('Isolated database required');await connectDatabase();});
beforeEach(async()=>{await clean();const user:User={_id:'owner',handle:'owner',name:'Owner',bio:'',city:'',cityKey:'',interests:[],discoverable:true,balanceNanos:1e9,reservedNanos:0,createdAt:new Date().toISOString()};await users().insertMany([user,{...user,_id:'viewer',handle:'viewer'}]);});
afterAll(async()=>{await clean();await mongo.close();for(const id of created)await unlink(resolve(config.DATA_DIR,'files',id)).catch(()=>{});});
async function upload(name:string,bytes:Buffer){const prepared=await prepareUpload({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),purpose:'agent_input'},owner);created.push(prepared.id);return acceptUpload(owner,prepared.id,bytes);}
it('keeps the original filename for owner reads after conversion, while shared media uses the ID',async()=>{
 const original='private-address-and-date.png',bytes=await sharp({create:{width:8,height:8,channels:3,background:'#123456'}}).png().toBuffer(),file=await upload(original,bytes);
 expect(file).toMatchObject({originalName:original,name:`${file.id}.webp`,mime:'image/webp',url:`/api/files/${file.id}`});
 expect(await uploads().findOne({_id:file.id})).toMatchObject({originalName:original,name:`${file.id}.webp`});
 expect(await executeOperation('files.get',{fileId:file.id},owner)).toMatchObject({originalName:original,name:`${file.id}.webp`});
 expect((await executeOperation('files.list',{},owner) as {items:UploadRef[]}).items[0].originalName).toBe(original);
 expect((await executeOperation('storage.list',{},owner) as {items:UploadRef[]}).items[0].originalName).toBe(original);
 await expect(executeOperation('files.get',{fileId:file.id},viewer)).rejects.toMatchObject({status:404});
 await retainUploads(owner.userId,[file.id],'agent_input');expect(JSON.stringify(await fileInput(owner.userId,file.id))).toContain(original);
 const post={_id:'post',userId:owner.userId,text:'photo',fileIds:[file.id]};await rows('posts').insertOne(post);
 const shared=await uploadMetadata(viewer,file.id,true);expect(shared.name).toBe(`${file.id}.webp`);expect(shared).not.toHaveProperty('originalName');
 const cards=await postCards([post],viewer.userId,[]);expect(cards[0].photos[0].name).toBe(`${file.id}.webp`);expect(JSON.stringify(cards)).not.toContain(original);
});
it('protects legacy filenames in shared hangouts and invite previews without erasing owner metadata',async()=>{
 const file=await upload('private-memory.png',await sharp({create:{width:8,height:8,channels:3,background:'#123456'}}).png().toBuffer()),legacyName='private-memory.webp';
 await uploads().updateOne({_id:file.id},{$set:{name:legacyName},$unset:{originalName:''}});
 const entry={_id:randomUUID(),ownerId:'owner',members:['owner','viewer'],invited:[],title:'Memory',date:'2026-10-01',place:'',links:[],recurrence:'none' as const,coverFileId:file.id,contributions:[{userId:'owner',note:'',fileIds:[file.id]}],revision:1,createdAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z',joinKey:'a'.repeat(32)};
 await rows('logEntries').insertOne(entry);
 expect(await executeOperation('files.get',{fileId:file.id},owner)).toMatchObject({originalName:legacyName,name:`${file.id}.webp`});
 const shared=(await projectLogEntries([entry],viewer.userId))[0],invite=await publicInvitePreview(entry.joinKey);
 expect(shared.contributors[0].files[0].name).toBe(`${file.id}.webp`);expect(invite.contributors[0].files[0].name).toBe(`${file.id}.webp`);
 expect(JSON.stringify({shared,invite,metadata:await uploadMetadata(viewer,file.id,true),agent:await fileInput(viewer.userId,file.id,0,entry._id)})).not.toContain(legacyName);
 const text=await upload('private-plans.md',Buffer.from('Some notes'));expect(text).toMatchObject({originalName:'private-plans.md',name:`${text.id}.md`,mime:'text/plain'});
});
