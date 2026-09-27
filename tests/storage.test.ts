import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {users,type User,type Actor} from '../server/auth';
import {executeOperation} from '../server/operations';
import {buildResourceLinks} from '../server/resourceLinks';
import type {StoragePage} from '../shared/storage';
const actor:Actor={userId:'me',source:'external',scope:'read'};
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated database required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{await connectDatabase();if(db().databaseName!=='newdrugs_test')throw Error('Isolated database required');});
beforeEach(async()=>{await clean();const user:User={_id:'me',handle:'me',name:'Me',bio:'',city:'',cityKey:'',interests:[],discoverable:true,balanceNanos:1e9,reservedNanos:0,storageBytes:500,createdAt:new Date().toISOString()};await users().insertMany([user,{...user,_id:'other',handle:'other'}]);});
afterAll(async()=>{await clean();await mongo.close();});
async function file(id:string,mime='image/webp',userId='me'){await rows('uploads').insertOne({_id:id,userId,name:id,mime,purpose:'agent_input',ready:true,retained:true,bytes:100,createdAt:'2026-09-27',sha256:'hash'});}
const list=(input:Record<string,unknown>={})=>executeOperation('storage.list',input,actor) as Promise<StoragePage>;
it('links each owned file to all live authorized attachments, including multiple uses',async()=>{
 await file('photo');await file('voice','audio/webm');await file('unattached');await users().updateOne({_id:'me'},{$set:{photos:['photo']}});
 await rows('posts').insertMany([{_id:'post',userId:'me',fileIds:['photo']},{_id:'removed',userId:'me',fileIds:['photo'],deletedAt:'now'},{_id:'moderated',userId:'me',fileIds:['photo'],moderatedAt:'now'},{_id:'foreign',userId:'other',fileIds:['photo']}]);
 await rows('messages').insertMany([{_id:'message',userId:'me',files:[{id:'photo'}],createdAt:'2026-09-27'},{_id:'private-message',userId:'other',files:[{id:'photo'}]}]);
 await rows('logEntries').insertMany([{_id:'hangout',title:'Walk',date:'2026-09-27',members:['me','other'],invited:[],contributions:[{userId:'me',fileIds:['voice']}]},{_id:'removed-log',members:['me'],deletedAt:'now',contributions:[{userId:'me',fileIds:['voice']}]},{_id:'private-log',members:['other'],contributions:[{userId:'me',fileIds:['voice']}]}]);
 const page=await list(),photo=page.items.find(item=>item.id==='photo')!,voice=page.items.find(item=>item.id==='voice')!;
 expect(photo.attachments.map(item=>item.destination.view)).toEqual(['person','post','chat']);expect(voice.attachments).toEqual([{label:'Hangout: Walk',destination:{view:'log',resourceId:'hangout'},url:'/log/hangout'}]);expect(page.items.find(item=>item.id==='unattached')?.attachments).toEqual([]);
 expect(buildResourceLinks('storage.list',{},page,actor)).toContainEqual(expect.objectContaining({targetKind:'exact',resourceId:'hangout'}));
 expect((await list({attachedTo:'hangouts'})).items.map(item=>item.id)).toEqual(['voice']);expect((await list({attachedTo:'hangouts',type:'images'})).items).toEqual([]);
 for(const attachedTo of ['profile','posts','chat'])expect((await list({attachedTo})).items.map(item=>item.id)).toEqual(['photo']);
 await rows('blocks').insertOne({_id:'block',members:['me','other']});expect((await list()).items.find(item=>item.id==='voice')?.attachments).toEqual([]);expect((await list({attachedTo:'hangouts'})).items).toEqual([]);
});
it('filters before pagination, keeps global quota totals, and never returns another account’s files',async()=>{
 for(const [id,mime] of [['z','image/webp'],['y','audio/webm'],['x','image/webp'],['w','video/mp4'],['v','text/plain'],['u','application/pdf']])await file(id,mime);
 await file('other-photo','image/webp','other');await rows('uploads').updateOne({_id:'u'},{$set:{deletedAt:'now'}});
 const first=await list({type:'images',limit:1});expect(first.items.map(item=>item.id)).toEqual(['z']);expect(first.usedBytes).toBe(500);expect(first.nextCursor).toBe('z');
 const next=await list({type:'images',limit:1,before:first.nextCursor});expect(next.items.map(item=>item.id)).toEqual(['x']);expect(next.nextCursor).toBeNull();
 expect((await list({type:'audio'})).items.map(item=>item.id)).toEqual(['y']);expect((await list({type:'video'})).items.map(item=>item.id)).toEqual(['w']);expect((await list({type:'documents'})).items.map(item=>item.id)).toEqual(['v']);
 await expect(list({type:'invalid'})).rejects.toBeDefined();
});
