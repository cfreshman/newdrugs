import {z} from 'zod';

export const WEBSITE_MAX_FILES=100;
export const WEBSITE_MAX_FILE_BYTES=512*1024;
export const WEBSITE_MAX_SOURCE_BYTES=2*1024*1024;
export const WEBSITE_MAX_PAGES=50;
export const websitePath=z.string().min(1).max(160).regex(/^(?:pages\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.html|styles\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.css|scripts\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.js|assets\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(?:svg|json|txt))$/);
export const websiteFile=z.strictObject({path:websitePath,content:z.string().max(WEBSITE_MAX_FILE_BYTES)});
export const websiteAssetPath=z.string().min(1).max(160).regex(/^assets\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.webp$/);
export const websiteAsset=z.strictObject({path:websiteAssetPath,fileId:z.uuid()});
export const websiteChange=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('create'),path:websitePath,content:z.string().max(WEBSITE_MAX_FILE_BYTES)}),
 z.strictObject({kind:z.literal('replace'),path:websitePath,oldText:z.string().min(1),newText:z.string()}),
 z.strictObject({kind:z.literal('write'),path:websitePath,content:z.string().max(WEBSITE_MAX_FILE_BYTES)}),
 z.strictObject({kind:z.literal('delete'),path:websitePath}),
 z.strictObject({kind:z.literal('rename'),path:websitePath,newPath:websitePath}),
]);
export const websiteSummary=z.object({code:z.string(),revision:z.number().int().positive(),files:z.array(z.object({path:websitePath,bytes:z.number().int().nonnegative()})),assets:z.array(websiteAsset),previewUrl:z.url(),stableUrl:z.url(),publicUrl:z.url().nullable(),publishedRevision:z.number().int().positive().nullable(),createdAt:z.string(),updatedAt:z.string()});
export type WebsiteFile=z.infer<typeof websiteFile>;
export type WebsiteAsset=z.infer<typeof websiteAsset>;
export type WebsiteChange=z.infer<typeof websiteChange>;

export function websiteHostLabel(handle:string){return handle.replaceAll('_','-');}
export function websiteCodeHost(code:string){return `u-${code}`;}
export function websiteDraftHost(token:string){return `draft-${token}`;}
export const reservedWebsiteLabels=new Set(['dev','www','api','admin','mail','smtp','ftp','mcp','sites','site','preview']);

export function validateWebsiteFiles(files:WebsiteFile[]){
 if(files.length>WEBSITE_MAX_FILES)throw Error('This website has too many files.');
 if(new Set(files.map(file=>file.path)).size!==files.length)throw Error('Each website file needs a different path.');
 if(!files.some(file=>file.path==='pages/index.html'))throw Error('A website needs pages/index.html.');
 if(files.filter(file=>file.path.startsWith('pages/')).length>WEBSITE_MAX_PAGES)throw Error('This website has too many pages.');
 let total=0;
 for(const file of files){websiteFile.parse(file);const bytes=new TextEncoder().encode(file.content).byteLength;if(bytes>WEBSITE_MAX_FILE_BYTES)throw Error(`${file.path} is too large.`);total+=bytes;}
 if(total>WEBSITE_MAX_SOURCE_BYTES)throw Error('This website has too much source content.');
 return total;
}

export function applyWebsiteChange(source:WebsiteFile[],change:WebsiteChange){
 const files=source.map(file=>({...file})),index=files.findIndex(file=>file.path===change.path);
 if(change.kind==='create'){
  if(index>=0)throw Error(`${change.path} already exists.`);
  files.push({path:change.path,content:change.content});
 }else if(change.kind==='write'){
  if(index<0)throw Error(`${change.path} does not exist.`);
  files[index].content=change.content;
 }else if(change.kind==='replace'){
  if(index<0)throw Error(`${change.path} does not exist.`);
  const content=files[index].content,offset=content.indexOf(change.oldText);
  if(offset<0)throw Error(`The selected text changed in ${change.path}. Read it again.`);
  if(content.indexOf(change.oldText,offset+change.oldText.length)>=0)throw Error(`The selected text is not unique in ${change.path}. Use more context.`);
  files[index].content=content.slice(0,offset)+change.newText+content.slice(offset+change.oldText.length);
 }else if(change.kind==='delete'){
  if(index<0)throw Error(`${change.path} does not exist.`);
  files.splice(index,1);
 }else{
  if(index<0)throw Error(`${change.path} does not exist.`);
  if(files.some(file=>file.path===change.newPath))throw Error(`${change.newPath} already exists.`);
  files[index].path=change.newPath;
 }
 files.sort((a,b)=>a.path.localeCompare(b.path));
 validateWebsiteFiles(files);
 return files;
}
