import {Parser} from 'htmlparser2';
import type {WebsiteAsset,WebsiteFile} from '../shared/website';

interface Issue {path:string;reference:string;kind:'missing'|'unsafe';message:string}
function pageRoute(path:string){const body=path.slice('pages/'.length,-'.html'.length);return body==='index'?'/':body.endsWith('/index')?`/${body.slice(0,-'/index'.length)}/`:`/${body}`;}
function references(content:string,kind:'html'|'css'){
 const result:string[]=[];
 if(kind==='html'){
  const parser=new Parser({onopentag(_name,attrs){for(const key of ['href','src','poster','action'])if(attrs[key])result.push(attrs[key]);if(attrs.srcset)for(const item of attrs.srcset.split(','))result.push(item.trim().split(/\s+/)[0]);if(attrs.style)result.push(...references(attrs.style,'css'));}},{decodeEntities:true});
  parser.end(content);
 }else{
  for(const match of content.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi))result.push(match[1]);
  for(const match of content.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]/gi))result.push(match[1]);
 }
 return result;
}

/** Bounded static checks. Browser behavior still needs a human preview. */
export function inspectWebsiteProject(files:WebsiteFile[],assets:WebsiteAsset[]){
 const paths=new Set([...files.map(file=>file.path),...assets.map(asset=>asset.path)]),routes=new Set(files.filter(file=>file.path.startsWith('pages/')).map(file=>pageRoute(file.path)));
 const issues:Issue[]=[],push=(item:Issue)=>{if(issues.length<50)issues.push(item);};
 for(const file of files){
  const kind=file.path.endsWith('.html')?'html':file.path.endsWith('.css')?'css':null;if(!kind)continue;
  const route=kind==='html'?pageRoute(file.path):`/${file.path}`,base=`https://site.invalid${route}`;
  for(const reference of references(file.content,kind)){
   if(!reference||reference.startsWith('#')||/^(?:mailto:|tel:|data:|blob:)/i.test(reference))continue;
   if(/^javascript:/i.test(reference)){push({path:file.path,reference,kind:'unsafe',message:'Remove the executable link.'});continue;}
   let target:URL;try{target=new URL(reference,base);}catch{push({path:file.path,reference,kind:'unsafe',message:'This URL is invalid.'});continue;}
   if(target.origin!=='https://site.invalid')continue;
   let decoded:string;try{decoded=decodeURIComponent(target.pathname).replace(/^\//,'');}catch{push({path:file.path,reference,kind:'unsafe',message:'This URL cannot be decoded.'});continue;}
   const trimmed=decoded.endsWith('/')?decoded.slice(0,-1):decoded;
   const candidates=[decoded,`pages/${decoded}`,`pages/${trimmed}.html`,`pages/${trimmed}/index.html`];
   if(target.pathname==='/'||candidates.some(candidate=>paths.has(candidate)))continue;
   push({path:file.path,reference,kind:'missing',message:'This internal page or resource does not exist in the draft.'});
  }
 }
 return {pages:[...routes].sort(),files:files.length,assets:assets.length,issues,issuesCapped:issues.length===50};
}
