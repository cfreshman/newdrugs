import {randomBytes} from 'node:crypto';
import type {ClientSession} from 'mongodb';
import type {Actor} from './auth';
import {users} from './auth';
import {rows} from './db';
import {AppError,requireValue} from './errors';
import {config} from './config';
import {ownUpload,retainUploads} from './uploads';
import {syncSourceAttachments} from './attachmentReferences';
import {applyWebsiteChange,reservedWebsiteLabel,validateWebsiteFiles,websiteCodeHost,websiteDraftHost,websiteHostLabel,type WebsiteAsset,type WebsiteChange,type WebsiteFile} from '../shared/website';

export interface WebsiteDoc {_id:string;code:string;previewToken:string;revision:number;files:WebsiteFile[];assets:WebsiteAsset[];published?:{revision:number;files:WebsiteFile[];assets:WebsiteAsset[];publishedAt:string}|null;createdAt:string;updatedAt:string}
interface WebsiteRevision {_id:string;userId:string;revision:number;files:WebsiteFile[];assets:WebsiteAsset[];createdAt:string}
const sites=()=>rows<WebsiteDoc>('websites'),revisions=()=>rows<WebsiteRevision>('websiteRevisions');
const siteDomain='druggie.org';
const localOrigin='http://localhost:7330';

export function websitePublicUrl(handle:string,code:string){const label=websiteHostLabel(handle);return config.APP_ENV==='production'?`https://${reservedWebsiteLabel(label)?websiteCodeHost(code):label}.${siteDomain}/`:`${localOrigin}/api/website-published/${code}/`;}
export function websiteStableUrl(code:string){return config.APP_ENV==='production'?`https://${websiteCodeHost(code)}.${siteDomain}/`:`${localOrigin}/api/website-published/${code}/`;}
export function websitePreviewUrl(token:string){return config.APP_ENV==='production'?`https://${websiteDraftHost(token)}.${siteDomain}/`:`${localOrigin}/api/website-preview/${token}/`;}
function summary(site:WebsiteDoc,handle:string){return {code:site.code,revision:site.revision,files:site.files.map(file=>({path:file.path,bytes:Buffer.byteLength(file.content)})),assets:site.assets||[],previewUrl:websitePreviewUrl(site.previewToken),stableUrl:websiteStableUrl(site.code),publicUrl:site.published?websitePublicUrl(handle,site.code):null,publishedRevision:site.published?.revision||null,createdAt:site.createdAt,updatedAt:site.updatedAt};}
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
 if(name==='website.get'){const site=await sites().findOne({_id:actor.userId},{session});return {site:site?summary(site,user.handle):null};}
 if(name==='website.create'){
  if(await sites().findOne({_id:actor.userId},{session,projection:{_id:1}}))throw new AppError(409,'website_exists','Your website already exists. Edit its draft.');
  const files=input.files as WebsiteFile[];try{validateWebsiteFiles(files);}catch(error){throw new AppError(422,'website_files',String((error as Error).message));}
  const now=new Date().toISOString(),site:WebsiteDoc={_id:actor.userId,code:randomBytes(8).toString('hex'),previewToken:randomBytes(16).toString('hex'),revision:1,files,assets:[],createdAt:now,updatedAt:now};
  await sites().insertOne(site,{session});return summary(site,user.handle);
 }
 const site=await ownSite(actor.userId,session);
 if(name==='website.file'){const file=site.files.find(item=>item.path===input.path);if(!file)throw new AppError(404,'website_file','This website file is unavailable.');const offset=Number(input.offset),limit=Number(input.limit),content=file.content.slice(offset,offset+limit);return {path:file.path,content,revision:site.revision,offset,totalCharacters:file.content.length,nextOffset:offset+content.length<file.content.length?offset+content.length:null};}
 if(name==='website.search'){const query=String(input.query).toLowerCase(),limit=Number(input.limit),items:{path:string;offset:number;excerpt:string}[]=[];for(const file of site.files){const lower=file.content.toLowerCase();let offset=0;while(items.length<limit){const found=lower.indexOf(query,offset);if(found<0)break;items.push({path:file.path,offset:found,excerpt:file.content.slice(Math.max(0,found-90),Math.min(file.content.length,found+query.length+90))});offset=found+Math.max(1,query.length);}if(items.length>=limit)break;}return {revision:site.revision,items};}
 if(name==='website.revisions'){const history=await revisions().find({userId:actor.userId},{session,projection:{revision:1,createdAt:1}}).sort({revision:-1}).limit(10).toArray();return {currentRevision:site.revision,items:history.map(row=>({revision:row.revision,createdAt:row.createdAt}))};}
 if(name==='website.preview')return {previewUrl:websitePreviewUrl(site.previewToken),revision:site.revision};
 if(name==='website.patch'){
  if(site.revision!==input.revision)throw new AppError(409,'website_changed','This website changed. Read its current revision and file again.');
  let files:WebsiteFile[];try{files=applyWebsiteChange(site.files,input.change as WebsiteChange);}catch(error){throw new AppError(422,'website_patch',String((error as Error).message));}
  return summary(await saveDraft(site,files,site.assets||[],session),user.handle);
 }
 if(name==='website.asset.add'){
  if(site.revision!==input.revision)throw new AppError(409,'website_changed','This website changed. Read it again.');
  const path=String(input.path),fileId=String(input.fileId),assets=site.assets||[];
  if(assets.length>=20||assets.some(asset=>asset.path===path)||site.files.some(file=>file.path===path))throw new AppError(422,'website_asset','Choose an unused image path; a site can have up to twenty uploaded images.');
  const file=await ownUpload(actor.userId,fileId,session);
  if(!file.ready||file.purpose!=='agent_input'||file.mime!=='image/webp'||file.logEntryId)throw new AppError(422,'website_asset','Choose a ready uploaded image that does not belong to a hangout.');
  await retainUploads(actor.userId,[fileId],'agent_input',session);
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
  for(const asset of saved.assets||[]){const file=await ownUpload(actor.userId,asset.fileId,session);if(!file.ready||file.mime!=='image/webp')throw new AppError(409,'website_asset_missing','A saved image is no longer available. Restore the source files separately.');}
  const updated=await saveDraft(site,saved.files,saved.assets||[],session);await syncSourceAttachments('websites',actor.userId,session);return summary(updated,user.handle);
 }
 if(name==='website.publish'){
  if(site.revision!==input.revision)throw new AppError(409,'website_changed','This website changed. Review the latest draft before publishing.');
  for(const asset of site.assets||[]){const file=await ownUpload(actor.userId,asset.fileId,session);if(!file.ready||file.mime!=='image/webp')throw new AppError(409,'website_asset_missing','A website image is no longer available. Remove or replace it before publishing.');}
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
