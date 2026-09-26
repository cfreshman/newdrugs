import {customMediaKind,parseCustomDocument} from '../shared/customMedia';
import {providerEmbed} from '../shared/postLinks';
import { Parser } from 'htmlparser2';
import sharp from 'sharp';
import { Binary } from 'mongodb';
import { rows } from './db';
import { hash } from './auth';
import { AppError } from './errors';
import { fetchPublic, publicUrl } from './publicFetch';
import type { LinkPreview } from '../shared/links';

const clean = (value: string, max: number) => value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export function previewRaster(bytes: Buffer) {
  return bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) || bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' || /^GIF8[79]a$/.test(bytes.toString('ascii', 0, 6)) ||
    bytes.toString('ascii', 4, 8) === 'ftyp' && ['avif', 'avis'].includes(bytes.toString('ascii', 8, 12));
}
export function pageMetadata(html: string, finalUrl: string) {
  const meta = new Map<string, string>(); let title = '', inTitle = false;
  const parser = new Parser({
    onopentag(name, attributes) {
      if (name === 'body') { parser.pause(); return; }
      if (name === 'title') inTitle = true;
      if (name === 'meta') { const key = (attributes.property || attributes.name || '').toLowerCase(); if (!meta.has(key) && attributes.content) meta.set(key, attributes.content); }
    },
    ontext(text) { if (inTitle) title += text; },
    onclosetag(name) { if (name === 'title') inTitle = false; if (name === 'head') parser.pause(); },
  }, { decodeEntities: true });
  parser.end(html);
  let image: string | undefined;
  try { const raw = meta.get('og:image') || meta.get('og:image:url') || meta.get('twitter:image'); if (raw) image = publicUrl(new URL(raw, finalUrl).href).href; } catch { /* Text-only card. */ }
  const media=meta.get('og:video:secure_url')||meta.get('og:video');
  const embed=media&&new URL(finalUrl).hostname.endsWith('.bandcamp.com')?providerEmbed(media):null;
  return { ...(embed?.provider==='Bandcamp'?{embed}:{}),title: clean(meta.get('og:title') || meta.get('twitter:title') || title, 180), description: clean(meta.get('og:description') || meta.get('twitter:description') || meta.get('description') || '', 300), image };
}
interface CachedPreview { _id: string; preview: LinkPreview; image?: Binary; expiresAt: Date }
const cache = () => rows<CachedPreview>('linkPreviews');
const pending = new Map<string, Promise<LinkPreview>>();
export async function linkPreview(value: string, userId: string): Promise<LinkPreview> {
  let url: URL;
  try { url = publicUrl(value); } catch { throw new AppError(422, 'preview_url', 'Choose a public HTTP or HTTPS link.'); }
  const id = hash(`rich-v3:${url.href}`), existing = await cache().findOne({ _id: id, expiresAt: { $gt: new Date() } }, { projection: { image: 0 } });
  if (existing) return { ...existing.preview, url: value };
  if (pending.has(id)) return { ...await pending.get(id)!, url: value };
  const fallback: LinkPreview = { url: url.href, hostname: url.hostname, title: url.hostname, description: '',...(providerEmbed(url.href)?{embed:providerEmbed(url.href)!}:{}) };
  const minute = Math.floor(Date.now() / 60000);
  const rate = await rows<{ _id: string; count: number; expiresAt: Date }>('linkPreviewRates').findOneAndUpdate({ _id: `${userId}:${minute}` }, { $inc: { count: 1 }, $set: { expiresAt: new Date(Date.now() + 120000) } }, { upsert: true, returnDocument: 'after' });
  if (pending.has(id)) return { ...await pending.get(id)!, url: value };
  if (rate!.count > 40 || pending.size >= 6) throw new AppError(429, 'preview_busy', 'Link previews are busy. Try again shortly.');
  const job = (async () => {
    let preview = fallback, image: Buffer | undefined, success = false;
    const signal = AbortSignal.timeout(10000);
    try {
      const customKind=customMediaKind(url.href);
      const page=await fetchPublic(url.href,customKind?'manifest':'preview',signal);
      if(customKind){
        const custom=parseCustomDocument(JSON.parse(page.bytes.toString('utf8')),page.url);
        if(custom.spec!==customKind)throw new Error('Document type does not match its extension.');
        preview={...fallback,custom,title:custom.spec==='CIF'?custom.caption||'CIF':custom.title||custom.spec,description:custom.spec==='MUSE'?[custom.artist,custom.album].filter(Boolean).join(' · '):''};success=true;
      }else{

      let imageResponse:Awaited<ReturnType<typeof fetchPublic>>|undefined;
      if(page.mime.startsWith('image/')){preview={...fallback,kind:'image',title:decodeURIComponent(new URL(page.url).pathname.split('/').pop()||'Image')};imageResponse=page;success=true;}
      else{
        const metadata=pageMetadata(page.bytes.toString('utf8'),page.url);
        const embed=providerEmbed(page.url)||metadata.embed;
        preview={...fallback,title:metadata.title||fallback.title,description:metadata.description,...(embed?{embed}:{})};success=true;
        if(metadata.image)try{imageResponse=await fetchPublic(metadata.image,'image',signal);}catch{/* Keep text and players when artwork is unavailable. */}
      }
      if(imageResponse)try{
        if(!previewRaster(imageResponse.bytes))throw new Error('Unsupported image bytes.');
        image=await sharp(imageResponse.bytes,{limitInputPixels:20_000_000,animated:false}).rotate().resize(512,512,{fit:'inside',withoutEnlargement:true}).webp({quality:75}).toBuffer();
        if(image.length>200000)image=undefined;else preview.imageUrl=`/api/link-previews/${id}/image`;
      }catch{/* Metadata remains useful without artwork. */}
      }
    } catch { /* A link remains clickable when unfurling is unavailable. */ }
    // Platform cache, outside account storage. Bounded size plus TTL on Mongo.
    if (await cache().countDocuments({}, { limit: 2001 }) >= 2000) {
      const oldest = await cache().find({}, { projection: { _id: 1 } }).sort({ expiresAt: 1 }).limit(50).toArray();
      await cache().deleteMany({ _id: { $in: oldest.map(row => row._id) } });
    }
    await cache().replaceOne({ _id: id }, { preview, ...(image ? { image: new Binary(image) } : {}), expiresAt: new Date(Date.now() + (success ? 86400000 : 300000)) }, { upsert: true });
    return preview;
  })();
  pending.set(id, job);
  try { return { ...await job, url: value }; } finally { pending.delete(id); }
}
export async function previewImage(id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new AppError(404, 'not_found', 'Preview unavailable.');
  const cached = await cache().findOne({ _id: id, expiresAt: { $gt: new Date() } });
  if (!cached?.image) throw new AppError(404, 'not_found', 'Preview unavailable.');
  return Buffer.from(cached.image.buffer);
}

const textCache=new Map<string,{text:string;expires:number}>();
const textPending=new Map<string,Promise<string>>();
export async function linkText(value:string,userId:string){
 let url:string;try{url=publicUrl(value).href;}catch{throw new AppError(422,'preview_url','Choose a public HTTP or HTTPS link.');}
 const now=Date.now(),cached=textCache.get(url);
 if(cached&&cached.expires>now)return {url,text:cached.text};
 if(textPending.has(url))return {url,text:await textPending.get(url)!};
 const rate=await rows<{_id:string;count:number}>('linkPreviewRates').findOneAndUpdate({_id:`${userId}:${Math.floor(now/60000)}`},{$inc:{count:1},$set:{expiresAt:new Date(now+120000)}},{upsert:true,returnDocument:'after'});
 if(textPending.has(url))return {url,text:await textPending.get(url)!};
 if(rate!.count>40||textPending.size>=6)throw new AppError(429,'preview_busy','Link previews are busy. Try again shortly.');
 const work=fetchPublic(url,'text',AbortSignal.timeout(10000)).then(result=>{const text=result.bytes.toString('utf8').slice(0,50000);if(textCache.size>=200)textCache.delete(textCache.keys().next().value!);textCache.set(url,{text,expires:Date.now()+300000});return text;});
 textPending.set(url,work);try{return {url,text:await work};}finally{textPending.delete(url);}
}
