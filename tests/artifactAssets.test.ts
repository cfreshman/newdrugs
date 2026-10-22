import {randomUUID} from 'node:crypto';
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {attachmentReferences,attachmentSourceKinds,backfillAttachmentReferences,syncSourceAttachments} from '../server/attachmentReferences';
import {users,type Actor,type User} from '../server/auth';
import {connectDatabase,db,mongo,rows,transaction} from '../server/db';
import {listStorage,storageAttachments} from '../server/storage';
import {deleteUpload,revokeArtifactUploadReferences} from '../server/uploads';
import {ARTIFACT_MAX_ACCOUNT_COUNT,ARTIFACT_MAX_ACCOUNT_VERSIONS} from '../shared/artifacts';
import {storageAttachmentSchema} from '../shared/storage';

const actor:Actor={userId:'artifact-owner',source:'browser',scope:'write'};
const createdAt='2026-10-22T12:00:00.000Z';
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated database required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{await connectDatabase();if(db().databaseName!=='newdrugs_test')throw Error('Isolated database required');});
beforeEach(async()=>{
 await clean();
 const owner:User={_id:actor.userId,handle:'artifact-owner',name:'Owner',bio:'',city:'',cityKey:'',interests:[],discoverable:false,balanceNanos:1e9,reservedNanos:0,storageBytes:500,createdAt};
 await users().insertMany([owner,{...owner,_id:'other-owner',handle:'other-owner'}]);
});
afterAll(async()=>{await clean();await mongo.close();});
async function image(userId=actor.userId){const id=randomUUID();await rows('uploads').insertOne({_id:id,userId,name:`${id}.webp`,mime:'image/webp',purpose:'agent_input',ready:true,retained:true,bytes:100,createdAt,sha256:'hash'});return id;}
async function artifact(id:string,assets:{id:string;fileId:string}[],ephemeral=false,userId=actor.userId){await rows('artifacts').insertOne({_id:id,userId,title:`Display ${id}`,bodyHtml:'<main>Display</main>',data:{},assets,ephemeral,revision:3,contentRevision:2,textBytes:42,createdAt,updatedAt:createdAt,contentUpdatedAt:createdAt});}
async function snapshot(id:string,contentRevision:number,assets:{id:string;fileId:string}[],userId=actor.userId){await rows('artifactVersions').insertOne({_id:`${id}:${contentRevision}`,artifactId:id,userId,title:`Display ${id}`,bodyHtml:'<main>Display</main>',data:{},assets,revision:contentRevision,contentRevision,textBytes:42,createdAt,updatedAt:createdAt,contentUpdatedAt:createdAt,dataUpdatedAt:createdAt});}
async function storage(input:Parameters<typeof listStorage>[1]={}){return listStorage((await users().findOne({_id:actor.userId}))!,input);}

it('indexes saved and ephemeral artifact images once per source and keeps upload quota unchanged',async()=>{
 const id=await image(),foreign=await image('other-owner');
 await artifact('saved',[{id:'first',fileId:id},{id:'second',fileId:id}]);
 await artifact('ephemeral',[{id:'photo',fileId:id}],true);
 await artifact('foreign',[{id:'photo',fileId:id}],false,'other-owner');
 await artifact('wrong-file',[{id:'photo',fileId:foreign}]);
 await artifact('removed',[{id:'photo',fileId:id}]);await rows('artifacts').updateOne({_id:'removed'},{$set:{deletedAt:createdAt}});
 await rows('attachmentReferenceMeta').insertMany([...attachmentSourceKinds.filter(kind=>kind!=='artifacts'), 'retired-source'].map(kind=>({_id:kind,done:true})));
 expect((await storage()).indexing).toBe(true);
 await backfillAttachmentReferences();
 expect(await attachmentReferences().countDocuments({fileId:id,kind:'artifacts'})).toBe(2);
 const page=await storage({attachedTo:'artifacts',type:'images'});
 expect(page.usedBytes).toBe(500);expect(page.indexing).toBe(false);expect(page.items).toHaveLength(1);
 expect(page.items[0].attachments.map(item=>item.destination?.resourceId).sort()).toEqual(['ephemeral','saved']);
 for(const item of page.items[0].attachments){expect(storageAttachmentSchema.parse(item).destination?.view).toBe('artifacts');expect(item.url).toBe(`/artifacts/${item.destination?.resourceId}`);}
 expect((await rows('uploads').findOne({_id:id}))?.attachmentKinds).toEqual(['artifacts']);
 expect((await storage({attachedTo:'posts'})).items).toEqual([]);
});

it('adds replacement asset references and retains history until root deletion without deleting uploads',async()=>{
 const original=await image(),replacement=await image();
 await artifact('one',[{id:'photo',fileId:original}]);await artifact('two',[{id:'photo',fileId:original}],true);
 await syncSourceAttachments('artifacts','one');await syncSourceAttachments('artifacts','two');
 await snapshot('one',1,[{id:'photo',fileId:original}]);
 await transaction(async session=>{await rows('artifacts').updateOne({_id:'one'},{$set:{assets:[{id:'photo',fileId:replacement}]}},{session});await syncSourceAttachments('artifacts','one',session);});
 expect(await attachmentReferences().countDocuments({fileId:original,kind:'artifacts'})).toBe(2);
 expect((await rows('uploads').findOne({_id:original}))?.attachmentKinds).toContain('artifacts');
 await transaction(async session=>{await rows('artifacts').updateOne({_id:'two'},{$set:{deletedAt:createdAt}},{session});await syncSourceAttachments('artifacts','two',session);});
 expect(await attachmentReferences().countDocuments({fileId:original,kind:'artifacts'})).toBe(1);
 expect((await rows('uploads').findOne({_id:original}))?.attachmentKinds).toContain('artifacts');
 for(const fileId of [original,replacement])expect(await rows('uploads').findOne({_id:fileId})).toMatchObject({ready:true,retained:true,bytes:100});
 expect((await storage()).usedBytes).toBe(500);
 expect((await storage({attachedTo:'artifacts'})).items.map(item=>item.id).sort()).toEqual([original,replacement].sort());
 await transaction(async session=>{await rows('artifacts').updateOne({_id:'one'},{$set:{deletedAt:createdAt}},{session});await syncSourceAttachments('artifacts','one',session);});
 expect(await attachmentReferences().countDocuments({kind:'artifacts'})).toBe(0);expect((await rows('uploads').findOne({_id:original}))?.attachmentKinds).not.toContain('artifacts');
});

it('bounds initial artifact attachment links and pages additional exact destinations',async()=>{
 const id=await image();
 for(let index=0;index<12;index++){const sourceId=`source-${index}`;await artifact(sourceId,[{id:'photo',fileId:id}],index%2===0);await syncSourceAttachments('artifacts',sourceId);}
 const file=(await storage({attachedTo:'artifacts'})).items[0];expect(file.attachments).toHaveLength(6);expect(file.attachmentCursor).toBeTruthy();
 const owner=(await users().findOne({_id:actor.userId}))!;
 const next=await storageAttachments(owner,id,file.attachmentCursor!,4,undefined,'artifacts');expect(next.items).toHaveLength(4);expect(next.nextCursor).toBeTruthy();
 const last=await storageAttachments(owner,id,next.nextCursor!,4,undefined,'artifacts');expect(last.items).toHaveLength(2);expect(last.nextCursor).toBeNull();
 expect(new Set([...file.attachments,...next.items,...last.items].map(item=>item.url)).size).toBe(12);
});

it('retains historical image references under one root attachment until the artifact is deleted',async()=>{
 const original=await image(),replacement=await image(),foreign=await image();
 await artifact('versioned',[{id:'photo',fileId:replacement}],true);await snapshot('versioned',1,[{id:'photo',fileId:original},{id:'again',fileId:original}]);await snapshot('versioned',2,[{id:'photo',fileId:replacement}]);
 await snapshot('versioned',99,[{id:'photo',fileId:foreign}],'other-owner');
 await backfillAttachmentReferences();
 expect(await attachmentReferences().countDocuments({kind:'artifacts',sourceId:'versioned'})).toBe(2);
 const page=await storage({attachedTo:'artifacts'});expect(page.items.map(item=>item.id).sort()).toEqual([original,replacement].sort());expect(page.usedBytes).toBe(500);
 for(const file of page.items)expect(file.attachments).toEqual([{label:'Artifact: Display versioned',destination:{view:'artifacts',resourceId:'versioned'},url:'/artifacts/versioned'}]);
 await transaction(async session=>{await rows('artifacts').updateOne({_id:'versioned'},{$set:{assets:[]}},{session});await syncSourceAttachments('artifacts','versioned',session);});
 expect(await attachmentReferences().countDocuments({kind:'artifacts',sourceId:'versioned'})).toBe(2);
 await transaction(async session=>{await rows('artifacts').updateOne({_id:'versioned'},{$set:{deletedAt:createdAt}},{session});await syncSourceAttachments('artifacts','versioned',session);});
 expect(await attachmentReferences().countDocuments({kind:'artifacts',sourceId:'versioned'})).toBe(0);expect((await storage({attachedTo:'artifacts'})).items).toEqual([]);
 for(const fileId of [original,replacement])expect(await rows('uploads').findOne({_id:fileId})).toMatchObject({ready:true,retained:true,bytes:100});
});

it('deletes an image atomically, advances affected record revisions and invalidates only its owner',async()=>{
 const id=await image(),kept=await image();
 await artifact('saved',[{id:'photo',fileId:id},{id:'kept',fileId:kept}]);await artifact('ephemeral',[{id:'photo',fileId:id}],true);await artifact('unrelated',[{id:'photo',fileId:kept}]);await artifact('foreign',[{id:'photo',fileId:id}],false,'other-owner');
 for(const sourceId of ['saved','ephemeral','unrelated'])await syncSourceAttachments('artifacts',sourceId);
 await deleteUpload(actor,id);
 expect(await rows('uploads').findOne({_id:id})).toMatchObject({ready:false,retained:false,bytes:0});
 expect((await users().findOne({_id:actor.userId}))?.storageBytes).toBe(400);
 for(const sourceId of ['saved','ephemeral']){const record=await rows('artifacts').findOne({_id:sourceId});expect(record).toMatchObject({revision:4,contentRevision:2,textBytes:42,contentUpdatedAt:createdAt});expect(record?.assets).not.toContainEqual(expect.objectContaining({fileId:id}));expect(record?.updatedAt).not.toBe(createdAt);}
 expect(await rows('artifacts').findOne({_id:'unrelated'})).toMatchObject({revision:3,contentRevision:2});
 expect(await rows('artifacts').findOne({_id:'foreign'})).toMatchObject({revision:3,contentRevision:2,assets:[{id:'photo',fileId:id}]});
 expect(await attachmentReferences().countDocuments({fileId:id})).toBe(0);
 const events=await rows('recordEvents').find({}).toArray();expect(events).toHaveLength(2);
 for(const event of events)expect(event).toMatchObject({userIds:[actor.userId],payload:{keys:['artifacts'],artifacts:[{id:expect.any(String),deleted:false}]}});
 expect(await revokeArtifactUploadReferences(actor.userId,id)).toEqual({artifactIds:[]});expect(await rows('recordEvents').countDocuments({})).toBe(2);
});

it('invalidates historical-only image use without modifying immutable snapshots or minting a version',async()=>{
 const original=await image(),kept=await image();await artifact('history-only',[{id:'photo',fileId:original}]);await snapshot('history-only',1,[{id:'photo',fileId:original}]);await syncSourceAttachments('artifacts','history-only');
 await rows('artifacts').updateOne({_id:'history-only'},{$set:{assets:[{id:'photo',fileId:kept}]}});await snapshot('history-only',2,[{id:'photo',fileId:kept}]);await syncSourceAttachments('artifacts','history-only');
 const snapshots=await rows('artifactVersions').find({artifactId:'history-only'}).sort({_id:1}).toArray();
 await deleteUpload(actor,original);
 expect(await rows('artifacts').findOne({_id:'history-only'})).toMatchObject({revision:4,contentRevision:2,contentUpdatedAt:createdAt,assets:[{id:'photo',fileId:kept}]});
 expect(await rows('artifactVersions').find({artifactId:'history-only'}).sort({_id:1}).toArray()).toEqual(snapshots);
 expect(await attachmentReferences().countDocuments({fileId:original,kind:'artifacts'})).toBe(0);expect(await attachmentReferences().countDocuments({fileId:kept,kind:'artifacts'})).toBe(1);
 expect(await rows('recordEvents').countDocuments({})).toBe(1);expect(await revokeArtifactUploadReferences(actor.userId,original)).toEqual({artifactIds:[]});expect(await rows('recordEvents').countDocuments({})).toBe(1);
});

it('revokes moderated images transactionally without releasing quota or restoring removed artifact assets',async()=>{
 const id=await image();await artifact('private',[{id:'photo',fileId:id}],true);await snapshot('private',1,[{id:'photo',fileId:id}]);await syncSourceAttachments('artifacts','private');
 const immutable=await rows('artifactVersions').findOne({_id:'private:1'});
 await expect(transaction(async session=>{await rows('uploads').updateOne({_id:id},{$set:{moderatedAt:createdAt}},{session});await revokeArtifactUploadReferences(actor.userId,id,session);throw Error('rollback');})).rejects.toThrow('rollback');
 expect(await rows('uploads').findOne({_id:id})).not.toHaveProperty('moderatedAt');expect(await rows('artifacts').findOne({_id:'private'})).toMatchObject({revision:3,assets:[{id:'photo',fileId:id}]});expect(await rows('recordEvents').countDocuments({})).toBe(0);
 await transaction(async session=>{await rows('uploads').updateOne({_id:id},{$set:{moderatedAt:createdAt}},{session});await revokeArtifactUploadReferences(actor.userId,id,session);});
 expect(await rows('artifacts').findOne({_id:'private'})).toMatchObject({revision:4,contentRevision:2,contentUpdatedAt:createdAt,assets:[]});expect(await attachmentReferences().countDocuments({fileId:id})).toBe(0);
 expect(await rows('artifactVersions').findOne({_id:'private:1'})).toEqual(immutable);
 expect((await storage({attachedTo:'artifacts'})).items).toEqual([]);expect((await storage()).usedBytes).toBe(500);
 await rows('uploads').updateOne({_id:id},{$unset:{moderatedAt:''}});expect(await revokeArtifactUploadReferences(actor.userId,id)).toEqual({artifactIds:[]});expect((await storage({attachedTo:'artifacts'})).items).toEqual([]);
});

it('fails closed before cleanup can exceed the bounded owner artifact count',async()=>{
 const id=await image();await rows('artifacts').insertMany(Array.from({length:ARTIFACT_MAX_ACCOUNT_COUNT+1},(_,index)=>({_id:`over-limit-${index}`,userId:actor.userId,assets:[{id:'photo',fileId:id}],revision:1,contentRevision:1})));
 await expect(deleteUpload(actor,id)).rejects.toMatchObject({code:'artifact_limit'});
 expect(await rows('uploads').findOne({_id:id})).toMatchObject({ready:true,bytes:100});expect(await rows('artifacts').countDocuments({revision:1})).toBe(ARTIFACT_MAX_ACCOUNT_COUNT+1);expect(await rows('recordEvents').countDocuments({})).toBe(0);expect((await storage()).usedBytes).toBe(500);
});

it('fails closed before background historical attachment indexing exceeds the owner version bound',async()=>{
 const id=await image();await artifact('over-limit',[]);
 await rows('artifactVersions').insertMany(Array.from({length:ARTIFACT_MAX_ACCOUNT_VERSIONS+1},(_,index)=>({_id:`over-limit:${index+1}`,artifactId:'over-limit',userId:actor.userId,contentRevision:index+1,assets:[{id:'photo',fileId:id}]})));
 await expect(backfillAttachmentReferences()).rejects.toMatchObject({code:'artifact_limit'});
 expect(await attachmentReferences().countDocuments({kind:'artifacts'})).toBe(0);expect((await rows('uploads').findOne({_id:id}))?.attachmentKinds).toBeUndefined();
});
