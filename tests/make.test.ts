import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {users,type Actor,type User} from '../server/auth';
import {config} from '../server/config';
import {executeOperation} from '../server/operations';
import {acceptUpload,prepareUpload} from '../server/uploads';

const original={DATA_DIR:config.DATA_DIR,MEDIA_STORAGE:config.MEDIA_STORAGE};
const actor=(userId='me'):Actor=>({userId,source:'external',scope:'write'});
const call=(name:string,input:unknown={},userId='me',key=randomUUID())=>executeOperation(name,input,actor(userId),key) as Promise<any>;
let directory:string;
beforeAll(async()=>{
 if(new URL(config.MONGODB_URI).pathname!=='/newdrugs_test')throw Error('Isolated test database required');
 await connectDatabase();directory=await mkdtemp(join(tmpdir(),'newdrugs-make-'));
 Object.assign(config,{DATA_DIR:directory,MEDIA_STORAGE:'local'});
});
beforeEach(async()=>{
 if(db().databaseName!=='newdrugs_test')throw Error('Isolated test database required');
 for(const collection of await db().collections())await collection.deleteMany({});
 const base:User={_id:'me',handle:'me',name:'Me',bio:'',city:'',cityKey:'',interests:[],discoverable:false,balanceNanos:0,reservedNanos:0,storageBytes:0,createdAt:new Date().toISOString()};
 await users().insertMany([base,{...base,_id:'other',handle:'other'}]);
});
afterAll(async()=>{
 if(db().databaseName==='newdrugs_test')for(const collection of await db().collections())await collection.deleteMany({});
 await mongo.close();Object.assign(config,original);await rm(directory,{recursive:true,force:true});
});

it('renders a server draft, publishes the reviewed image, and preserves the note and voice',async()=>{
 const wav=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WAVE'),Buffer.alloc(32)]);
 const voice=await prepareUpload({name:'Note.wav',bytes:wav.length,sha256:createHash('sha256').update(wav).digest('hex'),purpose:'log_media'},actor());
 await acceptUpload(actor(),voice.id,wav);
 const entry=await call('log.create',{entry:{date:'2026-09-30',title:'A day'},contribution:{note:'My own words',fileIds:[voice.id]}});
 const created=await call('make.create',{project:{version:1,color:'#ffeecc',layers:[]}});
 await expect(call('make.get',{draftId:created.draftId},'other')).rejects.toMatchObject({status:404});
 const edited=await call('make.edit',{draftId:created.draftId,revision:1,project:{version:1,color:'#ffeecc',layers:[{id:randomUUID(),type:'text',x:.1,y:.3,w:.8,h:.4,text:'A day',font:'bungee',align:'center'}]}});
 const preview=await call('make.render',{draftId:created.draftId});
 const png=Buffer.from(preview.pngBase64,'base64');
 expect(png.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
 expect(png.readUInt32BE(16)).toBe(512);expect(png.readUInt32BE(20)).toBe(512);
 expect(preview.sha256).toBe(createHash('sha256').update(png).digest('hex'));
 await expect(call('make.publish',{draftId:created.draftId,revision:edited.revision,renderSha256:'0'.repeat(64),entryId:entry.id})).rejects.toMatchObject({code:'make_render_changed'});
 expect(await rows('uploads').countDocuments()).toBe(1);
 const input={draftId:created.draftId,revision:edited.revision,renderSha256:preview.sha256,entryId:entry.id},key=randomUUID();
 const saved=await call('make.publish',input,'me',key);
 expect(saved.entry.contributors[0].note).toBe('My own words');
 expect(saved.entry.contributors[0].files.map((file:{id:string})=>file.id)).toEqual([saved.imageFileId,voice.id]);
 expect(saved.entry.contributors[0].files[0].mime).toBe('image/webp');
 expect(await call('make.publish',input,'me',key)).toEqual(saved);
 expect(await rows('uploads').countDocuments()).toBe(2);
 await expect(call('make.get',{draftId:created.draftId})).rejects.toMatchObject({status:404});
});

it('uses an existing owned image upload as draft pixels without fetching a URL',async()=>{
 const sharp=(await import('sharp')).default;
 const png=await sharp({create:{width:16,height:12,channels:3,background:'#4477aa'}}).png().toBuffer();
 const upload=await prepareUpload({name:'Source.png',bytes:png.length,sha256:createHash('sha256').update(png).digest('hex'),purpose:'agent_input'},actor());
 await acceptUpload(actor(),upload.id,png);
 const project={version:1,color:'#ffffff',layers:[{id:randomUUID(),type:'image',x:0,y:0,w:1,h:1,src:`file:${upload.id}`}]};
 const created=await call('make.create',{project});
 const stored=await call('make.get',{draftId:created.draftId});
 expect(stored.project.layers[0].src).toMatch(/^data:image\/webp;base64,/);
 expect((await call('make.render',{draftId:created.draftId})).pngBase64.length).toBeGreaterThan(100);
});
