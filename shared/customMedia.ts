import {z} from 'zod';
import {attachmentUrl} from './postLinks';
const short=z.string().max(1000).optional(),url=z.string().max(2048).optional();
const artist=z.object({name:short,url}).optional();
const location=z.object({name:short,geo:z.object({lat:z.number().min(-90).max(90).optional(),lng:z.number().min(-180).max(180).optional()}).optional()}).optional();
const metadata=z.record(z.string().max(80),z.union([z.string().max(2000),z.number(),z.boolean()])).optional();
const muse=z.object({spec:z.literal('MUSE'),version:z.literal(1).optional(),type:short,title:short,artist:short,album:short,audio:url,art:url,distributable:z.boolean().optional(),preferredLayout:z.enum(['any','slim','landscape','portrait','square']).optional(),url:z.object({audio:url,artist:url,album:url,art:url}).optional()});
const card=z.object({image:url,video:url,audio:url,mute:z.boolean().optional(),alt:short,caption:short,artist,location,metadata,tags:z.array(z.object({rx:z.coerce.number().min(0).max(1),ry:z.coerce.number().min(0).max(1),label:short,url})).max(40).optional()});
const cif=z.object({spec:z.literal('CIF'),version:z.literal(1),artist,location,audio:url,caption:short,autoplay:z.boolean().optional(),metadata,card:card.optional(),cards:z.array(card).max(10).optional()});
const pops=z.object({spec:z.literal('POPS'),version:z.literal(1).optional(),title:short,pageAudio:url,presentation:z.object({font:z.enum(['sans','serif','mono']).optional(),size:z.enum(['small','normal','large']).optional(),align:z.enum(['left','center','right']).optional()}).optional(),blocks:z.array(z.object({text:z.string().max(50000).optional(),image:url,video:url,audio:url,link:url,textlink:url,caption:short})).max(100)});
export const customDocumentSchema=z.discriminatedUnion('spec',[muse,cif,pops]);
export type CustomDocument=z.infer<typeof customDocumentSchema>;
export type MuseDocument=Extract<CustomDocument,{spec:'MUSE'}>;
export type CifDocument=Extract<CustomDocument,{spec:'CIF'}>;
export type PopsDocument=Extract<CustomDocument,{spec:'POPS'}>;
export function customMediaKind(value:string){try{return new URL(value).pathname.match(/\.(muse|pops|cif)(?:\.json)?$/i)?.[1].toUpperCase() as CustomDocument['spec']|undefined;}catch{return undefined;}}
export function parseCustomDocument(value:unknown,base:string):CustomDocument{
 const data=customDocumentSchema.parse(value);
 if(data.spec==='CIF'&&data.card&&data.cards)throw new Error('Choose card or cards, not both.');
 const resolve=(value:string|undefined)=>{if(!value)return undefined;try{return attachmentUrl(new URL(value,base).href);}catch{return undefined;}};
 const walk=(value:unknown,key=''):unknown=>{
  if(key==='metadata')return value;
  if(Array.isArray(value))return value.map(item=>walk(item,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([name,entry])=>[name,walk(entry,key==='url'?'outgoing':name)]));
  if(typeof value==='string'&&['audio','image','video','art','link','textlink','pageAudio','url','outgoing'].includes(key))return resolve(value);
  return value;
 };
 return customDocumentSchema.parse(walk(data));
}
