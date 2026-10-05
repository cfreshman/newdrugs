import type {ClientSession} from 'mongodb';
import {users,hash} from './auth';
import {rows} from './db';
import {AppError} from './errors';
import {isPersonHidden} from './peopleHides';
import {notificationEnabled} from './notificationSettings';
import {enqueueStoredPush} from './push';
import {MAX_POST_MENTIONS,postMentionTokens,type PostMention} from '../shared/postFeatures';

const pair=(a:string,b:string)=>[a,b].sort().join(':');
export async function resolvePostHandles(viewerId:string,handles:string[],session?:ClientSession){
 const requested=[...new Set(handles.map(handle=>handle.toLowerCase()))];
 if(requested.length>MAX_POST_MENTIONS)throw new AppError(422,'post_mentions','Mention up to ten people.');
 const people=await users().find({handle:{$in:requested},suspendedAt:null},{session}).limit(requested.length).toArray();
 const blocks=await rows('blocks').find({pairId:{$in:people.map(person=>pair(viewerId,person._id))}},{session,projection:{pairId:1}}).limit(people.length).toArray();
 const blocked=new Set(blocks.map(row=>String(row.pairId))),items:{handle:string;userId:string;name:string;photoId?:string}[]=[];
 for(const person of people){
  if(blocked.has(pair(viewerId,person._id)))continue;
  items.push({handle:person.handle!,userId:person._id,name:person.name||person.handle!,...(person.photos?.[0]?{photoId:person.photos[0]}:{})});
 }
 return items.sort((a,b)=>requested.indexOf(a.handle)-requested.indexOf(b.handle));
}
export async function bindPostMentions(viewerId:string,text:string,session?:ClientSession):Promise<PostMention[]>{
 const tokens=postMentionTokens(text);
 if(tokens.length>MAX_POST_MENTIONS)throw new AppError(422,'post_mentions','Mention up to ten people.');
 const people=await resolvePostHandles(viewerId,tokens.map(token=>token.handle),session),byHandle=new Map(people.map(person=>[person.handle,person.userId]));
 return tokens.flatMap(token=>{const userId=byHandle.get(token.handle);return userId?[{start:token.start,end:token.end,userId}]:[];});
}
export async function notifyPostMentions(actorId:string,postId:string,text:string,mentions:PostMention[],session:ClientSession,skipIds:string[]=[]){
 const recipients=[...new Set(mentions.map(mention=>mention.userId))].filter(id=>id!==actorId&&!skipIds.includes(id));
 for(const userId of recipients){
  if(await isPersonHidden(userId,actorId,session)||!await notificationEnabled(userId,'post_mention',session))continue;
  if(await rows('blocks').findOne({pairId:pair(userId,actorId)},{session,projection:{_id:1}}))continue;
  const id=hash(`post_mention:${postId}:${userId}`);
  await rows('notifications').insertOne({_id:id,userId,actorId,kind:'post_mention',postId,text:text.slice(0,180),readAt:null,createdAt:new Date().toISOString()},{session});
  await enqueueStoredPush(userId,actorId,postId,'post_mention',id,session);
 }
}
