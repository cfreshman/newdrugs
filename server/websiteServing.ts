import type {Request,Response,NextFunction} from 'express';
import {users} from './auth';
import {config} from './config';
import {websiteAssetPath,websitePath,websiteHostLabel,reservedWebsiteLabel} from '../shared/website';
import {websiteByCode,websiteByPreviewToken,websitePreviewRevision,websiteMediaExtension,type WebsiteDoc} from './websites';
import {uploads} from './uploads';
import {sendMedia} from './mediaDelivery';

const mime=(path:string)=>path.endsWith('.html')?'text/html; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.svg')?'image/svg+xml':path.endsWith('.json')?'application/json; charset=utf-8':'text/plain; charset=utf-8';
const previewRevisionPath='/__newdrugs_revision';
function sourcePath(urlPath:string){
 let value:string;try{value=decodeURIComponent(urlPath).replace(/^\/+/, '');}catch{return null;}
 if(value.includes('\\')||value.includes('\0')||value.includes('//')||value.split('/').some(part=>part==='.'||part==='..'))return null;
 if(!value)return 'pages/index.html';
 if(websitePath.safeParse(value).success||websiteAssetPath.safeParse(value).success)return value;
 if(value.endsWith('.html')&&websitePath.safeParse(`pages/${value}`).success)return `pages/${value}`;
 if(value.endsWith('/'))value=value.slice(0,-1);
 for(const path of [`pages/${value}.html`,`pages/${value}/index.html`])if(websitePath.safeParse(path).success)return path;
 return null;
}
function rewritePreview(content:string,prefix:string,path:string){
 if(path.endsWith('.html'))return content
  .replace(/\b(href|src|action)=(['"])\/(?!\/)/gi,(_match,attr:string,quote:string)=>`${attr}=${quote}${prefix}/`)
  .replace(/\b(href|src|action)=(['"])(?:\.\.\/)+(styles|scripts|assets)\//gi,(_match,attr:string,quote:string,folder:string)=>`${attr}=${quote}${prefix}/${folder}/`);
 if(path.endsWith('.css'))return content.replace(/url\(\s*(['"]?)\/(?!\/)/gi,(_match,quote:string)=>`url(${quote}${prefix}/`);
 return content;
}
function livePreview(content:string,revision:number,prefix:string){
 const endpoint=JSON.stringify(`${prefix}${previewRevisionPath}`);
 const script=`<script data-newdrugs-preview-refresh>(function(){var revision=${revision},endpoint=${endpoint},pending=false;async function check(){if(pending||document.visibilityState==='hidden')return;pending=true;try{var response=await fetch(endpoint,{cache:'no-store',credentials:'omit'});if(response.status===404){location.reload();return}if(!response.ok)return;var current=await response.json();if(Number.isInteger(current.revision)&&current.revision!==revision)location.reload()}catch{}finally{pending=false}}setInterval(check,3000);document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')check()});window.addEventListener('focus',check)})();</script>`;
 return /<\/body\s*>/i.test(content)?content.replace(/<\/body\s*>/i,`${script}</body>`):`${content}${script}`;
}
async function sendPreviewRevision(res:Response,token:string){
 const site=await websitePreviewRevision(token),owner=site&&await users().findOne({_id:site._id,suspendedAt:null},{projection:{_id:1}});
 if(!site||!owner)return res.status(404).end();
 res.set({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin'});
 return res.send(JSON.stringify({revision:site.revision}));
}
async function sendSite(req:Request,res:Response,site:WebsiteDoc,preview:boolean,path:string,prefix=''){
 const source=preview?site.files:site.published?.files;
 if(!source)return res.status(404).end();
 const filePath=sourcePath(path),file=source.find(row=>row.path===filePath),asset=(preview?site.assets:site.published?.assets)?.find(row=>row.path===filePath);
 if(!file&&!asset)return res.status(404).end();
 res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':preview?'no-referrer':'strict-origin-when-cross-origin','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin',...(preview?{'X-Robots-Tag':'noindex, nofollow'}:{})});
 // User-authored sites share druggie.org's registrable domain. Give them opaque
 // origins so their scripts cannot set parent-domain cookies or reach app state.
 res.set('Content-Security-Policy',`sandbox allow-scripts allow-forms allow-popups allow-downloads; default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' https: data: blob:; connect-src 'self' https:${preview&&config.APP_ENV!=='production'?' http://localhost:7330':''}`);
 if(asset){const upload=await uploads().findOne({_id:asset.fileId,userId:site._id,ready:true,deletedAt:{$exists:false},moderatedAt:{$exists:false}});if(!upload||!websiteMediaExtension(upload.mime)||!asset.path.endsWith(`.${websiteMediaExtension(upload.mime)}`))return res.status(404).end();res.set('Content-Disposition','inline');await sendMedia(upload,req,res);return;}
 res.set('Content-Type',mime(file!.path));const content=prefix?rewritePreview(file!.content,prefix,file!.path):file!.content;
 return res.send(preview&&file!.path.endsWith('.html')?livePreview(content,site.revision,prefix):content);
}
function hostLabel(host:unknown){if(typeof host!=='string')return null;const match=/^([a-z0-9-]+)\.druggie\.org(?::443)?$/i.exec(host);return match?.[1].toLowerCase()||null;}

/** Mounted before the app router so website scripts never receive app routes or cookies. */
export async function websiteRequest(req:Request,res:Response,next:NextFunction){
 try{
  const rawHost=typeof req.headers.host==='string'?req.headers.host.toLowerCase().replace(/:443$/,''):'';
  const websiteDomainHost=config.APP_ENV==='production'&&rawHost.endsWith('.druggie.org')&&!['dev.druggie.org','www.druggie.org'].includes(rawHost);
  if(req.method!=='GET'&&req.method!=='HEAD'){
   if(websiteDomainHost)return res.status(405).end();
   return next();
  }
  const preview=/^\/api\/website-preview\/([a-f0-9]{32})(?:\/(.*))?$/i.exec(req.path);
  if(preview){if(`/${preview[2]||''}`===previewRevisionPath)return sendPreviewRevision(res,preview[1]);const site=await websiteByPreviewToken(preview[1]),owner=site&&await users().findOne({_id:site._id,suspendedAt:null},{projection:{_id:1}});return site&&owner?await sendSite(req,res,site,true,`/${preview[2]||''}`,`/api/website-preview/${preview[1]}`):res.status(404).end();}
  const published=/^\/api\/website-published\/([a-f0-9]{16})(?:\/(.*))?$/i.exec(req.path);
  if(published){const site=await websiteByCode(published[1]),owner=site&&await users().findOne({_id:site._id,suspendedAt:null});return site&&owner?await sendSite(req,res,site,false,`/${published[2]||''}`,`/api/website-published/${published[1]}`):res.status(404).end();}
  if(config.APP_ENV!=='production')return next();
  const label=hostLabel(req.headers.host);
  if(!websiteDomainHost)return next();
  if(!label||reservedWebsiteLabel(label)&&!/^u-[a-f0-9]{16}$/.test(label))return res.status(404).end();
  if(/^draft-[a-f0-9]{32}$/.test(label)&&req.path===previewRevisionPath)return sendPreviewRevision(res,label.slice(6));
  let site:WebsiteDoc|null=null,previewSite=false;
  if(/^draft-[a-f0-9]{32}$/.test(label)){site=await websiteByPreviewToken(label.slice(6));previewSite=true;}
  else if(/^u-[a-f0-9]{16}$/.test(label))site=await websiteByCode(label.slice(2));
  else if(/^[a-z0-9-]{3,24}$/.test(label)){
   const owner=await users().findOne({handle:label.replaceAll('-','_'),suspendedAt:null},{projection:{websiteCode:1}});
   if(owner?.websiteCode)site=await websiteByCode(owner.websiteCode);
  }
  if(!site)return res.status(404).end();
  const owner=await users().findOne({_id:site._id,suspendedAt:null},{projection:{handle:1,websiteCode:1}});
  if(!owner||!previewSite&&owner.websiteCode!==site.code)return res.status(404).end();
  if(!previewSite&&label!==`u-${site.code}`&&websiteHostLabel(owner.handle||'')!==label)return res.status(404).end();
  return await sendSite(req,res,site,previewSite,req.path);
 }catch(error){next(error);}
}
