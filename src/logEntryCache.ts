import {logImageUrl} from './logImageCache';
import type {LogEntry} from '../shared/log';
import {LogSnapshotStore,LOG_SNAPSHOT_LIMITS,type LogSnapshot} from './logSnapshotStore';
const entries=new Map<string,LogSnapshot>(),store=new LogSnapshotStore();
let account:string|null|undefined,generation=0;
const key=(userId:string,entryId:string)=>`${userId}:${entryId}`;
const complete=(entry:LogEntry)=>!entry.contributors.some(person=>person.noteTruncated);
function remember(snapshot:LogSnapshot){
 const prior=entries.get(snapshot.key);
 if(prior&&(prior.entry.revision>snapshot.entry.revision||prior.entry.revision===snapshot.entry.revision&&complete(prior.entry)&&!complete(snapshot.entry)))return false;
 if(snapshot.bytes>LOG_SNAPSHOT_LIMITS.itemBytes)return false;
 entries.delete(snapshot.key);entries.set(snapshot.key,snapshot);
 let bytes=[...entries.values()].reduce((sum,row)=>sum+row.bytes,0);
 for(const [id,row] of entries){if(entries.size<=LOG_SNAPSHOT_LIMITS.items&&bytes<=LOG_SNAPSHOT_LIMITS.bytes)break;entries.delete(id);bytes-=row.bytes;}
 return true;
}
export function bindLogEntryCache(userId:string|null){
 if(account===userId)return;account=userId;generation++;entries.clear();const ticket=generation;
 void store.bind(userId).then(rows=>{if(ticket!==generation||account!==userId)return;for(const row of rows)if(!entries.has(row.key))remember(row);});
}
export function logCacheScope(){return {userId:account,generation};}
export function cachedLogEntry(userId:string,entryId:string){
 const id=key(userId,entryId),saved=entries.get(id);if(!saved)return null;
 if(Date.now()-saved.storedAt>LOG_SNAPSHOT_LIMITS.age){entries.delete(id);return null;}
 saved.accessedAt=Date.now();entries.delete(id);entries.set(id,saved);return saved.entry;
}
export async function readCachedLogEntry(userId:string,entryId:string){
 const memory=cachedLogEntry(userId,entryId);if(memory)return memory;
 const ticket=generation,row=await store.get(userId,entryId);
 if(!row||ticket!==generation||account!==userId)return null;
 if(!entries.has(row.key))remember(row);return cachedLogEntry(userId,entryId);
}
export function cacheLogEntry(userId:string,entry:LogEntry,{persist=true}={}){
 const now=Date.now(),row={key:key(userId,entry.id),userId,entry,storedAt:now,accessedAt:now,bytes:new TextEncoder().encode(JSON.stringify(entry)).length};
 if(remember(row)&&persist&&complete(entry)&&account===userId)void store.put(row);
}
/** Use the already displayed calendar/list record as the first frame. */
export function primeLogEntry(entry:LogEntry){if(account)cacheLogEntry(account,entry,{persist:false});}
export function forgetLogEntry(userId:string,entryId:string){generation++;entries.delete(key(userId,entryId));void store.remove(userId,entryId);}
export function clearLogEntries(userId?:string){generation++;for(const id of entries.keys())if(!userId||id.startsWith(`${userId}:`))entries.delete(id);return store.clear(userId);}
export async function clearLogEntryAccount(){generation++;account=null;entries.clear();await store.bind(null);}
export function updateLogEntryCache(scope:ReturnType<typeof logCacheScope>,name:string,input:unknown,result:unknown){
 if(!scope.userId||scope.userId!==account||scope.generation!==generation)return;
 const request=input as {entryId?:string;accept?:boolean},value=result as any;
 if(['log.leave','log.delete'].includes(name)||name==='log.respond'&&request.accept===false){if(request.entryId)forgetLogEntry(scope.userId,request.entryId);return;}
 if(['files.delete','people.block'].includes(name)){void clearLogEntries(scope.userId);return;}
 if(!name.startsWith('log.')||['log.list','log.export'].includes(name))return;
 for(const item of [value,value?.previous,value?.next])if(item?.id&&Array.isArray(item.contributors))cacheLogEntry(scope.userId,item);
}
export function preloadLogPhotos(entry:LogEntry){if(typeof Image==='undefined')return;for(const file of entry.contributors.flatMap(person=>person.files).filter(file=>file.mime.startsWith('image/')).slice(0,4)){const image=new Image();image.src=logImageUrl(file.url);}}

export function rejectLogEntryCache(scope:ReturnType<typeof logCacheScope>,name:string,input:unknown,status:number){
 if(!scope.userId||scope.userId!==account||scope.generation!==generation||!['log.get','log.neighbors'].includes(name)||![401,403,404,410].includes(status))return;
 const entryId=(input as {entryId?:string}).entryId;if(entryId)forgetLogEntry(scope.userId,entryId);
}
