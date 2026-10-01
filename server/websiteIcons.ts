import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import catalog from '../docs/phosphor-icons.json';
import {AppError} from './errors';

type Icon={name:string;slug:string;categories:string[];tags:string[]};
const icons=catalog.icons as Icon[],bySlug=new Map(icons.map(icon=>[icon.slug,icon]));
const require=createRequire(import.meta.url);
export const websiteIconWeights=['thin','light','regular','bold','fill','duotone'] as const;
export type WebsiteIconWeight=typeof websiteIconWeights[number];

export function searchWebsiteIcons(query:string,limit:number){
 const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
 const scored=icons.map(icon=>{const name=icon.name.toLowerCase(),slug=icon.slug.toLowerCase(),tags=icon.tags.join(' ').toLowerCase(),categories=icon.categories.join(' ').toLowerCase();
  const score=words.reduce((sum,word)=>sum+(slug===word||name===word?10:slug.startsWith(word)||name.startsWith(word)?6:slug.includes(word)||name.includes(word)?4:tags.includes(word)?2:categories.includes(word)?1:0),0);
  return {icon,score};}).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.icon.name.localeCompare(b.icon.name));
 return {family:'Phosphor Icons',version:catalog.catalogVersion,items:scored.slice(0,limit).map(({icon})=>icon)};
}

export async function getWebsiteIcon(slug:string,weight:WebsiteIconWeight){
 const icon=bySlug.get(slug);if(!icon)throw new AppError(404,'website_icon','That Phosphor icon is unavailable. Search the catalog for its exact slug.');
 const filename=`${slug}${weight==='regular'?'':`-${weight}`}.svg`;
 let svg:string;try{svg=await readFile(require.resolve(`@phosphor-icons/core/assets/${weight}/${filename}`),'utf8');}catch{throw new AppError(503,'website_icon','The Phosphor SVG asset is unavailable.');}
 if(!svg.startsWith('<svg')||svg.length>20000)throw new AppError(503,'website_icon','The Phosphor SVG asset is invalid.');
 return {name:icon.name,slug,weight,svg,license:'MIT',source:'Phosphor Icons'};
}
