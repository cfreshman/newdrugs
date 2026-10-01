import {createHash} from 'node:crypto';
import {Parser} from 'htmlparser2';
import type {Actor} from './auth';
import {rows} from './db';
import {AppError,requireValue} from './errors';
import {fetchPublic,publicUrl} from './publicFetch';

interface WebsiteSource {_id:string;userId:string;requestedUrl:string;url:string;kind:'html'|'css'|'javascript';content:string;bytes:number;sha256:string;title:string;headings:string[];links:{url:string;label:string}[];resourceUrls:string[];mediaUrls:string[];updatedAt:string}
const sources=()=>rows<WebsiteSource>('websiteSources');
const clean=(value:string,max:number)=>value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
function sourceUrl(value:string,base?:string){let url:URL;try{url=publicUrl(new URL(value,base).href);}catch{throw new AppError(422,'website_source_url','Choose a public HTTPS website URL.');}if(url.protocol!=='https:')throw new AppError(422,'website_source_url','Choose a public HTTPS website URL.');return url.href;}
function linked(value:string|undefined,base:string){if(!value||/^(?:data:|blob:|javascript:|#)/i.test(value))return null;try{return sourceUrl(value,base);}catch{return null;}}
function kindOf(mime:string,url:string):WebsiteSource['kind']{if(['text/html','application/xhtml+xml'].includes(mime))return 'html';if(mime==='text/css'||/\.css(?:$|\?)/i.test(url))return 'css';if(['text/javascript','application/javascript','application/x-javascript'].includes(mime)||/\.m?js(?:$|\?)/i.test(url))return 'javascript';throw new AppError(422,'website_source_type','This URL did not return HTML, CSS or JavaScript.');}
export function inspectWebsiteSource(content:string,base:string,kind:WebsiteSource['kind']){
 const links:{url:string;label:string}[]=[],resources=new Set<string>(),media=new Set<string>(),headings:string[]=[];let title='',capture='',linkIndex=-1;
 const add=(bucket:Set<string>,value?:string,max=100)=>{const url=linked(value,base);if(url&&bucket.size<max)bucket.add(url);};
 if(kind==='html'){
  const parser=new Parser({
   onopentag(name,attrs){if(name==='title')capture=name;if(/^h[1-3]$/.test(name)){capture=name;if(headings.length<24)headings.push('');}
    if(name==='a'&&attrs.href&&links.length<50){const url=linked(attrs.href,base);if(url&&new URL(url).origin===new URL(base).origin){links.push({url,label:''});linkIndex=links.length-1;}}
    if(name==='link'&&/stylesheet/i.test(attrs.rel||''))add(resources,attrs.href,50);
    if(name==='script')add(resources,attrs.src,50);
    if(['img','video','audio','source'].includes(name)){add(media,attrs.src);add(media,attrs.poster);for(const item of (attrs.srcset||'').split(','))add(media,item.trim().split(/\s+/)[0]);}
   },
   ontext(text){if(capture==='title')title+=text;if(/^h[1-3]$/.test(capture)&&headings.length<24)headings[headings.length-1]=(headings.at(-1)||'')+text;if(linkIndex>=0)links[linkIndex].label+=text;},
   onclosetag(name){if(name===capture)capture='';if(name==='a')linkIndex=-1;},
  },{decodeEntities:true});
  parser.end(content);
  if(headings.at(-1)==='')headings.pop();
 }else if(kind==='css'){
  for(const match of content.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi))add(media,match[1]);
  for(const match of content.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]/gi))add(resources,match[1],50);
 }else{
  for(const match of content.matchAll(/(?:https?:\/\/|\/)[A-Za-z0-9._~%/-]+\.(?:avif|gif|jpe?g|png|svg|webp|mp4|webm|woff2?)(?:\?[A-Za-z0-9_=&%-]+)?/gi))add(media,match[0]);
  for(const match of content.matchAll(/(?:https?:\/\/|\/)[A-Za-z0-9._~%/-]+\.(?:css|m?js)(?:\?[A-Za-z0-9_=&%-]+)?/gi))add(resources,match[0],50);
 }
 return {title:clean(title,200),headings:headings.map(value=>clean(value,160)).filter(Boolean).slice(0,24),links:links.map(link=>({...link,label:clean(link.label,160)})),resourceUrls:[...resources],mediaUrls:[...media]};
}
function summary(row:WebsiteSource,cached=false){return {sourceId:row._id,url:row.url,kind:row.kind,bytes:row.bytes,sha256:row.sha256,title:row.title,headings:row.headings,links:row.links,resourceUrls:row.resourceUrls,mediaUrls:row.mediaUrls,updatedAt:row.updatedAt,cached};}
export async function websiteSourceOperation(name:string,input:Record<string,unknown>,actor:Actor){
 if(name==='website.source.open'){
  const requestedUrl=sourceUrl(String(input.url)),id=createHash('sha256').update(`${actor.userId}:${requestedUrl}`).digest('hex'),existing=await sources().findOne({_id:id,userId:actor.userId});
  if(existing&&!input.refresh)return summary(existing,true);
  const minute=Math.floor(Date.now()/60000),rate=await rows<{_id:string;count:number;expiresAt:Date}>('websiteSourceRates').findOneAndUpdate({_id:`${actor.userId}:${minute}`},{$inc:{count:1},$set:{expiresAt:new Date(Date.now()+120000)}},{upsert:true,returnDocument:'after'});
  if((rate?.count||0)>20)throw new AppError(429,'website_source_rate','Try another website source shortly.');
  let fetched;try{fetched=await fetchPublic(requestedUrl,'site_source',AbortSignal.timeout(12000));}catch{throw new AppError(422,'website_source_fetch','This public website source could not be opened.');}
  let content:string;try{content=new TextDecoder('utf-8',{fatal:true}).decode(fetched.bytes);}catch{throw new AppError(422,'website_source_encoding','This website source is not UTF-8 text.');}
  const kind=kindOf(fetched.mime,fetched.url),row:WebsiteSource={_id:id,userId:actor.userId,requestedUrl,url:fetched.url,kind,content,bytes:fetched.bytes.length,sha256:createHash('sha256').update(fetched.bytes).digest('hex'),...inspectWebsiteSource(content,fetched.url,kind),updatedAt:new Date().toISOString()};
  await sources().replaceOne({_id:id,userId:actor.userId},row,{upsert:true});
  const older=await sources().find({userId:actor.userId}).sort({updatedAt:-1,_id:-1}).skip(20).limit(30).project({_id:1}).toArray();if(older.length)await sources().deleteMany({_id:{$in:older.map(item=>item._id)},userId:actor.userId});
  return summary(row);
 }
 if(name==='website.source.list'){const items=await sources().find({userId:actor.userId},{projection:{content:0}}).sort({updatedAt:-1,_id:-1}).limit(20).toArray();return {items:items.map(item=>summary(item))};}
 const row=requireValue(await sources().findOne({_id:String(input.sourceId),userId:actor.userId}),'This saved website source is unavailable.');
 if(name==='website.source.read'){const offset=Number(input.offset),limit=Number(input.limit),content=row.content.slice(offset,offset+limit);return {sourceId:row._id,url:row.url,kind:row.kind,content,offset,totalCharacters:row.content.length,nextOffset:offset+content.length<row.content.length?offset+content.length:null};}
 if(name==='website.source.search'){const query=String(input.query).toLowerCase(),limit=Number(input.limit),lower=row.content.toLowerCase(),items:{offset:number;excerpt:string}[]=[];let offset=0;while(items.length<limit){const found=lower.indexOf(query,offset);if(found<0)break;items.push({offset:found,excerpt:row.content.slice(Math.max(0,found-100),Math.min(row.content.length,found+query.length+100))});offset=found+Math.max(1,query.length);}return {sourceId:row._id,items};}
 throw new AppError(404,'unknown_operation','Unknown website source operation.');
}
