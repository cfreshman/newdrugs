import {createHash,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import type {ClientSession} from 'mongodb';
import {emptySquare,parseSquareProject,MAX_SQUARE_BYTES,type SquareProject} from '../src/squareModel';
import {renderSquareNode} from '../src/squareNodeRenderer';
import type {LogEntry} from '../shared/log';
import {MAX_UPLOAD_BYTES} from '../shared/uploads';
import type {Actor} from './auth';
import {rows} from './db';
import {AppError,requireValue} from './errors';
import {logOperation} from './log';
import {acceptUpload,deleteUpload,ownUpload,prepareUpload,readUpload} from './uploads';
import {workGate} from './workGate';

interface MakeDraft {_id:string;userId:string;project:SquareProject;revision:number;createdAt:string;updatedAt:string;expiresAt:Date}
const drafts=()=>rows<MakeDraft>('makeDrafts');
const renderGate=workGate(2,12);
const sha256=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const expires=()=>new Date(Date.now()+7*86400000);
const output=(row:MakeDraft,includeProject=false)=>({draftId:row._id,revision:row.revision,...(includeProject?{project:row.project}:{}),createdAt:row.createdAt,updatedAt:row.updatedAt,expiresAt:row.expiresAt.toISOString()});
async function owned(userId:string,id:string,session?:ClientSession){return requireValue(await drafts().findOne({_id:id,userId,expiresAt:{$gt:new Date()}},{session}),'This Make draft is unavailable.');}

/** Resolve owned image uploads before storing a complete bounded project. */
export async function normalizeMakeProject(input:unknown,actor:Actor):Promise<SquareProject>{
 if(input===undefined)return emptySquare();
 if(!input||typeof input!=='object'||Array.isArray(input))throw new AppError(422,'make_project','Provide a Square project object.');
 const raw=input as Record<string,unknown>;
 if(!Array.isArray(raw.layers)||raw.layers.length>32)throw new AppError(422,'make_project','A Square project has up to 32 layers.');
 const layers=[];
 for(const item of raw.layers){
  if(!item||typeof item!=='object'||Array.isArray(item))throw new AppError(422,'make_layer','Each layer must be an object.');
  const layer={...item} as Record<string,unknown>;
  if(typeof layer.src==='string'&&layer.src.startsWith('file:')){
   if(!['image','draw'].includes(String(layer.type)))throw new AppError(422,'make_image','Only image and drawing layers can use uploaded pixels.');
   const id=layer.src.slice(5);if(!/^[0-9a-f-]{36}$/i.test(id))throw new AppError(422,'make_image','Choose an owned image upload.');
   const file=await ownUpload(actor.userId,id);if(!file.ready||!file.mime.startsWith('image/'))throw new AppError(422,'make_image','Choose an owned image upload.');
   const {bytes}=await readUpload(actor,id);layer.src=`data:${file.mime};base64,${bytes.toString('base64')}`;
  }
  layers.push(layer);
 }
 const project=parseSquareProject({version:raw.version??1,color:raw.color??'#ffffff',layers});
 if(Buffer.byteLength(JSON.stringify(project))>MAX_SQUARE_BYTES)throw new AppError(422,'make_size','This Make project is too large.');
 return project;
}

async function render(project:SquareProject){return renderGate.run(async()=>{
 const bytes=await renderSquareNode(project,resolve(process.cwd(),'assets/square-fonts'));
 if(bytes.length>MAX_UPLOAD_BYTES)throw new AppError(422,'make_size','This image is too large to save.');return {bytes,sha256:sha256(bytes)};
});}

export async function makeOperation(name:string,d:Record<string,unknown>,actor:Actor,session?:ClientSession):Promise<unknown>{
 const userId=actor.userId,now=new Date().toISOString();
 if(name==='make.create'){
  if(await drafts().countDocuments({userId,expiresAt:{$gt:new Date()}},{session})>=20)throw new AppError(422,'make_draft_limit','Discard an old Make draft before creating another.');
  const row:MakeDraft={_id:randomUUID(),userId,project:d.project as SquareProject,revision:1,createdAt:now,updatedAt:now,expiresAt:expires()};
  await drafts().insertOne(row,{session});return output(row);
 }
 const id=String(d.draftId),row=await owned(userId,id,session);
 if(name==='make.get')return output(row,true);
 if(name==='make.render'){
  const {bytes,sha256}=await render(row.project);
  return {draftId:id,revision:row.revision,mime:'image/png',width:512,height:512,sha256,pngBase64:bytes.toString('base64')};
 }
 if(row.revision!==d.revision)throw new AppError(409,'make_changed','Read the current Make draft before changing it.');
 if(name==='make.edit'){
  const updated=await drafts().findOneAndUpdate({_id:id,userId,revision:row.revision,expiresAt:{$gt:new Date()}},{$set:{project:d.project as SquareProject,updatedAt:now,expiresAt:expires()},$inc:{revision:1}},{session,returnDocument:'after'});
  if(!updated)throw new AppError(409,'make_changed','Read the current Make draft before changing it.');return output(updated);
 }
 if(name==='make.discard'){
  const deleted=await drafts().deleteOne({_id:id,userId,revision:row.revision},{session});
  if(!deleted.deletedCount)throw new AppError(409,'make_changed','Read the current Make draft before discarding it.');return {discarded:true,draftId:id};
 }
 if(name==='make.publish'){
  const entry=await logOperation('log.get',{entryId:d.entryId},actor,session) as LogEntry;
  const own=entry.contributors.find(person=>person.userId===userId);
  if(entry.membership!=='member'||!own)throw new AppError(403,'log_member','Join the hangout before adding a Make image.');
  const visual=own.files.find(file=>!file.mime.startsWith('audio/'));
  if(visual&&visual.id!==d.replaceFileId)throw new AppError(409,'make_replace','Supply the exact current image ID to replace it.');
  if(!visual&&d.replaceFileId)throw new AppError(409,'make_replace','There is no current image to replace.');
  const fileId=String(d._makeFileId),voice=own.files.filter(file=>file.mime.startsWith('audio/')).map(file=>file.id);
  const saved=await logOperation('log.contribute',{entryId:d.entryId,revision:entry.revision,contribution:{note:own.note,fileIds:[fileId,...voice]}},actor,session) as LogEntry;
  const deleted=await drafts().deleteOne({_id:id,userId,revision:row.revision},{session});
  if(!deleted.deletedCount)throw new AppError(409,'make_changed','Read the current Make draft before publishing it.');
  return {draftId:id,imageFileId:fileId,entry:saved};
 }
 throw new AppError(404,'unknown_operation','Unknown Make operation.');
}

/** A publish stages only the approved render; the operation transaction attaches it. */
export async function stageMakePublish(d:Record<string,unknown>,actor:Actor){
 const row=await owned(actor.userId,String(d.draftId));
 if(row.revision!==d.revision)throw new AppError(409,'make_changed','Render the current Make draft before publishing it.');
 const {bytes,sha256}=await render(row.project);
 if(sha256!==d.renderSha256)throw new AppError(409,'make_render_changed','The image differs from the preview. Render the current draft again.');
 const staged=await prepareUpload({name:'Made image.png',bytes:bytes.length,sha256,purpose:'log_media'},actor);
 try{await acceptUpload(actor,staged.id,bytes);}catch(error){await deleteUpload(actor,staged.id).catch(()=>{});throw error;}
 return staged.id;
}
