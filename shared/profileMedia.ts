import {z} from 'zod';
import {attachmentUrl,providerEmbed} from './postLinks';

export function profileMediaUrl(value:string):string{
 const normalized=attachmentUrl(value),url=new URL(normalized);
 if(url.protocol!=='https:')throw Error('Use a secure media link.');
 const provider=providerEmbed(normalized)?.provider;
 if(['Spotify','Apple Music','SoundCloud','Bandcamp','YouTube'].includes(provider||''))return normalized;
 if(/(?:^|\.)bandcamp\.com$/.test(url.hostname)&&url.pathname.split('/').filter(Boolean).length>=2)return normalized;
 throw Error('Use a Spotify, Apple Music, SoundCloud, Bandcamp or YouTube link.');
}
export const profileMediaSchema=z.string().trim().max(2048).nullable().refine(value=>{if(value===null)return true;try{profileMediaUrl(value);return true;}catch{return false;}},'Use a supported media link.');
