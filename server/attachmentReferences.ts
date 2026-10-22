import type {ClientSession} from 'mongodb';
import {rows,transaction} from './db';
import {hash} from './auth';
import {ARTIFACT_MAX_ACCOUNT_VERSIONS,ARTIFACT_MAX_ASSETS} from '../shared/artifacts';
import {AppError} from './errors';
export type AttachmentKind='profile'|'posts'|'chat'|'hangouts'|'websites'|'artifacts';
export interface AttachmentReference {_id:string;ownerId:string;fileId:string;kind:AttachmentKind;sourceId:string}
const sources={profile:'users',posts:'posts',chat:'messages',hangouts:'logEntries',websites:'websites',artifacts:'artifacts'};
export const attachmentSourceKinds=Object.keys(sources) as AttachmentKind[];
export const attachmentReferences=()=>rows<AttachmentReference>('attachmentReferences');
const maxArtifactReferences=ARTIFACT_MAX_ACCOUNT_VERSIONS*ARTIFACT_MAX_ASSETS;
async function addArtifactAttachments(sourceId:string,ownerId:string,fileIds:string[],session?:ClientSession){
 const ids=[...new Set(fileIds)];if(!ids.length)return;
 const files=await rows('uploads').find({_id:{$in:ids},userId:ownerId,ready:true,deletedAt:{$exists:false},moderatedAt:{$exists:false}},{session,projection:{_id:1}}).toArray();
 for(const file of files){
  const item:AttachmentReference={ownerId,fileId:file._id,kind:'artifacts',sourceId,_id:hash(JSON.stringify(['artifacts',sourceId,ownerId,file._id]))};
  const added=await attachmentReferences().updateOne({_id:item._id},{$setOnInsert:item},{session,upsert:true});
  await rows<{_id:string;attachmentKinds:AttachmentKind[];referenceIndexRevision:number}>('uploads').updateOne({_id:item.fileId,userId:ownerId,...(added.upsertedCount?{}:{attachmentKinds:{$ne:'artifacts'}})},{$addToSet:{attachmentKinds:'artifacts'},$inc:{referenceIndexRevision:1}},{session});
 }
}
async function clearArtifactSourceAttachments(sourceId:string,session?:ClientSession){
 const previous=await attachmentReferences().find({kind:'artifacts',sourceId},{session}).limit(maxArtifactReferences+1).toArray();
 if(previous.length>maxArtifactReferences)throw new AppError(503,'artifact_limit','Artifact attachment cleanup is unavailable. Try again later.');
 if(previous.length)await attachmentReferences().deleteMany({_id:{$in:previous.map(item=>item._id)}},{session});
 const owners=new Map<string,Set<string>>();
 for(const item of previous){let ids=owners.get(item.ownerId);if(!ids){ids=new Set();owners.set(item.ownerId,ids);}ids.add(item.fileId);}
 for(const [ownerId,ids] of owners){
  const remaining=await attachmentReferences().find({ownerId,kind:'artifacts',fileId:{$in:[...ids]}},{session,projection:{fileId:1}}).limit(maxArtifactReferences+1).toArray();
  if(remaining.length>maxArtifactReferences)throw new AppError(503,'artifact_limit','Artifact attachment cleanup is unavailable. Try again later.');
  const retained=new Set(remaining.map(item=>item.fileId)),removed=[...ids].filter(id=>!retained.has(id));
  if(removed.length)await rows<{_id:string;attachmentKinds:AttachmentKind[];referenceIndexRevision:number}>('uploads').updateMany({_id:{$in:removed},userId:ownerId},{$pull:{attachmentKinds:'artifacts'},$inc:{referenceIndexRevision:1}},{session});
 }
}
/** An upload revocation removes that exact file from every retained version's index. */
export async function removeArtifactFileAttachments(ownerId:string,fileId:string,session:ClientSession){
 await attachmentReferences().deleteMany({ownerId,fileId,kind:'artifacts'},{session});
 await rows<{_id:string;attachmentKinds:AttachmentKind[];referenceIndexRevision:number}>('uploads').updateOne({_id:fileId,userId:ownerId,attachmentKinds:'artifacts'},{$pull:{attachmentKinds:'artifacts'},$inc:{referenceIndexRevision:1}},{session});
}
/** History is indexed by the bounded background backfill, never by an ordinary edit. */
async function backfillArtifactAttachmentHistory(sourceId:string,session:ClientSession){
 const source=await rows('artifacts').findOne({_id:sourceId,deletedAt:{$exists:false},moderatedAt:{$exists:false}},{session,projection:{userId:1,assets:1}});if(!source)return;
 const ownerId=String(source.userId),versions=await rows('artifactVersions').find({artifactId:sourceId,userId:ownerId},{session,projection:{assets:1}}).limit(ARTIFACT_MAX_ACCOUNT_VERSIONS+1).toArray();
 if(versions.length>ARTIFACT_MAX_ACCOUNT_VERSIONS)throw new AppError(503,'artifact_limit','Artifact attachment indexing is unavailable. Try again later.');
 const ids=[...new Set([source,...versions].flatMap(version=>(version.assets as {fileId:string}[]||[]).map(asset=>asset.fileId)))];
 if(ids.length>maxArtifactReferences)throw new AppError(503,'artifact_limit','Artifact attachment indexing is unavailable. Try again later.');
 await addArtifactAttachments(sourceId,ownerId,ids,session);
}
/** Keep attachment-kind indexes in the same transaction as their source write. */
export async function syncSourceAttachments(kind:AttachmentKind,sourceId:string,session?:ClientSession){
 const source=await rows(sources[kind]).findOne({_id:sourceId},{session,...(kind==='artifacts'?{projection:{userId:1,assets:1,deletedAt:1,moderatedAt:1}}:{})});
 if(kind==='artifacts'){
  if(!source||source.deletedAt||source.moderatedAt)await clearArtifactSourceAttachments(sourceId,session);
  else{
   const assets=source.assets as {fileId:string}[]||[];
   if(assets.length>ARTIFACT_MAX_ASSETS)throw new AppError(503,'artifact_limit','Artifact attachment indexing is unavailable. Try again later.');
   await addArtifactAttachments(sourceId,String(source.userId),assets.map(asset=>asset.fileId),session);
  }
  return;
 }
 let candidates:{ownerId:string;fileId:string}[]=[];
 if(source&&!source.deletedAt&&!source.moderatedAt){
  if(kind==='profile')candidates=[...(source.photos as string[]||[]),...(typeof source.voiceFileId==='string'?[source.voiceFileId]:[])].map(fileId=>({ownerId:source._id,fileId}));
  if(kind==='posts')candidates=(source.fileIds as string[]||[]).map(fileId=>({ownerId:String(source.userId),fileId}));
  if(kind==='chat')candidates=(source.files as {id:string}[]||[]).map(file=>({ownerId:String(source.userId),fileId:file.id}));
  if(kind==='hangouts')candidates=(source.contributions as {userId:string;fileIds:string[]}[]||[]).filter(person=>(source.members as string[]||[]).includes(person.userId)).flatMap(person=>person.fileIds.map(fileId=>({ownerId:person.userId,fileId})));
  if(kind==='websites')candidates=[...new Set([...(source.assets as {fileId:string}[]||[]),...((source.published as {assets?:{fileId:string}[]}|null)?.assets||[])].map(asset=>asset.fileId))].map(fileId=>({ownerId:source._id,fileId}));
 }
 const files=await rows('uploads').find({_id:{$in:candidates.map(item=>item.fileId)},ready:true,deletedAt:{$exists:false},moderatedAt:{$exists:false}},{session,projection:{userId:1}}).toArray();
 const fileOwners=new Map(files.map(file=>[file._id,file.userId]));
 const next=candidates.filter(item=>fileOwners.get(item.fileId)===item.ownerId).map(item=>({...item,kind,sourceId,_id:hash(JSON.stringify([kind,sourceId,item.ownerId,item.fileId]))}));
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
 for(const kind of attachmentSourceKinds){
  const state=await rows('attachmentReferenceMeta').findOne({_id:kind});if(state?.done)continue;
  const page=await rows(sources[kind]).find(state?.cursor?{_id:{$gt:String(state.cursor)}}:{}).sort({_id:1}).limit(30).project({_id:1}).toArray();
  for(const item of page)await transaction(async session=>{await rows<{_id:string;attachmentIndexRevision:number}>(sources[kind]).updateOne({_id:item._id},{$inc:{attachmentIndexRevision:1}},{session});await syncSourceAttachments(kind,item._id,session);if(kind==='artifacts')await backfillArtifactAttachmentHistory(item._id,session);});
  await rows('attachmentReferenceMeta').updateOne({_id:kind},{$set:{cursor:page.at(-1)?._id||state?.cursor||'',done:page.length<30}},{upsert:true});
 }
}
export function startAttachmentReferenceWorker(){let stopped=false,pending:Promise<void>|undefined;const tick=()=>{if(stopped||pending)return;pending=backfillAttachmentReferences().catch(error=>console.error('Attachment backfill',{name:error.name})).finally(()=>{pending=undefined;});};const timer=setInterval(tick,2000);tick();return async()=>{stopped=true;clearInterval(timer);await pending;};}
