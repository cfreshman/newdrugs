import type {ClientSession} from 'mongodb';
import {rows} from './db';import {hash,type Actor} from './auth';import {AppError} from './errors';
export type CollectionKind='postSaves';
export async function setCollection(kind:CollectionKind,userId:string,targetId:string,enabled:boolean,session?:ClientSession){const id=hash(`${userId}:${targetId}`);if(enabled)await rows(kind).updateOne({_id:id},{$setOnInsert:{userId,targetId,createdAt:new Date().toISOString()}},{session,upsert:true});else await rows(kind).deleteOne({_id:id,userId},{session});return enabled;}
export async function collectionPage(kind:CollectionKind,userId:string,before:unknown,filters:Record<string,unknown>,session?:ClientSession){
 const identity=hash(JSON.stringify([kind,userId,filters]));
 let boundary:{createdAt:string;id:string}|undefined;
 if(before){
  try {
   const value=String(before);
   if(value.startsWith('saved1.')){
    const parsed=JSON.parse(Buffer.from(value.slice(7),'base64url').toString('utf8'));
    if(parsed.identity!==identity||typeof parsed.createdAt!=='string'||!Number.isFinite(Date.parse(parsed.createdAt))||typeof parsed.id!=='string'||!(/^[a-f0-9]{64}$/).test(parsed.id))throw Error();
    boundary=parsed;
   }else{
    const legacy=await rows(kind).findOne({_id:value,userId},{session});if(!legacy)throw Error();
    boundary={createdAt:String(legacy.createdAt),id:legacy._id};
   }
  }catch{throw new AppError(409,'saved_query_changed','This saved-post page is no longer valid. Start from the first page.');}
 }
 return {filter:{userId,...(boundary?{$or:[{createdAt:{$lt:boundary.createdAt}},{createdAt:boundary.createdAt,_id:{$lt:boundary.id}}]}:{})},cursor:(row:{_id:string;createdAt?:unknown})=>'saved1.'+Buffer.from(JSON.stringify({identity,createdAt:row.createdAt,id:row._id})).toString('base64url')};
}

/** Resolve current membership on every read, including search cursor hydration. */
export async function postAudience(scope:unknown,actor:Actor,session?:ClientSession){
 if(scope!=='friends'&&scope!=='saved')return null;
 if(actor.background&&!actor.accountActivity)throw new AppError(403,'account_activity_required','This view requires access to social account activity.');
 if(scope==='saved')return {postIds:new Set((await rows('postSaves').find({userId:actor.userId},{session}).toArray()).map(row=>String(row.targetId)))};
 const connections=await rows('connections').find({members:actor.userId,status:'accepted'},{session}).toArray();
 return {authorIds:new Set(connections.flatMap(row=>(row.members as string[]).filter(id=>id!==actor.userId)))};
}
