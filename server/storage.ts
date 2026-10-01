import type {ClientSession} from 'mongodb';
import type {User} from './auth';
import {rows} from './db';
import {uploads,ownedUploadRef,ownUpload} from './uploads';
import {logAttachmentLocations} from './log';
import {attachmentReferences,type AttachmentReference} from './attachmentReferences';
import {destinationPath} from '../shared/navigation';
import type {StorageType,StorageLocation,StorageAttachment,StoragePage} from '../shared/storage';
import {MAX_ACCOUNT_UPLOAD_BYTES} from '../shared/uploads';
import {workGate} from './workGate';
import {websitePreviewUrl,websitePublicUrl,type WebsiteDoc} from './websites';
const referenceGate=workGate(8,256);
const snippet=(value:unknown)=>typeof value==='string'&&value.trim()?`: ${value.trim().slice(0,64)}${value.trim().length>64?'…':''}`:'';

async function projectReferences(user:User,refs:AttachmentReference[],session?:ClientSession){
 const selected=(kind:string)=>refs.filter(ref=>ref.kind===kind),postRefs=selected('posts'),chatRefs=selected('chat'),logRefs=selected('hangouts'),websiteRefs=selected('websites');
 const [posts,messages,logs,website]=await Promise.all([
  postRefs.length?rows('posts').find({_id:{$in:postRefs.map(ref=>ref.sourceId)},userId:user._id,deletedAt:{$exists:false},moderatedAt:{$exists:false}},{session,projection:{fileIds:1,parentId:1,text:1}}).toArray():[],
  chatRefs.length?rows('messages').find({_id:{$in:chatRefs.map(ref=>ref.sourceId)},userId:user._id},{session,projection:{'files.id':1,text:1}}).toArray():[],
  logRefs.length?logAttachmentLocations(user._id,logRefs.map(ref=>ref.fileId),session,logRefs.map(ref=>ref.sourceId)):[],
  websiteRefs.length?rows<WebsiteDoc>('websites').findOne({_id:user._id},{session,projection:{assets:1,published:1,code:1,previewToken:1}}):null,
 ]);
 const projected=new Map<string,StorageAttachment>();
 for(const ref of refs){
  let destination:StorageAttachment['destination']|undefined,label='';
  if(ref.kind==='profile'&&ref.sourceId===user._id&&user.photos?.includes(ref.fileId)){destination={view:'person',resourceId:user._id};label='Profile photo';}
  if(ref.kind==='posts'){const post=posts.find(row=>row._id===ref.sourceId&&(row.fileIds as string[]||[]).includes(ref.fileId));if(post){destination={view:'post',resourceId:post._id};label=`${post.parentId?'Reply':'Post'}${snippet(post.text)}`;}}
  if(ref.kind==='chat'){const message=messages.find(row=>row._id===ref.sourceId&&(row.files as {id:string}[]||[]).some(file=>file.id===ref.fileId));if(message){destination={view:'chat',resourceId:message._id};label=`Chat${snippet(message.text)}`;}}
  if(ref.kind==='hangouts'){const log=logs.find(row=>row._id===ref.sourceId&&row.contributions.some(person=>person.userId===user._id&&person.fileIds.includes(ref.fileId)));if(log){destination={view:'log',resourceId:log._id};label=log.title?`Hangout: ${log.title}`:`Hangout · ${log.date}`;}}
  if(ref.kind==='websites'&&website){const live=website.published?.assets?.find(asset=>asset.fileId===ref.fileId),draft=website.assets?.find(asset=>asset.fileId===ref.fileId),asset=live||draft;if(asset){const origin=live?websitePublicUrl(user.handle||'',website.code):websitePreviewUrl(website.previewToken);projected.set(ref._id,{label:`Website${live?'':' draft'}: ${asset.path}`,url:new URL(asset.path,origin).href});continue;}}
  if(destination)projected.set(ref._id,{label,destination,url:destinationPath(destination)});
 }
 return projected;
}
export async function storageAttachments(user:User,fileId:string,before?:string,limit=20,session?:ClientSession,attachedTo:StorageLocation='all'){
 await ownUpload(user._id,fileId,session);
 const refs=await attachmentReferences().find({ownerId:user._id,fileId,...(attachedTo!=='all'?{kind:attachedTo}:{}),...(before?{_id:{$gt:before}}:{})},{session}).sort({_id:1}).limit(limit+1).toArray(),page=refs.slice(0,limit),projected=await projectReferences(user,page,session);
 return {items:page.flatMap(ref=>projected.get(ref._id)||[]),nextCursor:refs.length>limit?page.at(-1)!._id:null};
}
export async function listStorage(user:User,{type='all',attachedTo='all',before,limit=30}:{type?:StorageType;attachedTo?:StorageLocation;before?:string;limit?:number},session?:ClientSession):Promise<StoragePage>{
 const media={images:/^image\//,audio:/^audio\//,video:/^video\//};
 const mime=type==='all'?{}:type==='documents'?{mime:{$not:/^(image|audio|video)\//}}:{mime:media[type]};
 const files=await uploads().find({userId:user._id,deletedAt:{$exists:false},moderatedAt:{$exists:false},...mime,...(attachedTo!=='all'?{attachmentKinds:attachedTo}:{}),...(before?{_id:{$lt:before}}:{})},{session}).sort({_id:-1}).limit(limit+1).toArray();
 const page=files.slice(0,limit);
 const groups=await Promise.all(page.map(file=>referenceGate.run(()=>attachmentReferences().find({ownerId:user._id,fileId:file._id,...(attachedTo!=='all'?{kind:attachedTo}:{})},{session}).sort({_id:1}).limit(7).toArray())));
 const projected=await projectReferences(user,groups.flat(),session);
 const order={person:0,post:1,chat:2,log:3,website:4};
 const items=page.map((file,index)=>{const refs=groups[index],attachments=refs.slice(0,6).flatMap(ref=>projected.get(ref._id)||[]).sort((a,b)=>order[a.destination?.view||'website']-order[b.destination?.view||'website']);return {...ownedUploadRef(file),createdAt:file.createdAt,attached:Boolean(file.retained),inProfile:Boolean(user.photos?.includes(file._id)),inWebsite:refs.some(ref=>ref.kind==='websites'),attachments,attachmentCursor:refs.length>6?refs[5]._id:null};})
  .filter((file,index)=>attachedTo==='all'||groups[index].length>6||groups[index].some(ref=>ref.kind===attachedTo&&projected.has(ref._id)));
 const indexing=await rows('attachmentReferenceMeta').countDocuments({done:true},{session})<5;
 return {usedBytes:Math.max(0,user.storageBytes||0),limitBytes:MAX_ACCOUNT_UPLOAD_BYTES,items,indexing,nextCursor:files.length>limit?page.at(-1)!._id:null};
}
