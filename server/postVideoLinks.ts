import {Binary,type ClientSession} from 'mongodb';
import {rows,transaction} from './db';
import {hash,users,type Actor} from './auth';
import {AppError} from './errors';
import {linkPreview,previewImage} from './linkPreviews';
import {attachmentUrl,providerEmbed} from '../shared/postLinks';
import {textLinks} from '../shared/links';

interface PostVideoLink {_id:string;userId:string;postId:string;sourceUrl:string;title:string;createdAt:string;bytes:number;poster?:Binary}
interface VideoJob {_id:string;availableAt:number;leaseUntil:number;attempts:number}
interface PostRow {_id:string;userId:string;text:string;links?:string[];createdAt:string;deletedAt?:string;moderatedAt?:string}
export const postVideoLinks=()=>rows<PostVideoLink>('postVideoLinks');
const jobs=()=>rows<VideoJob>('postVideoLinkJobs');
const sourceUrls=(post:Pick<PostRow,'text'|'links'>)=>[...new Set([...(post.links||[]),...textLinks(post.text||'').map(link=>link.url)].flatMap(value=>{try{return [attachmentUrl(value)];}catch{return [];}}))].slice(0,3);

export async function enqueuePostVideoLinks(post:PostRow,session?:ClientSession){
 if(!sourceUrls(post).length)return;
 await jobs().updateOne({_id:post._id},{$setOnInsert:{availableAt:Date.now(),leaseUntil:0,attempts:0}},{upsert:true,session});
}
export async function removePostVideoLinks(userId:string,postId:string,session:ClientSession){
 const existing=await postVideoLinks().find({userId,postId},{session,projection:{bytes:1}}).toArray();
 await postVideoLinks().deleteMany({userId,postId},{session});
 await jobs().deleteOne({_id:postId},{session});
 const bytes=existing.reduce((sum,item)=>sum+item.bytes,0);
 if(bytes)await users().updateOne({_id:userId},{$inc:{storageBytes:-bytes}},{session});
}
export async function postVideoPoster(actor:Actor,id:string){
 if(!/^[a-f0-9]{64}$/.test(id))throw new AppError(404,'not_found','Video preview unavailable.');
 const item=await postVideoLinks().findOne({_id:id,userId:actor.userId});
 if(!item?.poster||!await rows<PostRow>('posts').findOne({_id:item.postId,userId:actor.userId,deletedAt:{$exists:false},moderatedAt:{$exists:false}},{projection:{_id:1}}))throw new AppError(404,'not_found','Video preview unavailable.');
 return Buffer.from(item.poster.buffer);
}
export async function refreshPostVideoLinks(postId:string){
 const post=await rows<PostRow>('posts').findOne({_id:postId});
 if(!post||post.deletedAt||post.moderatedAt){if(post)await transaction(session=>removePostVideoLinks(post.userId,postId,session));return false;}
 const urls=sourceUrls(post),previous=await postVideoLinks().find({postId,userId:post.userId}).toArray();
 const next:PostVideoLink[]=[];let needsRetry=false;
 for(const url of urls){
  const old=previous.find(item=>item.sourceUrl===url);
  const likelyVideo=/\.(?:mp4|mov|webm|ogv?)(?:[?#]|$)/i.test(url)||Boolean(providerEmbed(url)?.video);
  try{
   const preview=await linkPreview(url,post.userId);
   if(preview.kind!=='video'&&!preview.embed?.video&&!likelyVideo)continue;
   let image:Buffer|undefined;
   const match=preview.imageUrl?.match(/^\/api\/link-previews\/([a-f0-9]{64})\/image$/);
   if(match)try{image=await previewImage(match[1]);}catch{/* Keep the video item without a poster. */}
   if(!image&&!old?.poster)needsRetry=true;
   next.push({_id:hash(JSON.stringify([postId,url])),userId:post.userId,postId,sourceUrl:url,title:preview.title||new URL(url).hostname,createdAt:post.createdAt,bytes:image?.length||old?.bytes||0,...(image?{poster:new Binary(image)}:old?.poster?{poster:old.poster}:{})});
  }catch{if(old)next.push(old);else if(likelyVideo){needsRetry=true;next.push({_id:hash(JSON.stringify([postId,url])),userId:post.userId,postId,sourceUrl:url,title:new URL(url).hostname,createdAt:post.createdAt,bytes:0});}}
 }
 await transaction(async session=>{
  const current=await rows<PostRow>('posts').findOne({_id:postId,userId:post.userId,deletedAt:{$exists:false},moderatedAt:{$exists:false}},{session,projection:{_id:1}});
  if(!current){await removePostVideoLinks(post.userId,postId,session);return;}
  const before=await postVideoLinks().find({postId,userId:post.userId},{session,projection:{bytes:1}}).toArray();
  await postVideoLinks().deleteMany({postId,userId:post.userId},{session});
  for(const item of next)await postVideoLinks().insertOne(item,{session});
  const delta=next.reduce((sum,item)=>sum+item.bytes,0)-before.reduce((sum,item)=>sum+item.bytes,0);
  if(delta)await users().updateOne({_id:post.userId},{$inc:{storageBytes:delta}},{session});
 });
 return needsRetry;
}
async function backfillPosts(){
 const meta=rows<{_id:string;cursor?:string;done?:boolean}>('postVideoLinkMeta'),state=await meta.findOne({_id:'posts'});
 if(state?.done)return;
 if(await jobs().countDocuments({},{limit:101})>=100)return;
 const page=await rows<PostRow>('posts').find(state?.cursor?{_id:{$gt:state.cursor}}:{},{projection:{_id:1,userId:1,text:1,links:1,createdAt:1,deletedAt:1,moderatedAt:1}}).sort({_id:1}).limit(20).toArray();
 for(const post of page)if(!post.deletedAt&&!post.moderatedAt)await enqueuePostVideoLinks(post);
 await meta.updateOne({_id:'posts'},{$set:{cursor:page.at(-1)?._id||state?.cursor||'',done:page.length<20}},{upsert:true});
}
async function processOne(){
 const now=Date.now(),job=await jobs().findOneAndUpdate({availableAt:{$lte:now},leaseUntil:{$lte:now}},{$set:{leaseUntil:now+120000}},{sort:{availableAt:1},returnDocument:'after'});
 if(!job)return;
 try{const retry=await refreshPostVideoLinks(job._id);if(retry&&job.attempts<3)await jobs().updateOne({_id:job._id,leaseUntil:now+120000},{$set:{availableAt:Date.now()+Math.min(3600000,300000*2**job.attempts),leaseUntil:0},$inc:{attempts:1}});else await jobs().deleteOne({_id:job._id,leaseUntil:now+120000});}
 catch(error){console.error('Post video preview:',error instanceof Error?error.name:'Error');await jobs().updateOne({_id:job._id,leaseUntil:now+120000},{$set:{availableAt:Date.now()+Math.min(3600000,5000*2**Math.min(job.attempts,9)),leaseUntil:0},$inc:{attempts:1}});}
}
export function startPostVideoLinkWorker(){let stopped=false,pending:Promise<void>|undefined;const tick=()=>{if(stopped||pending)return;pending=(async()=>{await backfillPosts();await processOne();})().catch(error=>console.error('Post video worker:',error instanceof Error?error.name:'Error')).finally(()=>{pending=undefined;});};const timer=setInterval(tick,5000);tick();return async()=>{stopped=true;clearInterval(timer);await pending;};}
