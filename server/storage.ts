import type {ClientSession} from 'mongodb';
import type {User} from './auth';
import {rows} from './db';
import {uploads,uploadRef} from './uploads';
import {logAttachmentLocations} from './log';
import {destinationPath} from '../shared/navigation';
import type {StorageType,StorageLocation,StorageAttachment,StoragePage} from '../shared/storage';
import {MAX_ACCOUNT_UPLOAD_BYTES} from '../shared/uploads';

export async function listStorage(user:User,{type='all',attachedTo='all',before,limit=30}:{type?:StorageType;attachedTo?:StorageLocation;before?:string;limit?:number},session?:ClientSession):Promise<StoragePage>{
 const media={images:/^image\//,audio:/^audio\//,video:/^video\//};
 const mime=type==='all'?{}:type==='documents'?{mime:{$not:/^(image|audio|video)\//}}:{mime:media[type]};
 let attachedIds:string[]|undefined;
 if(attachedTo==='profile')attachedIds=user.photos||[];
 else if(attachedTo==='posts')attachedIds=await rows('posts').distinct('fileIds',{userId:user._id,deletedAt:{$exists:false},moderatedAt:{$exists:false}},{session}) as string[];
 else if(attachedTo==='chat')attachedIds=await rows('messages').distinct('files.id',{userId:user._id},{session}) as string[];
 else if(attachedTo==='hangouts')attachedIds=[...new Set((await logAttachmentLocations(user._id,undefined,session)).flatMap(entry=>entry.contributions.filter(person=>person.userId===user._id).flatMap(person=>person.fileIds)))];
 const files=await uploads().find({userId:user._id,deletedAt:{$exists:false},moderatedAt:{$exists:false},...mime,...(attachedIds||before?{_id:{...(attachedIds?{$in:attachedIds}:{}),...(before?{$lt:before}:{})}}:{})},{session}).sort({_id:-1}).limit(limit+1).toArray();
 const page=files.slice(0,limit),ids=page.map(file=>file._id),locations=new Map(ids.map(id=>[id,[] as StorageAttachment[]]));
 const add=(id:string,label:string,destination:StorageAttachment['destination'])=>{const values=locations.get(id);if(values&&!values.some(value=>value.url===destinationPath(destination)))values.push({label,destination,url:destinationPath(destination)});};
 for(const id of user.photos||[])add(id,'Profile photo',{view:'person',resourceId:user._id});
 if(ids.length){
  const logs=await logAttachmentLocations(user._id,ids,session);
  for(const entry of logs)for(const contribution of entry.contributions)if(contribution.userId===user._id)for(const id of contribution.fileIds)add(id,entry.title?`Hangout: ${entry.title}`:`Hangout · ${entry.date}`,{view:'log',resourceId:entry._id});
  const posts=await rows('posts').find({userId:user._id,fileIds:{$in:ids},deletedAt:{$exists:false},moderatedAt:{$exists:false}},{session,projection:{fileIds:1,parentId:1,text:1,createdAt:1}}).toArray();
  for(const post of posts)for(const id of post.fileIds as string[])add(id,`${post.parentId?'Reply':'Post'}${typeof post.text==='string'&&post.text.trim()?`: ${post.text.trim().slice(0,64)}${post.text.trim().length>64?'…':''}`:typeof post.createdAt==='string'?` · ${post.createdAt.slice(0,10)}`:''}`,{view:'post',resourceId:post._id});
  const messages=await rows('messages').find({userId:user._id,'files.id':{$in:ids}},{session,projection:{'files.id':1,createdAt:1,text:1}}).sort({createdAt:-1,_id:-1}).toArray();
  for(const message of messages)for(const file of message.files as {id:string}[])add(file.id,`Chat${typeof message.text==='string'&&message.text.trim()?`: ${message.text.trim().slice(0,64)}${message.text.trim().length>64?'…':''}`:typeof message.createdAt==='string'?` · ${message.createdAt.slice(0,10)}`:''}`,{view:'chat',resourceId:message._id});
 }
 return {usedBytes:Math.max(0,user.storageBytes||0),limitBytes:MAX_ACCOUNT_UPLOAD_BYTES,items:page.map(file=>({...uploadRef(file),createdAt:file.createdAt,attached:Boolean(file.retained),inProfile:Boolean(user.photos?.includes(file._id)),attachments:locations.get(file._id)||[]})),nextCursor:files.length>limit?files[limit-1]._id:null};
}
