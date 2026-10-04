import type {ClientSession,Document} from 'mongodb';
import {rows} from './db';
import {hash,type Actor} from './auth';
import {AppError} from './errors';
import {config} from './config';
import {destinationPath,type ResourceLink} from '../shared/navigation';
import {activityInput} from '../shared/utilitySchemas';

export async function activitySince(raw:unknown,actor:Actor,blocked:string[],session?:ClientSession){
  if(actor.background&&actor.privateAccess===false)throw new AppError(403,'private_access_required','This task cannot read private account activity.');
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
    {$project:{_id:1,kind:1,actorId:1,actorKnown:1,createdAt:1,text:1,sourceId:1,postId:1,connectionId:1,entryId:1,'actorRecord.name':1,'actorRecord.handle':1}},
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
  if(kinds.includes('log'))work.push(collect('logEntries',[
    {$match:{$and:[{members:actor.userId},{members:{$nin:blocked}}],updatedAt:dates,deletedAt:{$exists:false}}},
    ...(boundary?[{$match:{$or:[{updatedAt:{$lt:boundary.at}},{updatedAt:boundary.at,$expr:{$lt:[{$concat:['log:','$_id']},boundary.id]}}]}}]:[]),
    {$sort:{updatedAt:-1,_id:-1}},
    {$lookup:{from:'users',localField:'members',foreignField:'_id',pipeline:[{$match:{suspendedAt:{$type:'string'}}},{$project:{_id:1}},{$limit:1}],as:'suspendedMembers'}},
    {$match:{'suspendedMembers.0':{$exists:false}}},
    {$addFields:{activityActorId:{$ifNull:['$lastActorId','$ownerId']}}},
    {$lookup:{from:'users',localField:'activityActorId',foreignField:'_id',as:'activityActor'}},
    {$unwind:'$activityActor'},
    {$match:{'activityActor.suspendedAt':{$not:{$type:'string'}}}},
    {$limit:input.limit+1},
    {$project:{_id:{$concat:['log:','$_id']},kind:{$literal:'log_entry'},actorId:'$activityActorId',actorKnown:{$or:[{$ne:[{$ifNull:['$lastActorId',null]},null]},{$eq:['$createdAt','$updatedAt']}]},createdAt:'$updatedAt',text:'$title',sourceId:'$_id',entryId:'$_id'}},
  ]));
  const all=(await Promise.all(work)).flat().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b._id.localeCompare(a._id)),page=all.slice(0,input.limit),last=page.at(-1);
  const items=page.map(row=>{const isLog=Boolean(row.entryId),isPost=Boolean(row.postId),resourceId=String(isLog?row.entryId:isPost?row.postId:row.connectionId),view=isLog?'log':isPost?'post':'messages';const link:ResourceLink={rel:'open_in_newdrugs',targetKind:'exact',title:isLog?'Open Log entry':isPost?'Open post':'Open conversation',url:new URL(destinationPath({view,resourceId}),config.uiOrigin).href,resourceType:isLog?'log_entry':isPost?'post':'conversation',resourceId};const text=String(row.text||'');return {id:String(row._id),kind:String(row.kind),createdAt:String(row.createdAt),actor:row.actorKnown===false?null:{id:String(row.actorId),name:String(row.actorRecord.name||''),...(row.actorRecord.handle?{handle:String(row.actorRecord.handle)}:{})},sourceId:String(row.sourceId),text:text.slice(0,300),textTruncated:text.length>300,...(isLog?{entryId:resourceId}:isPost?{postId:resourceId}:{connectionId:resourceId}),link};});
  return {items,since,until,nextCursor:all.length>input.limit&&last?Buffer.from(JSON.stringify({identity,until,at:last.createdAt,id:last._id})).toString('base64url'):null,notice:'Current accessible activity, not an immutable audit log. Log entries appear once at their latest change, without a history of individual edits. Removed or rescinded items are omitted. Reading does not mark notifications read.'};
}
