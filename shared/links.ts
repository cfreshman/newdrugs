import {LinkifyIt} from 'linkify-it';
import tlds from 'tlds' with {type:'json'};
import type {CustomDocument} from './customMedia';
import type {ProviderEmbed} from './postLinks';
export interface TextLink { url: string; start: number; end: number }
export interface LinkPreview { url: string; hostname: string; title: string; description: string; imageUrl?: string; kind?:'image'; embed?:ProviderEmbed;custom?:CustomDocument }

const parser=new LinkifyIt({fuzzyLink:true,fuzzyIP:false,fuzzyEmail:false,urlAuth:true}).tlds(tlds).add('ftp:',null).add('mailto:',null);

/** Full public TLD list for bare domains; explicit URLs retain their original protocol. */
export function textLinks(text:string):TextLink[]{
 const links:TextLink[]=[];
 for(const match of parser.match(text)||[]){
  const url=match.schema===''?`https://${match.raw}`:match.schema==='//'?`https:${match.raw}`:match.url;
  try{const parsed=new URL(url);if(!['https:','http:'].includes(parsed.protocol)||parsed.username||parsed.password)continue;}catch{continue;}
  links.push({url,start:match.index,end:match.lastIndex});
 }
 return links;
}
/** Presentation only. Never use the compact label as a request or navigation target. */
export function compactUrlLabel(value:string){
 return /^(?:https?:\/\/|\/\/|www\.)\S+$/i.test(value)?value.replace(/^(?:https?:)?\/\//i,'').replace(/^www\./i,'').replace(/^([^/?#]+)\/(?=[?#]|$)/,'$1'):value;
}
