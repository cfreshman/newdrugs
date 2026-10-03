import {Binary} from 'mongodb';
import {rows} from './db';
import {AppError} from './errors';
import {readUpload,uploadMetadata} from './uploads';
import type {Actor} from './auth';
import {videoPoster} from './videoFrame';

const pending=new Map<string,Promise<Buffer>>();
interface CachedPoster {_id:string;sha256:string;image:Binary}

export async function uploadVideoPoster(actor:Actor,id:string){
 const file=await uploadMetadata(actor,id,true);
 if(!file.mime.startsWith('video/'))throw new AppError(404,'not_found','Video poster unavailable.');
 const collection=rows<CachedPoster>('uploadPosters');
 const cached=await collection.findOne({_id:id,sha256:file.sha256});
 if(cached)return Buffer.from(cached.image.buffer);
 let work=pending.get(id);
 if(!work){
  work=(async()=>{
   const verified=await readUpload(actor,id,true);
   const image=await videoPoster(verified.bytes,file.mime);
   await collection.replaceOne({_id:id},{sha256:file.sha256,image:new Binary(image)},{upsert:true});
   return image;
  })();
  pending.set(id,work);
  void work.finally(()=>{if(pending.get(id)===work)pending.delete(id);}).catch(()=>{});
 }
 return work;
}

export async function deleteUploadPoster(id:string){await rows<CachedPoster>('uploadPosters').deleteOne({_id:id});}
