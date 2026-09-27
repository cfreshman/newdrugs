import type {ClientSession} from 'mongodb';import {rows} from './db';import {users} from './auth';import {uploads,readUpload} from './uploads';import {AppError} from './errors';
import type {LogJoinPreview} from '../shared/logJoining';
export interface InviteEntry {_id:string;title:string;date:string;place:string;links?:string[];recurrence?:'none'|'anniversary'|'birthday';historicalPeople?:string[];members:string[];coverFileId:string|null;contributions:{userId:string;note?:string;fileIds:string[]}[]}
export async function inviteEntry(code:string,session?:ClientSession){
 if(!/^[a-f0-9]{32}$/.test(code))return null;
 const entry=await rows<InviteEntry>('logEntries').findOne({joinKey:code,deletedAt:{$exists:false}},{session,projection:{title:1,date:1,place:1,links:1,recurrence:1,historicalPeople:1,members:1,coverFileId:1,'contributions.userId':1,'contributions.note':1,'contributions.fileIds':1}});if(!entry?.members.length)return null;
 if(await users().findOne({_id:{$in:entry.members},suspendedAt:{$type:'string'}},{session,projection:{_id:1}}))return null;return entry;
}
async function inviteFiles(entry:InviteEntry,session?:ClientSession,photosOnly=false){
 const references=entry.contributions.filter(person=>entry.members.includes(person.userId)).flatMap(person=>person.fileIds.map(id=>({id,owner:person.userId})));
 references.sort((a,b)=>Number(b.id===entry.coverFileId)-Number(a.id===entry.coverFileId));if(!references.length)return [];
 const found=await uploads().find({_id:{$in:references.map(ref=>ref.id)},ready:true,deletedAt:{$exists:false},moderatedAt:{$exists:false},mime:photosOnly?/^image\//:/^(image|audio|video)\//},{session}).toArray();
 return references.flatMap(ref=>{const file=found.find(file=>file._id===ref.id&&file.userId===ref.owner);return file?[file]:[];});
}
export async function invitePhotos(entry:InviteEntry,session?:ClientSession){return inviteFiles(entry,session,true);}
export async function projectInvite(entry:InviteEntry,code:string,viewerId?:string,session?:ClientSession):Promise<LogJoinPreview>{
 const people=await users().find({_id:{$in:entry.members}},{session,projection:{name:1,handle:1}}).toArray(),files=await inviteFiles(entry,session);
 const names=people.map(person=>({id:person._id,name:person.name||person.handle||'Member',...(person.handle?{handle:person.handle}:{})}));
 return {entryId:entry._id,title:entry.title,date:entry.date,place:entry.place,links:entry.links||[],recurrence:entry.recurrence||'none',historicalPeople:entry.historicalPeople||[],joined:Boolean(viewerId&&entry.members.includes(viewerId)),people:names,
  photos:files.filter(file=>file.mime.startsWith('image/')).map(file=>({id:file._id,name:'Hangout photo',url:`/api/log-invites/${code}/photos/${file._id}`})),
  contributors:entry.contributions.filter(person=>entry.members.includes(person.userId)).map(person=>{const identity=names.find(item=>item.id===person.userId);return {userId:person.userId,name:identity?.name||'Member',...(identity?.handle?{handle:identity.handle}:{}),note:person.note||'',files:person.fileIds.flatMap(id=>{const file=files.find(file=>file._id===id&&file.userId===person.userId);return file?[{id:file._id,name:file.name,mime:file.mime,bytes:file.bytes,url:`/api/log-invites/${code}/${file.mime.startsWith('image/')?'photos':'media'}/${file._id}`}]:[];})};})};
}
export async function publicInvitePreview(code:string){const entry=await inviteEntry(code);if(!entry)throw new AppError(404,'not_found','This hangout code is unavailable.');return projectInvite(entry,code);}
export async function readInviteMedia(code:string,fileId:string,photosOnly=false){const entry=await inviteEntry(code),file=entry&&(await inviteFiles(entry,undefined,photosOnly)).find(file=>file._id===fileId);if(!file)throw new AppError(404,'not_found','This attachment is unavailable.');return readUpload({userId:file.userId,source:'external',scope:'read'},file._id);}
export async function readInvitePhoto(code:string,fileId:string){return readInviteMedia(code,fileId,true);}
