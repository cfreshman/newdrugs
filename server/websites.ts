import {createHash,randomBytes,randomUUID} from 'node:crypto';
import type {ClientSession} from 'mongodb';
import type {Actor} from './auth';
import {users} from './auth';
import {rows} from './db';
import {AppError,requireValue} from './errors';
import {config} from './config';
import {acceptUpload,deleteUpload,ownUpload,prepareUpload,retainUploads} from './uploads';
import {syncSourceAttachments} from './attachmentReferences';
import {getWebsiteIcon,searchWebsiteIcons,type WebsiteIconWeight} from './websiteIcons';
import {websiteSourceOperation} from './websiteSources';
import {inspectWebsiteProject} from './websiteInspect';
import {fetchPublic,publicUrl} from './publicFetch';
import {applyWebsiteChange,reservedWebsiteLabel,validateWebsiteFiles,websiteCodeHost,websiteDraftHost,websiteHostLabel,type WebsiteAsset,type WebsiteChange,type WebsiteFile} from '../shared/website';

export interface WebsiteDoc {_id:string;code:string;previewToken:string;revision:number;files:WebsiteFile[];assets:WebsiteAsset[];published?:{revision:number;files:WebsiteFile[];assets:WebsiteAsset[];publishedAt:string}|null;createdAt:string;updatedAt:string}
interface WebsiteRevision {_id:string;userId:string;revision:number;files:WebsiteFile[];assets:WebsiteAsset[];createdAt:string}
interface WebsiteCheckpoint {_id:string;userId:string;label:string;revision:number;files:WebsiteFile[];assets:WebsiteAsset[];createdAt:string}
const sites=()=>rows<WebsiteDoc>('websites'),revisions=()=>rows<WebsiteRevision>('websiteRevisions'),checkpoints=()=>rows<WebsiteCheckpoint>('websiteCheckpoints');
const siteDomain='druggie.org';
const localOrigin='http://localhost:7330';
const mediaExtensions:Record<string,string>={'image/webp':'webp','image/png':'png','image/jpeg':'jpg','image/gif':'gif','audio/mpeg':'mp3','audio/wav':'wav','audio/ogg':'ogg','audio/webm':'webm','audio/mp4':'m4a','video/webm':'webm','video/mp4':'mp4','application/pdf':'pdf','text/plain':'txt'};
export const websiteMediaExtension=(mime:string)=>mediaExtensions[mime]||null;

export function websitePublicUrl(handle:string,code:string){const label=websiteHostLabel(handle);return config.APP_ENV==='production'?`https://${reservedWebsiteLabel(label)?websiteCodeHost(code):label}.${siteDomain}/`:`${localOrigin}/api/website-published/${code}/`;}
export function websiteStableUrl(code:string){return config.APP_ENV==='production'?`https://${websiteCodeHost(code)}.${siteDomain}/`:`${localOrigin}/api/website-published/${code}/`;}
export function websitePreviewUrl(token:string){return config.APP_ENV==='production'?`https://${websiteDraftHost(token)}.${siteDomain}/`:`${localOrigin}/api/website-preview/${token}/`;}
function summary(site:WebsiteDoc,handle:string){const previewUrl=websitePreviewUrl(site.previewToken),publicUrl=site.published?websitePublicUrl(handle,site.code):null;return {code:site.code,revision:site.revision,files:site.files.map(file=>({path:file.path,bytes:Buffer.byteLength(file.content)})),assets:(site.assets||[]).map(asset=>({...asset,previewUrl:new URL(asset.path,previewUrl).href,publishedUrl:publicUrl&&site.published?.assets.some(item=>item.path===asset.path&&item.fileId===asset.fileId)?new URL(asset.path,publicUrl).href:null})),previewUrl,stableUrl:websiteStableUrl(site.code),publicUrl,publishedRevision:site.published?.revision||null,createdAt:site.createdAt,updatedAt:site.updatedAt};}
async function ownSite(userId:string,session?:ClientSession){return requireValue(await sites().findOne({_id:userId},{session}),'Create your website first.');}
async function saveDraft(site:WebsiteDoc,files:WebsiteFile[],assets:WebsiteAsset[],session?:ClientSession){
 const now=new Date().toISOString();await revisions().insertOne({_id:`${site._id}:${site.revision}`,userId:site._id,revision:site.revision,files:site.files,assets:site.assets||[],createdAt:now},{session});
 const result=await sites().updateOne({_id:site._id,revision:site.revision},{$set:{files,assets,updatedAt:now},$inc:{revision:1}},{session});
 if(!result.matchedCount)throw new AppError(409,'website_changed','This website changed. Read it again.');
 await revisions().deleteMany({userId:site._id,revision:{$lt:site.revision-9}},{session});
 return {...site,files,assets,revision:site.revision+1,updatedAt:now};
}
export async function websiteOperation(name:string,input:Record<string,unknown>,actor:Actor,session?:ClientSession){
 const user=requireValue(await users().findOne({_id:actor.userId},{session}));
 if(!user.handle)throw new AppError(403,'account_required','Save your account before making a website.');
 if(name==='website.icons.search')return searchWebsiteIcons(String(input.query),Number(input.limit));
 if(name==='website.icons.get')return getWebsiteIcon(String(input.slug),input.weight as WebsiteIconWeight);
 if(name.startsWith('website.source.'))return websiteSourceOperation(name,input,actor);
 if(name==='website.get'){const site=await sites().findOne({_id:actor.userId},{session});return {site:site?summary(site,user.handle):null};}
 if(name==='website.create'){
  if(await sites().findOne({_id:actor.userId},{session,projection:{_id:1}}))throw new AppError(409,'website_exists','Your website already exists. Edit its draft.');
  const files=input.files as WebsiteFile[];try{validateWebsiteFiles(files);}catch(error){throw new AppError(422,'website_files',String((error as Error).message));}
  const now=new Date().toISOString(),site:WebsiteDoc={_id:actor.userId,code:randomBytes(8).toString('hex'),previewToken:randomBytes(16).toString('hex'),revision:1,files,assets:[],createdAt:now,updatedAt:now};
  await sites().insertOne(site,{session});return summary(site,user.handle);
 }
 const site=await ownSite(actor.userId,session);
 if(name==='website.delete'){
  const saved=await checkpoints().find({userId:actor.userId},{session,projection:{_id:1}}).sort({_id:1}).limit(4).toArray();
  const expected=[...(input.checkpointIds as string[])].sort(),publishedRevision=site.published?.revision??null;
  if(site.code!==input.siteId||site.revision!==input.revision||publishedRevision!==input.publishedRevision||JSON.stringify(saved.map(row=>row._id))!==JSON.stringify(expected))throw new AppError(409,'website_changed','This website or its saved checkpoints changed. Read them again before deleting.');
  const removed=await sites().deleteOne({_id:actor.userId,code:site.code,revision:site.revision,...(publishedRevision===null?{published:null}:{'published.revision':publishedRevision})},{session});
  if(!removed.deletedCount)throw new AppError(409,'website_changed','This website changed. Read it again before deleting.');
  await revisions().deleteMany({userId:actor.userId},{session});
  await checkpoints().deleteMany({userId:actor.userId},{session});
  await users().updateOne({_id:actor.userId,websiteCode:site.code},{$unset:{websiteCode:''}},{session});
  await syncSourceAttachments('websites',actor.userId,session);
  return {deleted:true,siteId:site.code};
 }
 if(name==='website.inspect')return {revision:site.revision,...inspectWebsiteProject(site.files,site.assets||[])};
 if(name==='website.file'){const file=site.files.find(item=>item.path===input.path);if(!file)throw new AppError(404,'website_file','This website file is unavailable.');const offset=Number(input.offset),limit=Number(input.limit),content=file.content.slice(offset,offset+limit);return {path:file.path,content,revision:site.revision,offset,totalCharacters:file.content.length,nextOffset:offset+content.length<file.content.length?offset+content.length:null};}
 if(name==='website.search'){const query=String(input.query).toLowerCase(),limit=Number(input.limit),items:{path:string;offset:number;excerpt:string}[]=[];for(const file of site.files){const lower=file.content.toLowerCase();let offset=0;while(items.length<limit){const found=lower.indexOf(query,offset);if(found<0)break;items.push({path:file.path,offset:found,excerpt:file.content.slice(Math.max(0,found-90),Math.min(file.content.length,found+query.length+90))});offset=found+Math.max(1,query.length);}if(items.length>=limit)break;}return {revision:site.revision,items};}
 if(name==='website.revisions'){const history=await revisions().find({userId:actor.userId},{session,projection:{revision:1,createdAt:1}}).sort({revision:-1}).limit(10).toArray();return {currentRevision:site.revision,items:history.map(row=>({revision:row.revision,createdAt:row.createdAt}))};}
 if(name==='website.checkpoints'){const items=await checkpoints().find({userId:actor.userId},{session,projection:{label:1,revision:1,createdAt:1}}).sort({createdAt:-1,_id:-1}).limit(3).toArray();return {items:items.map(item=>({id:item._id,label:item.label,revision:item.revision,createdAt:item.createdAt}))};}
 if(name==='website.checkpoint.file'){const checkpoint=requireValue(await checkpoints().findOne({_id:String(input.checkpointId),userId:actor.userId},{session}),'This website checkpoint is unavailable.');const file=checkpoint.files.find(item=>item.path===input.path);if(!file)throw new AppError(404,'website_file','This checkpoint file is unavailable.');const offset=Number(input.offset),limit=Number(input.limit),content=file.content.slice(offset,offset+limit);return {path:file.path,content,revision:checkpoint.revision,offset,totalCharacters:file.content.length,nextOffset:offset+content.length<file.content.length?offset+content.length:null};}
 if(name==='website.checkpoint.create'){if(site.revision!==input.revision)throw new AppError(409,'website_changed','This website changed. Read it again.');if(await checkpoints().countDocuments({userId:actor.userId},{session})>=3)throw new AppError(422,'website_checkpoints','Delete a saved checkpoint before making another.');const checkpoint:WebsiteCheckpoint={_id:randomUUID(),userId:actor.userId,label:String(input.label),revision:site.revision,files:site.files,assets:site.assets||[],createdAt:new Date().toISOString()};await checkpoints().insertOne(checkpoint,{session});return {id:checkpoint._id,label:checkpoint.label,revision:checkpoint.revision,createdAt:checkpoint.createdAt};}
 if(name==='website.checkpoint.restore'){if(site.revision!==input.revision)throw new AppError(409,'website_changed','This website changed. Read it again.');const checkpoint=requireValue(await checkpoints().findOne({_id:String(input.checkpointId),userId:actor.userId},{session}),'This website checkpoint is unavailable.');for(const asset of checkpoint.assets){const file=await ownUpload(actor.userId,asset.fileId,session);if(!file.ready||!websiteMediaExtension(file.mime))throw new AppError(409,'website_asset_missing','Checkpoint media is no longer available.');}const updated=await saveDraft(site,checkpoint.files,checkpoint.assets,session);await syncSourceAttachments('websites',actor.userId,session);return summary(updated,user.handle);}
 if(name==='website.checkpoint.delete'){const removed=await checkpoints().deleteOne({_id:String(input.checkpointId),userId:actor.userId},{session});if(!removed.deletedCount)throw new AppError(404,'website_checkpoint','This website checkpoint is unavailable.');return {deleted:true,checkpointId:input.checkpointId};}
 if(name==='website.preview')return {previewUrl:websitePreviewUrl(site.previewToken),revision:site.revision};
 if(name==='website.patch'){
  if(site.revision!==input.revision)throw new AppError(409,'website_changed','This website changed. Read its current revision and file again.');
  let files:WebsiteFile[];try{files=applyWebsiteChange(site.files,input.change as WebsiteChange);}catch(error){throw new AppError(422,'website_patch',String((error as Error).message));}
  return summary(await saveDraft(site,files,site.assets||[],session),user.handle);
 }
 if(name==='website.asset.add'||name==='website.media.import'){
  if(site.revision!==input.revision)throw new AppError(409,'website_changed','This website changed. Read it again.');
  const fileId=String(input._websiteFileId||input.fileId),assets=site.assets||[];
  if(assets.some(asset=>asset.fileId===fileId))return summary(site,user.handle);
  if(assets.length>=20)throw new AppError(422,'website_asset','A website can have up to twenty uploaded media files.');
  const file=await ownUpload(actor.userId,fileId,session);
  const extension=websiteMediaExtension(file.mime);if(!file.ready||!extension)throw new AppError(422,'website_asset','Choose a ready owned upload with a supported media type.');
  const path=`assets/${fileId}.${extension}`;
  await retainUploads(actor.userId,[fileId],file.purpose,session);
  const updated=await saveDraft(site,site.files,[...assets,{path,fileId}],session);await syncSourceAttachments('websites',actor.userId,session);return summary(updated,user.handle);
 }
 if(name==='website.asset.remove'){
  if(site.revision!==input.revision)throw new AppError(409,'website_changed','This website changed. Read it again.');
  const assets=site.assets||[];if(!assets.some(asset=>asset.path===input.path))throw new AppError(404,'website_asset','This website image is unavailable.');
  const updated=await saveDraft(site,site.files,assets.filter(asset=>asset.path!==input.path),session);await syncSourceAttachments('websites',actor.userId,session);return summary(updated,user.handle);
 }
 if(name==='website.restore'){
  if(site.revision!==input.revision)throw new AppError(409,'website_changed','This website changed. Read it again.');
  const saved=requireValue(await revisions().findOne({_id:`${actor.userId}:${input.fromRevision}`},{session}),'This website revision is unavailable.');
  for(const asset of saved.assets||[]){const file=await ownUpload(actor.userId,asset.fileId,session);if(!file.ready||!websiteMediaExtension(file.mime))throw new AppError(409,'website_asset_missing','Saved media is no longer available. Restore the source files separately.');}
  const updated=await saveDraft(site,saved.files,saved.assets||[],session);await syncSourceAttachments('websites',actor.userId,session);return summary(updated,user.handle);
 }
 if(name==='website.publish'){
  if(site.revision!==input.revision)throw new AppError(409,'website_changed','This website changed. Review the latest draft before publishing.');
  for(const asset of site.assets||[]){const file=await ownUpload(actor.userId,asset.fileId,session);if(!file.ready||!websiteMediaExtension(file.mime))throw new AppError(409,'website_asset_missing','Website media is no longer available. Remove or replace it before publishing.');}
  const published={revision:site.revision,files:site.files,assets:site.assets||[],publishedAt:new Date().toISOString()};
  const updated=await sites().updateOne({_id:actor.userId,revision:site.revision},{$set:{published,updatedAt:published.publishedAt}},{session});
  if(!updated.matchedCount)throw new AppError(409,'website_changed','This website changed. Review the latest draft before publishing.');
  await users().updateOne({_id:actor.userId},{$set:{websiteCode:site.code}},{session});
  await syncSourceAttachments('websites',actor.userId,session);
  return summary({...site,published,updatedAt:published.publishedAt},user.handle);
 }
 if(name==='website.unpublish'){
  if(!site.published)throw new AppError(409,'website_unpublished','This website is already unpublished.');
  if(site.published.revision!==input.publishedRevision)throw new AppError(409,'website_changed','The published website changed. Read it again.');
  const updatedAt=new Date().toISOString(),result=await sites().updateOne({_id:actor.userId,'published.revision':site.published.revision},{$set:{published:null,updatedAt}},{session});
  if(!result.matchedCount)throw new AppError(409,'website_changed','The published website changed. Read it again.');
  await users().updateOne({_id:actor.userId},{$unset:{websiteCode:''}},{session});
  await syncSourceAttachments('websites',actor.userId,session);
  return summary({...site,published:null,updatedAt},user.handle);
 }
 throw new AppError(404,'unknown_operation','Unknown website operation.');
}
export async function websiteByCode(code:string){return sites().findOne({code});}
export async function websiteByPreviewToken(token:string){return sites().findOne({previewToken:token});}
export async function websitePreviewRevision(token:string){return sites().findOne({previewToken:token},{projection:{_id:1,revision:1}});}

/** Download one chosen public photo before the website write transaction. */
export async function stageWebsiteMediaImport(input:Record<string,unknown>,actor:Actor){
 const site=await ownSite(actor.userId);if(site.revision!==input.revision)throw new AppError(409,'website_changed','This website changed. Read it again before importing media.');
 if((site.assets||[]).length>=20)throw new AppError(422,'website_asset','A website can have up to twenty uploaded media files.');
 let url:URL;try{url=publicUrl(String(input.url));}catch{throw new AppError(422,'website_media_url','Choose a public HTTPS image URL.');}
 if(url.protocol!=='https:')throw new AppError(422,'website_media_url','Choose a public HTTPS image URL.');
 let fetched;try{fetched=await fetchPublic(url.href,'image',AbortSignal.timeout(12000));}catch{throw new AppError(422,'website_media_fetch','That public image could not be imported.');}
 const extension={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[fetched.mime];
 if(!extension)throw new AppError(422,'website_media_type','Import a JPEG, PNG or WebP image.');
 const staged=await prepareUpload({name:`${randomUUID()}.${extension}`,bytes:fetched.bytes.length,sha256:createHash('sha256').update(fetched.bytes).digest('hex'),purpose:'agent_input'},actor,undefined,{allowWebsiteImport:true});
 try{await acceptUpload(actor,staged.id,fetched.bytes);}catch(error){await deleteUpload(actor,staged.id).catch(()=>{});throw error;}
 return staged.id;
}
