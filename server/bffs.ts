import type {ClientSession} from 'mongodb';
import {randomUUID} from 'node:crypto';
import {rows} from './db';
import {hash,users} from './auth';
import {AppError} from './errors';
import {setQuizBff} from './quizzes';

interface BffRow{_id:string;userId:string;personId:string;createdAt:string}
const pairId=(a:string,b:string)=>[a,b].sort().join(':');
const id=(userId:string,personId:string)=>hash(`bff:${userId}:${personId}`);
export async function isBff(userId:string,personId:string,session?:ClientSession){return Boolean(await rows<BffRow>('bffs').findOne({_id:id(userId,personId),userId},{session,projection:{_id:1}}));}
export async function setBff(userId:string,personId:string,bff:boolean,session?:ClientSession){
 if(userId===personId)throw new AppError(422,'bff_person','Choose another person.');
 if(bff){
  if(await rows('blocks').findOne({pairId:pairId(userId,personId)},{session})||!await users().findOne({_id:personId,suspendedAt:{$not:{$type:'string'}}},{session,projection:{_id:1}})||!await rows('connections').findOne({_id:pairId(userId,personId),status:'accepted'},{session,projection:{_id:1}}))throw new AppError(403,'friend_required','You can mark an accepted friend as BFF.');
  await rows<BffRow>('bffs').updateOne({_id:id(userId,personId)},{$setOnInsert:{userId,personId,createdAt:new Date().toISOString()}},{session,upsert:true});
 }else await rows<BffRow>('bffs').deleteOne({_id:id(userId,personId),userId},{session});
 await setQuizBff(userId,personId,bff,session);
 await rows('recordEvents').insertOne({_id:randomUUID(),userIds:[userId],payload:{keys:['people','connections','log','quizzes']},expiresAt:new Date(Date.now()+3600000)},{session});
 return {personId,bff};
}
export async function clearBffPair(a:string,b:string,session?:ClientSession){
 await rows<BffRow>('bffs').deleteMany({_id:{$in:[id(a,b),id(b,a)]}},{session});
 await setQuizBff(a,b,false,session);await setQuizBff(b,a,false,session);
 await rows('recordEvents').insertOne({_id:randomUUID(),userIds:[a,b],payload:{keys:['people','connections','log','quizzes']},expiresAt:new Date(Date.now()+3600000)},{session});
}
export async function listBffs(userId:string,limit:number,before?:string,session?:ClientSession){
 const cursor=before?await rows<BffRow>('bffs').findOne({_id:before,userId},{session}):null;
 if(before&&!cursor)throw new AppError(409,'bff_page_changed','This BFF page changed. Start from the first page.');
 const scanLimit=limit*3,found=await rows<BffRow>('bffs').find({userId,...(cursor?{$or:[{createdAt:{$lt:cursor.createdAt}},{createdAt:cursor.createdAt,_id:{$lt:cursor._id}}]}:{})},{session,maxTimeMS:10000}).sort({createdAt:-1,_id:-1}).limit(scanLimit+1).toArray();
 const scanned=found.slice(0,scanLimit),ids=scanned.map(row=>row.personId),pairs=ids.map(personId=>pairId(userId,personId));
 const [people,connections,blocks]=await Promise.all([
  ids.length?users().find({_id:{$in:ids},suspendedAt:{$not:{$type:'string'}}},{session,projection:{name:1,handle:1,photos:1}}).toArray():[],
  pairs.length?rows('connections').find({_id:{$in:pairs},status:'accepted'},{session,projection:{_id:1}}).toArray():[],
  pairs.length?rows('blocks').find({pairId:{$in:pairs}},{session,projection:{pairId:1}}).toArray():[],
 ]);
 const byId=new Map(people.map(person=>[person._id,person])),accepted=new Set(connections.map(connection=>connection._id)),blocked=new Set(blocks.map(block=>String(block.pairId)));
 const visible=scanned.flatMap(row=>{const person=byId.get(row.personId),connectionId=pairId(userId,row.personId);return person&&accepted.has(connectionId)&&!blocked.has(connectionId)?[{row,person,connectionId}]:[];});
 const page=visible.slice(0,limit),nextCursor=visible.length>limit?visible[limit-1].row._id:found.length>scanLimit?scanned.at(-1)?._id:null;
 return {items:page.map(({person,connectionId})=>({id:person._id,name:person.name||person.handle||'Friend',...(person.handle?{handle:person.handle}:{}),...(person.photos?.[0]?{photoId:person.photos[0]}:{}),connectionId})),nextCursor:nextCursor||null};
}
