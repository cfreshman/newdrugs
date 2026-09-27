import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {Readable} from 'node:stream';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,rm,access,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {connectDatabase,db,mongo,rows,transaction} from '../server/db';
import {users,type User,type Actor} from '../server/auth';
import {config} from '../server/config';
import {prepareUpload,acceptUpload,readUpload,deleteUpload,expireUploads,migrateUploadToObject} from '../server/uploads';
import {stageObjectWrite,cleanObjectWriteIntents,objectBody} from '../server/objectStorage';
const remote=vi.hoisted(()=>({objects:new Map<string,{bytes:Buffer;metadata:Record<string,string>}>(),corrupt:false}));
vi.mock('@aws-sdk/client-s3',()=>{
 class Command{constructor(readonly input:any,readonly kind:string){}}
 return {PutObjectCommand:class extends Command{constructor(input:any){super(input,'put');}},GetObjectCommand:class extends Command{constructor(input:any){super(input,'get');}},HeadObjectCommand:class extends Command{constructor(input:any){super(input,'head');}},DeleteObjectCommand:class extends Command{constructor(input:any){super(input,'delete');}},S3Client:class{destroy(){}async send(command:Command){const input=command.input,key=input.Bucket+'/'+input.Key;if(command.kind==='put'){remote.objects.set(key,{bytes:Buffer.from(input.Body),metadata:input.Metadata});return {};}if(command.kind==='delete'){remote.objects.delete(key);return {};}const object=remote.objects.get(key);if(!object)throw Error('NoSuchKey');const match=input.Range&&/^bytes=(\d+)-(\d+)$/.exec(input.Range);let bytes=match?object.bytes.subarray(Number(match[1]),Number(match[2])+1):object.bytes;if(remote.corrupt)bytes=Buffer.alloc(bytes.length,99);return {ContentLength:bytes.length,Metadata:object.metadata,...(command.kind==='get'?{Body:Readable.from([bytes])}:{})};}}};
});
const prior={...config};let directory:string;
const actor:Actor={userId:'me',source:'external',scope:'write'},bytes=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(4),Buffer.from('WAVE'),Buffer.alloc(32)]),sha256=createHash('sha256').update(bytes).digest('hex');
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated database required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{await connectDatabase();directory=await mkdtemp(join(tmpdir(),'newdrugs-objects-'));});beforeEach(async()=>{await clean();remote.objects.clear();remote.corrupt=false;Object.assign(config,{DATA_DIR:directory,MEDIA_STORAGE:'s3',OBJECT_ENDPOINT:'https://objects.invalid',OBJECT_BUCKET:'fixture-private',OBJECT_ACCESS_KEY_ID:'fixture',OBJECT_SECRET_ACCESS_KEY:'fixture'});await users().insertOne({_id:'me',handle:'me',name:'Me',bio:'',city:'',cityKey:'',interests:[],discoverable:false,balanceNanos:0,reservedNanos:0,storageBytes:0,createdAt:new Date().toISOString()} as User);});afterAll(async()=>{await clean();await mongo.close();Object.assign(config,prior);await rm(directory,{recursive:true});});
async function upload(){let prepared:any;await transaction(async session=>{prepared=await prepareUpload({name:'Note.wav',bytes:bytes.length,sha256,purpose:'log_media'},actor,session);});await acceptUpload(actor,prepared.id,bytes);return prepared.id as string;}
it('writes private objects with verified metadata and reads bounded ranges through the app',async()=>{
 const id=await upload(),file=(await rows('uploads').findOne({_id:id}))!,location=file.storage as any;expect(location.bucket).toBe('fixture-private');expect(location.key).toContain(`/staging/${id}/`);expect(await rows('mediaWriteIntents').countDocuments()).toBe(0);
 expect((await readUpload(actor,id)).bytes).toEqual(bytes);const part=await objectBody(location,bytes.length,sha256,{start:1,end:4});const chunks:Buffer[]=[];for await(const chunk of part.body!)chunks.push(Buffer.from(chunk));expect(Buffer.concat(chunks)).toEqual(bytes.subarray(1,5));
 await transaction(session=>deleteUpload(actor,id,session));await expireUploads();expect(remote.objects.size).toBe(0);await expect(access(join(directory,'files',id))).rejects.toMatchObject({code:'ENOENT'});expect((await users().findOne({_id:'me'}))?.storageBytes).toBe(0);
});
it('keeps a winning retry when cleaning a different immutable orphan object',async()=>{
 const id=randomUUID(),first=await stageObjectWrite(id,bytes,'audio/wav',sha256),second=await stageObjectWrite(id,bytes,'audio/wav',sha256);expect(first.location.key).not.toBe(second.location.key);
 await rows('uploads').insertOne({_id:id,ready:true,sha256,storage:first.location});await rows('mediaWriteIntents').updateMany({},{$set:{availableAt:0}});await cleanObjectWriteIntents();expect(remote.objects.size).toBe(1);expect(remote.objects.has(first.location.bucket+'/'+first.location.key)).toBe(true);expect(await rows('mediaWriteIntents').countDocuments()).toBe(0);
});
it('verifies copied bytes before migration and leaves local rollback data intact',async()=>{
 config.MEDIA_STORAGE='local';const id=await upload();expect(await migrateUploadToObject(id)).toEqual({migrated:true});expect(await readFile(join(directory,'files',id))).toEqual(bytes);expect(await migrateUploadToObject(id)).toEqual({migrated:false});
 const bad=await upload();remote.corrupt=true;await expect(migrateUploadToObject(bad)).rejects.toMatchObject({code:'file_unverified'});expect((await rows('uploads').findOne({_id:bad}))?.storage).toBeUndefined();expect(await readFile(join(directory,'files',bad))).toEqual(bytes);
});
