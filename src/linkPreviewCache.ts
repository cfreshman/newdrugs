import {operation} from './api';
import type {LinkPreview as Preview} from '../shared/links';
const cached=new Map<string,{preview:Preview;expires:number}>();
const requests=new Map<string,Promise<Preview>>();
export function loadLinkPreview(url:string){
 const entry=cached.get(url);if(entry&&entry.expires>Date.now())return Promise.resolve(entry.preview);
 if(requests.has(url))return requests.get(url)!;
 const request=operation<Preview>('links.preview',{url}).then(preview=>{if(cached.size>=200)cached.delete(cached.keys().next().value!);cached.set(url,{preview,expires:Date.now()+300000});return preview;}).finally(()=>requests.delete(url));requests.set(url,request);return request;
}
export const cachedLinkPreview=(url:string)=>cached.get(url)?.preview;
