import {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {Readable} from 'node:stream';
import {createHash,randomUUID} from 'node:crypto';
import {config} from './config';
import {rows} from './db';
import {AppError} from './errors';
import {MAX_UPLOAD_BYTES} from '../shared/uploads';
export interface ObjectLocation {kind:'s3';bucket:string;key:string}
let client:S3Client|undefined,identity='';
function storageClient(){
 if(!config.OBJECT_ENDPOINT.startsWith('https://')||!config.OBJECT_BUCKET||!config.OBJECT_ACCESS_KEY_ID||!config.OBJECT_SECRET_ACCESS_KEY)throw new AppError(503,'storage_unavailable','File storage is temporarily unavailable.');
 const next=createHash('sha256').update(JSON.stringify([config.OBJECT_ENDPOINT,config.OBJECT_REGION,config.OBJECT_ACCESS_KEY_ID,config.OBJECT_SECRET_ACCESS_KEY])).digest('hex');
 if(!client||identity!==next){client?.destroy();client=new S3Client({endpoint:config.OBJECT_ENDPOINT,region:config.OBJECT_REGION,forcePathStyle:false,credentials:{accessKeyId:config.OBJECT_ACCESS_KEY_ID,secretAccessKey:config.OBJECT_SECRET_ACCESS_KEY},requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',maxAttempts:2});identity=next;}
 return client;
}
export function objectLocation(fileId:string):ObjectLocation{
 if(!/^[0-9a-f-]{36}$/.test(fileId))throw Error('Invalid file identity');
 return {kind:'s3',bucket:config.OBJECT_BUCKET,key:`${config.OBJECT_PREFIX}/${config.APP_ENV}/${fileId}/${randomUUID()}`};
}
/** Immutable per-attempt keys keep orphan cleanup from racing a successful retry.
 * The durable intent survives a failed metadata commit or a concurrent deletion. */
export async function stageObjectWrite(fileId:string,bytes:Buffer,mime:string,sha256:string){
 const storage=storageClient(),location=objectLocation(fileId),intentId=randomUUID();
 await rows('mediaWriteIntents').insertOne({_id:intentId,fileId,location,sha256,availableAt:Date.now()+3600000});
 await storage.send(new PutObjectCommand({Bucket:location.bucket,Key:location.key,Body:bytes,ContentLength:bytes.length,ContentType:mime,ContentMD5:createHash('md5').update(bytes).digest('base64'),Metadata:{sha256},CacheControl:'private, no-store'}),{abortSignal:AbortSignal.timeout(30000)});
 return {location,intentId};
}
export async function objectBody(location:ObjectLocation,expectedBytes:number,sha256:string,range?:{start:number;end:number},head=false,signal?:AbortSignal){
 const storage=storageClient(),args={Bucket:location.bucket,Key:location.key,...(range?{Range:`bytes=${range.start}-${range.end}`}:{})};
 const result=await storage.send(head?new HeadObjectCommand(args):new GetObjectCommand(args),{abortSignal:signal||AbortSignal.timeout(30000)});
 const length=range?range.end-range.start+1:expectedBytes;
 if(result.ContentLength!==length||result.Metadata?.sha256!==sha256){if('Body'in result&&(result.Body as Readable|undefined)?.destroy)(result.Body as Readable).destroy();throw new AppError(503,'file_unverified','The stored file could not be verified.');}
 const body='Body'in result?result.Body:undefined;
 if(!head&&!(body instanceof Readable))throw new AppError(503,'storage_unavailable','File storage is temporarily unavailable.');
 return {body:body as Readable|undefined,length};
}
export async function readObjectFile(location:ObjectLocation,expectedBytes:number,sha256:string){
 const {body}=await objectBody(location,expectedBytes,sha256),parts:Buffer[]=[];let size=0;
 for await(const part of body!){const bytes=Buffer.from(part);size+=bytes.length;if(size>MAX_UPLOAD_BYTES||size>expectedBytes){body!.destroy();throw new AppError(503,'file_unverified','The stored file could not be verified.');}parts.push(bytes);}
 const bytes=Buffer.concat(parts);if(size!==expectedBytes||createHash('sha256').update(bytes).digest('hex')!==sha256)throw new AppError(503,'file_unverified','The stored file could not be verified.');return bytes;
}
export async function deleteObjectFile(location:ObjectLocation){await storageClient().send(new DeleteObjectCommand({Bucket:location.bucket,Key:location.key}),{abortSignal:AbortSignal.timeout(30000)});}
export async function cleanObjectWriteIntents(){
 const pending=await rows('mediaWriteIntents').find({availableAt:{$lte:Date.now()}}).limit(20).toArray();
 for(const intent of pending){
  const location=intent.location as ObjectLocation;
  const file=await rows('uploads').findOne({_id:String(intent.fileId),ready:true,deletedAt:{$exists:false},'storage.bucket':location.bucket,'storage.key':location.key,sha256:intent.sha256},{projection:{_id:1}});
  if(!file)await deleteObjectFile(location);
  await rows('mediaWriteIntents').deleteOne({_id:intent._id});
 }
}
