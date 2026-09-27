import type {ClientSession,Document} from 'mongodb';
import {rows} from './db';
import {hash,type Actor} from './auth';
import {AppError} from './errors';
import {config} from './config';
import {destinationPath,type ResourceLink} from '../shared/navigation';
import {activityInput} from '../shared/utilitySchemas';

export async function activitySince(raw:unknown,actor:Actor,blocked:string[],session?:ClientSession){
  const input=activityInput.parse(raw),since=new Date(input.since).toISOString(),kinds=[...new Set(input.kinds)].sort();
  const identity=hash(JSON.stringify([actor.userId,since,input.until?new Date(input.until).toISOString():null,kinds]));
  let until=new Date(Math.min(Date.now(),input.until?Date.parse(input.until):Date.now())).toISOString(),boundary:{at:string;id:string}|undefined;
  if(input.before)try{const cursor=JSON.parse(Buffer.from(input.before,'base64url').toString('utf8'));if(cursor.identity!==identity||typeof cursor.until!=='string'||!Number.isFinite(Date.parse(cursor.until))||typeof cursor.at!=='string'||!Number.isFinite(Date.parse(cursor.at))||typeof cursor.id!=='string')throw Error();until=cursor.until;boundary={at:cursor.at,id:cursor.id};}catch{throw new AppError(409,'activity_cursor','The account or filters changed. Restart this activity lookup.');}
  if(since>until)throw new AppError(422,'activity_range','The starting time must not be after the ending time.');
  const dates={$gt:since,$lte:until},other={$nin:[actor.userId,...blocked]},options={session,maxTimeMS:10000};
  const collect=async(collection:string,pipeline:Document[])=>rows(collection).aggregate<Record<string,any>>([...pipeline,
    {$lookup:{from:'users',localField:'actorId',foreignField:'_id',as:'actorRecord'}},{$unwind:'$actorRecord'},{$match:{'actorRecord.suspendedAt':{$not:{$type:'string'}}}},
    ...(boundary?[{$match:{$or:[{createdAt:{$lt:boundary.at}},{createdAt:boundary.at,_id:{$lt:boundary.id}}]}}]:[]),
    {$sort:{createdAt:-1,_id:-1}},{$limit:input.limit+1},
    {$project:{_id:1,kind:1,actorId:1,createdAt:1,text:1,sourceId:1,postId:1,connectionId:1,'actorRecord.name':1,'actorRecord.handle':1}},
  ],options).toArray();
  const work:Promise<Record<string,any>[]>[]=[];
  if(kinds.includes('invitations')){
    work.push(collect('connections',[{$match:{toId:actor.userId,fromId:other,createdAt:dates}},{$project:{_id:{$concat:['invitation:','$_id']},kind:{$literal:'invitation'},actorId:'$fromId',createdAt:1,text:'$note',sourceId:'$_id',connectionId:'$_id'}}]));
    work.push(collect('connections',[{$match:{fromId:actor.userId,toId:other,status:{$in:['accepted','declined']},respondedAt:dates}},{$project:{_id:{$concat:['response:','$_id']},kind:{$cond:[{$eq:['$status','accepted']},'connection_accepted','connection_declined']},actorId:'$toId',createdAt:'$respondedAt',text:{$literal:''},sourceId:'$_id',connectionId:'$_id'}}]));
  }
  if(kinds.includes('messages'))work.push(collect('directMessages',[
    {$match:{fromId:other,createdAt:dates,moderatedAt:{$exists:false}}},
    {$lookup:{from:'connections',localField:'connectionId',foreignField:'_id',as:'connection'}},{$unwind:'$connection'},
    {$match:{$and:[{'connection.members':actor.userId},{'connection.members':{$nin:blocked}}],$or:[{'connection.status':'accepted'},{'connection.initialInvitation':{$exists:true}}]}},
    {$project:{_id:{$concat:['message:','$_id']},kind:{$literal:'message'},actorId:'$fromId',createdAt:1,text:1,sourceId:'$_id',connectionId:1}},
  ]));
  if(kinds.includes('replies'))work.push(collect('posts',[
    {$match:{parentId:{$exists:true},userId:other,createdAt:dates,deletedAt:{$exists:false},moderatedAt:{$exists:false}}},
    {$lookup:{from:'posts',localField:'parentId',foreignField:'_id',as:'parent'}},{$match:{'parent.userId':actor.userId}},
    {$project:{_id:{$concat:['reply:','$_id']},kind:{$literal:'post_reply'},actorId:'$userId',createdAt:1,text:1,sourceId:'$_id',postId:'$_id'}},
  ]));
  if(kinds.includes('reactions'))work.push(collect('postLikes',[
    {$match:{userId:other,createdAt:dates}},{$lookup:{from:'posts',localField:'postId',foreignField:'_id',as:'post'}},{$unwind:'$post'},
    {$match:{'post.userId':actor.userId,'post.deletedAt':{$exists:false},'post.moderatedAt':{$exists:false}}},
    {$project:{_id:{$concat:['reaction:','$_id']},kind:{$literal:'post_like'},actorId:'$userId',createdAt:1,text:{$literal:''},sourceId:'$_id',postId:1}},
  ]));
  const all=(await Promise.all(work)).flat().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b._id.localeCompare(a._id)),page=all.slice(0,input.limit),last=page.at(-1);
  const items=page.map(row=>{const isPost=Boolean(row.postId),resourceId=String(isPost?row.postId:row.connectionId);const link:ResourceLink={rel:'open_in_newdrugs',targetKind:'exact',title:isPost?'Open post':'Open conversation',url:new URL(destinationPath({view:isPost?'post':'messages',resourceId}),config.uiOrigin).href,resourceType:isPost?'post':'conversation',resourceId};const text=String(row.text||'');return {id:String(row._id),kind:String(row.kind),createdAt:String(row.createdAt),actor:{id:String(row.actorId),name:String(row.actorRecord.name||''),...(row.actorRecord.handle?{handle:String(row.actorRecord.handle)}:{})},sourceId:String(row.sourceId),text:text.slice(0,300),textTruncated:text.length>300,...(isPost?{postId:resourceId}:{connectionId:resourceId}),link};});
  return {items,since,until,nextCursor:all.length>input.limit&&last?Buffer.from(JSON.stringify({identity,until,at:last.createdAt,id:last._id})).toString('base64url'):null,notice:'Current incoming social activity, not an immutable audit log. Removed or rescinded items are omitted. Reading does not mark notifications read.'};
}
