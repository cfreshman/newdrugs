import {Binary} from 'mongodb';
import {rows,transaction} from './db';
import {AppError} from './errors';
import {readUpload,uploadMetadata,uploads} from './uploads';
import type {Actor} from './auth';
import {users} from './auth';
import {videoPoster} from './videoFrame';

const pending=new Map<string,Promise<Buffer>>();
interface CachedPoster {_id:string;sha256:string;image:Binary}

async function savePoster(fileId:string,ownerId:string,sha256:string,image:Buffer){
 const collection=rows<CachedPoster>('uploadPosters');
 await transaction(async session=>{
  const file=await uploads().findOne({_id:fileId,userId:ownerId,sha256,ready:true,deletedAt:{$exists:false}},{session});
  if(!file)throw new AppError(404,'not_found','Video unavailable.');
  const prior=await collection.findOne({_id:fileId},{session});
  if(prior?.sha256===sha256&&file.posterBytes===image.length)return;
  await collection.replaceOne({_id:fileId},{sha256,image:new Binary(image)},{upsert:true,session});
  await uploads().updateOne({_id:fileId,userId:ownerId},{$set:{posterBytes:image.length}},{session});
  const delta=image.length-(file.posterBytes||0);
  if(delta)await users().updateOne({_id:ownerId},{$inc:{storageBytes:delta}},{session});
 });
}

export async function uploadVideoPoster(actor:Actor,id:string){
 const file=await uploadMetadata(actor,id,true);
 if(!file.mime.startsWith('video/'))throw new AppError(404,'not_found','Video poster unavailable.');
 const collection=rows<CachedPoster>('uploadPosters');
 const cached=await collection.findOne({_id:id,sha256:file.sha256});
 if(cached&&file.posterBytes===cached.image.length())return Buffer.from(cached.image.buffer);
 let work=pending.get(id);
 if(!work){
  work=(async()=>{
   const image=cached?Buffer.from(cached.image.buffer):await videoPoster((await readUpload(actor,id,true)).bytes,file.mime);
   await savePoster(id,file.userId,file.sha256,image);
   return image;
  })();
  pending.set(id,work);
  void work.finally(()=>{if(pending.get(id)===work)pending.delete(id);}).catch(()=>{});
 }
 return work;
}

export async function deleteUploadPoster(id:string){await rows<CachedPoster>('uploadPosters').deleteOne({_id:id});}
