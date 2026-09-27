import type {ClientSession} from 'mongodb';import {rows} from './db';import {users} from './auth';import {uploads,readUpload} from './uploads';import {AppError} from './errors';
import type {LogJoinPreview} from '../shared/logJoining';
export interface InviteEntry {_id:string;title:string;date:string;place:string;members:string[];coverFileId:string|null;contributions:{userId:string;fileIds:string[]}[]}
export async function inviteEntry(code:string,session?:ClientSession){
 if(!/^[a-f0-9]{32}$/.test(code))return null;
 const entry=await rows<InviteEntry>('logEntries').findOne({joinKey:code,deletedAt:{$exists:false}},{session,projection:{title:1,date:1,place:1,members:1,coverFileId:1,'contributions.userId':1,'contributions.fileIds':1}});if(!entry?.members.length)return null;
 if(await users().findOne({_id:{$in:entry.members},suspendedAt:{$type:'string'}},{session,projection:{_id:1}}))return null;return entry;
}
export async function invitePhotos(entry:InviteEntry,session?:ClientSession){
 const references=entry.contributions.filter(person=>entry.members.includes(person.userId)).flatMap(person=>person.fileIds.map(id=>({id,owner:person.userId})));
 references.sort((a,b)=>Number(b.id===entry.coverFileId)-Number(a.id===entry.coverFileId));if(!references.length)return [];
 const found=await uploads().find({_id:{$in:references.map(ref=>ref.id)},ready:true,deletedAt:{$exists:false},moderatedAt:{$exists:false},mime:/^image\//},{session}).toArray();
 return references.flatMap(ref=>{const file=found.find(file=>file._id===ref.id&&file.userId===ref.owner);return file?[file]:[];});
}
export async function projectInvite(entry:InviteEntry,code:string,viewerId?:string,session?:ClientSession):Promise<LogJoinPreview>{
 const people=await users().find({_id:{$in:entry.members}},{session,projection:{name:1,handle:1}}).toArray(),photos=await invitePhotos(entry,session);
 return {entryId:entry._id,title:entry.title,date:entry.date,place:entry.place,joined:Boolean(viewerId&&entry.members.includes(viewerId)),people:people.map(person=>({id:person._id,name:person.name||person.handle||'Member',...(person.handle?{handle:person.handle}:{})})),photos:photos.map(file=>({id:file._id,name:'Hangout photo',url:`/api/log-invites/${code}/photos/${file._id}`}))};
}
export async function publicInvitePreview(code:string){const entry=await inviteEntry(code);if(!entry)throw new AppError(404,'not_found','This hangout code is unavailable.');return projectInvite(entry,code);}
export async function readInvitePhoto(code:string,fileId:string){const entry=await inviteEntry(code),file=entry&&(await invitePhotos(entry)).find(file=>file._id===fileId);if(!file)throw new AppError(404,'not_found','This photo is unavailable.');return readUpload({userId:file.userId,source:'external',scope:'read'},file._id);}
