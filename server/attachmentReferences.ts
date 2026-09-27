import type {ClientSession} from 'mongodb';
import {rows,transaction} from './db';
import {hash} from './auth';
export type AttachmentKind='profile'|'posts'|'chat'|'hangouts';
export interface AttachmentReference {_id:string;ownerId:string;fileId:string;kind:AttachmentKind;sourceId:string}
const sources={profile:'users',posts:'posts',chat:'messages',hangouts:'logEntries'};
export const attachmentReferences=()=>rows<AttachmentReference>('attachmentReferences');
/** Keep attachment-kind indexes in the same transaction as their source write. */
export async function syncSourceAttachments(kind:AttachmentKind,sourceId:string,session?:ClientSession){
 const source=await rows(sources[kind]).findOne({_id:sourceId},{session});
 let candidates:{ownerId:string;fileId:string}[]=[];
 if(source&&!source.deletedAt&&!source.moderatedAt){
  if(kind==='profile')candidates=(source.photos as string[]||[]).map(fileId=>({ownerId:source._id,fileId}));
  if(kind==='posts')candidates=(source.fileIds as string[]||[]).map(fileId=>({ownerId:String(source.userId),fileId}));
  if(kind==='chat')candidates=(source.files as {id:string}[]||[]).map(file=>({ownerId:String(source.userId),fileId:file.id}));
  if(kind==='hangouts')candidates=(source.contributions as {userId:string;fileIds:string[]}[]||[]).filter(person=>(source.members as string[]||[]).includes(person.userId)).flatMap(person=>person.fileIds.map(fileId=>({ownerId:person.userId,fileId})));
 }
 const files=await rows('uploads').find({_id:{$in:candidates.map(item=>item.fileId)},ready:true,deletedAt:{$exists:false},moderatedAt:{$exists:false}},{session,projection:{userId:1}}).toArray();
 const next=candidates.filter(item=>files.some(file=>file._id===item.fileId&&file.userId===item.ownerId)).map(item=>({...item,kind,sourceId,_id:hash(JSON.stringify([kind,sourceId,item.ownerId,item.fileId]))}));
 const previous=await attachmentReferences().find({kind,sourceId},{session}).toArray(),nextIds=new Set(next.map(item=>item._id)),previousIds=new Set(previous.map(item=>item._id));
 const removed=previous.filter(item=>!nextIds.has(item._id)),added=next.filter(item=>!previousIds.has(item._id));
 if(removed.length)await attachmentReferences().deleteMany({_id:{$in:removed.map(item=>item._id)}},{session});
 for(const item of added){await attachmentReferences().updateOne({_id:item._id},{$setOnInsert:item},{session,upsert:true});await rows<{_id:string;attachmentKinds:AttachmentKind[];referenceIndexRevision:number}>('uploads').updateOne({_id:item.fileId,userId:item.ownerId},{$addToSet:{attachmentKinds:kind},$inc:{referenceIndexRevision:1}},{session});}
 for(const item of removed)if(!await attachmentReferences().findOne({ownerId:item.ownerId,fileId:item.fileId,kind},{session,projection:{_id:1}}))await rows<{_id:string;attachmentKinds:AttachmentKind[];referenceIndexRevision:number}>('uploads').updateOne({_id:item.fileId,userId:item.ownerId},{$pull:{attachmentKinds:kind},$inc:{referenceIndexRevision:1}},{session});
}
export async function clearChatAttachmentReferences(ownerId:string,session:ClientSession){
 await attachmentReferences().deleteMany({ownerId,kind:'chat'},{session});
 await rows<{_id:string;attachmentKinds:AttachmentKind[];referenceIndexRevision:number}>('uploads').updateMany({userId:ownerId,attachmentKinds:'chat'},{$pull:{attachmentKinds:'chat'},$inc:{referenceIndexRevision:1}},{session});
}
export async function backfillAttachmentReferences(){
 for(const kind of Object.keys(sources) as AttachmentKind[]){
  const state=await rows('attachmentReferenceMeta').findOne({_id:kind});if(state?.done)continue;
  const page=await rows(sources[kind]).find(state?.cursor?{_id:{$gt:String(state.cursor)}}:{}).sort({_id:1}).limit(30).project({_id:1}).toArray();
  for(const item of page)await transaction(async session=>{await rows<{_id:string;attachmentIndexRevision:number}>(sources[kind]).updateOne({_id:item._id},{$inc:{attachmentIndexRevision:1}},{session});await syncSourceAttachments(kind,item._id,session);});
  await rows('attachmentReferenceMeta').updateOne({_id:kind},{$set:{cursor:page.at(-1)?._id||state?.cursor||'',done:page.length<30}},{upsert:true});
 }
}
export function startAttachmentReferenceWorker(){let stopped=false,pending:Promise<void>|undefined;const tick=()=>{if(stopped||pending)return;pending=backfillAttachmentReferences().catch(error=>console.error('Attachment backfill',{name:error.name})).finally(()=>{pending=undefined;});};const timer=setInterval(tick,2000);tick();return async()=>{stopped=true;clearInterval(timer);await pending;};}
