import {logImageUrl} from './logImageCache';
import type {LogEntry} from '../shared/log';
const entries=new Map<string,{entry:LogEntry;expires:number}>();
const key=(userId:string,entryId:string)=>`${userId}:${entryId}`;
export function cachedLogEntry(userId:string,entryId:string){const saved=entries.get(key(userId,entryId));if(!saved||saved.expires<Date.now())return null;return saved.entry;}
export function cacheLogEntry(userId:string,entry:LogEntry){entries.set(key(userId,entry.id),{entry,expires:Date.now()+60_000});while(entries.size>60)entries.delete(entries.keys().next().value!);}
export function clearLogEntries(userId?:string){for(const id of entries.keys())if(!userId||id.startsWith(`${userId}:`))entries.delete(id);}
export function preloadLogPhotos(entry:LogEntry){if(typeof Image==='undefined')return;for(const file of entry.contributors.flatMap(person=>person.files).filter(file=>file.mime.startsWith('image/')).slice(0,4)){const image=new Image();image.src=logImageUrl(file.url);}}
