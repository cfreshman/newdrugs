import type {Upload} from './uploads';
import {readUpload} from './uploads';
import {transcodeVoiceAudio} from './audioTranscode';

const MAX_CACHE_BYTES=12*1024*1024,MAX_ITEM_BYTES=2*1024*1024;
const cached=new Map<string,Buffer>(),pending=new Map<string,Promise<Buffer>>();
let cachedBytes=0;

/** Playback copies are bounded process memory, never additional user attachments. */
export function playableVoiceAudio(file:Upload):Promise<Buffer>{
 const key=`${file._id}:${file.sha256}`,existing=cached.get(key);
 if(existing){cached.delete(key);cached.set(key,existing);return Promise.resolve(existing);}
 const current=pending.get(key);if(current)return current;
 const task=readUpload({userId:file.userId,source:'external',scope:'read'},file._id)
  .then(({bytes})=>transcodeVoiceAudio(bytes,file.mime));
 pending.set(key,task);
 void task.then(bytes=>{
  if(bytes.length>MAX_ITEM_BYTES)return;
  cached.set(key,bytes);cachedBytes+=bytes.length;
  while(cachedBytes>MAX_CACHE_BYTES){const oldest=cached.keys().next().value;if(!oldest)break;cachedBytes-=cached.get(oldest)!.length;cached.delete(oldest);}
 },()=>{}).finally(()=>pending.delete(key));
 return task;
}
