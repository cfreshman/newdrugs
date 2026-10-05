import type {ClientSession} from 'mongodb';
import type {User} from './auth';
import {rows} from './db';
import {uploads,ownedUploadRef,ownUpload} from './uploads';
import {logAttachmentLocations} from './log';
import {attachmentReferences,type AttachmentReference} from './attachmentReferences';
import {destinationPath} from '../shared/navigation';
import type {StorageType,StorageLocation,StorageAttachment,StoragePage,StoredFile,LinkedVideoItem} from '../shared/storage';
import {MAX_ACCOUNT_UPLOAD_BYTES} from '../shared/uploads';
import {workGate} from './workGate';
import {websitePreviewUrl,websitePublicUrl,type WebsiteDoc} from './websites';
import {AppError} from './errors';
import {postVideoLinks} from './postVideoLinks';
const referenceGate=workGate(8,256);
const snippet=(value:unknown)=>typeof value==='string'&&value.trim()?`: ${value.trim().slice(0,64)}${value.trim().length>64?'…':''}`:'';
type StorageCursor={createdAt:string;id:string};
async function storageCursor(userId:string,before:string,session?:ClientSession):Promise<StorageCursor>{
 if(before.startsWith('s2.'))try{
  const value=JSON.parse(Buffer.from(before.slice(3),'base64url').toString('utf8'));
  if(typeof value.createdAt==='string'&&value.createdAt.length<=40&&typeof value.id==='string'&&value.id.length<=100)return value;
 }catch{ /* Invalid cursor below. */ }
 else {const file=await uploads().findOne({_id:before,userId},{session,projection:{createdAt:1}});if(file?.createdAt)return {createdAt:file.createdAt,id:before};}
 throw new AppError(422,'storage_cursor','This storage page is unavailable. Start from the first page.');
}
const nextStorageCursor=(file:{createdAt:string;_id:string})=>`s2.${Buffer.from(JSON.stringify({createdAt:file.createdAt,id:file._id})).toString('base64url')}`;

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
  if(ref.kind==='profile'&&ref.sourceId===user._id&&(user.photos?.includes(ref.fileId)||user.voiceFileId===ref.fileId)){destination={view:'person',resourceId:user._id};label=user.voiceFileId===ref.fileId?'Profile voice note':'Profile photo';}
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
 const cursor=before?await storageCursor(user._id,before,session):null;
 const position=cursor?{$or:[{createdAt:{$lt:cursor.createdAt}},{createdAt:cursor.createdAt,_id:{$lt:cursor.id}}]}:{};
 const [files,links]=await Promise.all([
  uploads().find({userId:user._id,deletedAt:{$exists:false},moderatedAt:{$exists:false},...mime,...(attachedTo!=='all'?{attachmentKinds:attachedTo}:{}),...position},{session}).sort({createdAt:-1,_id:-1}).limit(limit+1).toArray(),
  (type==='all'||type==='video')&&(attachedTo==='all'||attachedTo==='posts')?postVideoLinks().find({userId:user._id,...position},{session,projection:{poster:0}}).sort({createdAt:-1,_id:-1}).limit(limit+1).toArray():Promise.resolve([]),
 ]);
 const ordered=[...files.map(file=>({kind:'file' as const,file,createdAt:file.createdAt,_id:file._id})),...links.map(link=>({kind:'link' as const,link,createdAt:link.createdAt,_id:link._id}))].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b._id.localeCompare(a._id));
 const page=ordered.slice(0,limit),filePage=page.flatMap(item=>item.kind==='file'?[item.file]:[]);
 const groups=await Promise.all(filePage.map(file=>referenceGate.run(()=>attachmentReferences().find({ownerId:user._id,fileId:file._id,...(attachedTo!=='all'?{kind:attachedTo}:{})},{session}).sort({_id:1}).limit(7).toArray())));
 const projected=await projectReferences(user,groups.flat(),session);
 const order={person:0,post:1,chat:2,log:3,website:4};
 const uploadItems=new Map<string,StoredFile>();
 filePage.forEach((file,index)=>{const refs=groups[index],attachments=refs.slice(0,6).flatMap(ref=>projected.get(ref._id)||[]).sort((a,b)=>order[a.destination?.view||'website']-order[b.destination?.view||'website']);if(attachedTo==='all'||refs.length>6||refs.some(ref=>ref.kind===attachedTo&&projected.has(ref._id)))uploadItems.set(file._id,{...ownedUploadRef(file),createdAt:file.createdAt,attached:Boolean(file.retained),inProfile:Boolean(user.photos?.includes(file._id)||user.voiceFileId===file._id),inWebsite:refs.some(ref=>ref.kind==='websites'),...(file.posterBytes?{posterBytes:file.posterBytes}:{}),attachments,attachmentCursor:refs.length>6?refs[5]._id:null});});
 const postIds=[...new Set(page.flatMap(item=>item.kind==='link'?[item.link.postId]:[]))];
 const activePosts=postIds.length?await rows('posts').find({_id:{$in:postIds},userId:user._id,deletedAt:{$exists:false},moderatedAt:{$exists:false}},{session,projection:{_id:1}}).toArray():[];
 const visiblePosts=new Set(activePosts.map(post=>post._id));
 const items:StoragePage['items']=page.flatMap<StoredFile|LinkedVideoItem>(item=>{
  if(item.kind==='file')return uploadItems.get(item.file._id)?[uploadItems.get(item.file._id)!]:[];
  const link=item.link;if(!visiblePosts.has(link.postId))return [];
  const destination={view:'post' as const,resourceId:link.postId},attachment={label:'Post video',destination,url:destinationPath(destination)};
  const video:LinkedVideoItem={kind:'linked_video',id:link._id,sourceUrl:link.sourceUrl,title:link.title,postId:link.postId,createdAt:link.createdAt,bytes:link.bytes,...(link.bytes?{posterUrl:`/api/post-video-links/${link._id}/poster`}:{}),attachments:[attachment]};
  return [video];
 });
 const indexing=await rows('attachmentReferenceMeta').countDocuments({done:true},{session})<5;
 return {usedBytes:Math.max(0,user.storageBytes||0),limitBytes:MAX_ACCOUNT_UPLOAD_BYTES,items,indexing,nextCursor:ordered.length>limit?nextStorageCursor(page.at(-1)!):null};
}
