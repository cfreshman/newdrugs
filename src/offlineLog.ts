import type {Bootstrap} from '../shared/types';
import type {LogEntry,LogFields} from '../shared/log';
import {uploadFile} from './uploads';

const DB_NAME='newdrugs-offline-log',MAX_PAGES=24,MAX_PAGE_BYTES=4*1024*1024,MAX_PENDING=20,MAX_PENDING_BYTES=16*1024*1024;
const CACHED_READS=new Set(['log.preferences','log.birthday_get','log.birthdays','log.contacts','log.people','log.list','log.calendar','log.get']);
export interface PendingLogFile {name:string;mime:string;blob:Blob;prepareKey:string;uploadedId?:string}
export interface PendingLog {id:string;userId:string;userName:string;createdAt:string;key:string;entry:LogFields;note:string;files:PendingLogFile[];coverIndex?:number;people:{id:string;name:string;key:string}[];saved?:LogEntry;skipped?:string[];skippedIds?:string[];error?:string}
interface Page {_id:string;userId:string;name:string;input:string;data:unknown;bytes:number;accessedAt:number}
let opening:Promise<IDBDatabase>|undefined,account:string|null=null,queue:Promise<unknown>=Promise.resolve(),replaying:Promise<void>|undefined;
const run=<T>(work:()=>Promise<T>)=>{const next=queue.then(work);queue=next.catch(()=>{});return next;};
function database(){return opening??=(new Promise<IDBDatabase>((resolve,reject)=>{
 const request=indexedDB.open(DB_NAME,1),timer=setTimeout(()=>reject(Error('Local Log storage is unavailable.')),2000);
 request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('state');db.createObjectStore('pages',{keyPath:'_id'});db.createObjectStore('pending',{keyPath:'id'});};
 request.onsuccess=()=>{clearTimeout(timer);request.result.onversionchange=()=>{request.result.close();opening=undefined;};resolve(request.result);};
 request.onerror=()=>{clearTimeout(timer);reject(request.error);};request.onblocked=()=>{clearTimeout(timer);reject(Error('Local Log storage is blocked.'));};
 }));}
async function read<T>(store:'state'|'pages'|'pending',key?:string):Promise<T>{const db=await database();return new Promise((resolve,reject)=>{const request=key===undefined?db.transaction(store).objectStore(store).getAll():db.transaction(store).objectStore(store).get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function write(stores:('state'|'pages'|'pending')[],work:(tx:IDBTransaction)=>void){const db=await database();return new Promise<void>((resolve,reject)=>{const tx=db.transaction(stores,'readwrite');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('Local Log storage is full or unavailable.'));tx.onerror=()=>{};work(tx);});}
const notify=()=>window.dispatchEvent(new Event('newdrugs:offline-log'));
const pageKey=(userId:string,name:string,input:unknown)=>{const value=input&&typeof input==='object'&&!Array.isArray(input)?{...input as Record<string,unknown>}:input;if(name==='log.calendar'&&value&&typeof value==='object'&&!Array.isArray(value))delete (value as Record<string,unknown>).today;return `${userId}:${name}:${JSON.stringify(value)}`;};
export const offlineNetworkError=(error:unknown)=>error instanceof TypeError||error instanceof DOMException&&error.name==='NetworkError';

export function bindOfflineLog(userId:string){account=userId;return run(async()=>{
 await write(['state'],tx=>tx.objectStore('state').put(userId,'account'));
 notify();
 });}
export function unbindOfflineLog(){account=null;notify();}
export function clearOfflineLog(){return run(async()=>{account=null;await write(['state','pages','pending'],tx=>{tx.objectStore('state').clear();tx.objectStore('pages').clear();tx.objectStore('pending').clear();});notify();});}
export function saveOfflineBootstrap(data:Bootstrap){return run(async()=>{
 if(account!==data.user.id)return;
 const snapshot={...data,messages:[],run:null,conversationCursor:null};
 await write(['state'],tx=>tx.objectStore('state').put(snapshot,'bootstrap'));
 });}
export async function offlineBootstrap():Promise<Bootstrap|null>{try{
 const owner=await read<string|undefined>('state','account'),snapshot=await read<Bootstrap|undefined>('state','bootstrap');
 if(!owner||snapshot?.user.id!==owner)return null;account=owner;return snapshot;
 }catch{return null;}}
export function cacheOfflineRead(name:string,input:unknown,data:unknown){if(!CACHED_READS.has(name)||!account)return Promise.resolve();const owner=account;return run(async()=>{
 if(account!==owner)return;
 const inputKey=pageKey(owner,name,input),bytes=new TextEncoder().encode(JSON.stringify(data)).length;
 if(bytes>MAX_PAGE_BYTES/2)return;
 const pages=await read<Page[]>('pages'),existing=pages.filter(page=>page._id!==inputKey).sort((a,b)=>a.accessedAt-b.accessedAt),remove:string[]=[];
 let total=existing.reduce((sum,page)=>sum+page.bytes,0)+bytes;
 while(existing.length>=MAX_PAGES||total>MAX_PAGE_BYTES){const old=existing.shift();if(!old)break;remove.push(old._id);total-=old.bytes;}
 await write(['pages'],tx=>{for(const id of remove)tx.objectStore('pages').delete(id);tx.objectStore('pages').put({_id:inputKey,userId:owner,name,input:JSON.stringify(input),data,bytes,accessedAt:Date.now()} satisfies Page);});
 }).catch(()=>{});}
export async function cachedOfflineRead<T>(name:string,input:unknown):Promise<T|null>{if(!CACHED_READS.has(name)||!account)return null;try{const row=await read<Page|undefined>('pages',pageKey(account,name,input));return row?.userId===account?row.data as T:null;}catch{return null;}}

export function queueOfflineLog(value:Omit<PendingLog,'id'|'key'|'createdAt'|'userId'|'error'|'saved'|'skipped'>&{key?:string}){return run(async()=>{
 if(!account)throw Error('Sign in before saving a Log entry offline.');
 const pending=await read<PendingLog[]>('pending'),bytes=pending.reduce((sum,row)=>sum+row.files.reduce((n,file)=>n+file.blob.size,0),0)+value.files.reduce((sum,file)=>sum+file.blob.size,0);
 if(pending.length>=MAX_PENDING||bytes>MAX_PENDING_BYTES)throw Error('Local Log storage is full. Keep this draft open until you can reconnect.');
 const row:PendingLog={...value,id:`offline:${crypto.randomUUID()}`,userId:account,createdAt:new Date().toISOString(),key:value.key||crypto.randomUUID()};
 await write(['pending'],tx=>tx.objectStore('pending').put(row));notify();return row;
 });}
export async function pendingOfflineLogs(){try{if(!account)return [];const rows=await read<PendingLog[]>('pending');return rows.filter(row=>row.userId===account).sort((a,b)=>b.entry.date.localeCompare(a.entry.date)||b.createdAt.localeCompare(a.createdAt));}catch{return [];}}
async function updatePending(row:PendingLog){if(account!==row.userId)return;await write(['pending'],tx=>tx.objectStore('pending').put(row));notify();}

export function replayOfflineLogs(){
 if(replaying)return replaying;
 replaying=(async()=>{
  if(!account||!navigator.onLine)return;
  const owner=account;
  for(const row of (await pendingOfflineLogs()).reverse()){
   if(account!==owner)return;
   try{
    const ids:string[]=[];
    for(const file of row.files){
     if(!file.uploadedId){const uploaded=await uploadFile(new File([file.blob],file.name,{type:file.mime}),'log_media',undefined,undefined,file.prepareKey);if(account!==owner)return;file.uploadedId=uploaded.id;await updatePending(row);}
     ids.push(file.uploadedId);
    }
    const {operation}=await import('./api');
    if(account!==owner)return;
    if(!row.saved){
     const create=()=>operation<LogEntry>('log.create',{entry:{...row.entry,coverFileId:row.coverIndex===undefined?null:ids[row.coverIndex]},contribution:{note:row.note,fileIds:ids}},{key:row.key});
     try{row.saved=await create();}
     catch(error){
      const code=(error as {code?:string}).code;
      if(!row.files.length||!['not_found','file_not_ready','log_media','upload_expired'].includes(code||''))throw error;
      ids.length=0;
      for(const file of row.files){file.uploadedId=undefined;file.prepareKey=crypto.randomUUID();await updatePending(row);const uploaded=await uploadFile(new File([file.blob],file.name,{type:file.mime}),'log_media',undefined,undefined,file.prepareKey);file.uploadedId=uploaded.id;ids.push(uploaded.id);await updatePending(row);}
      row.saved=await create();
     }
     if(account!==owner)return;await updatePending(row);
    }
    for(const person of row.people){
     if(row.skippedIds?.includes(person.id))continue;
     if(row.saved.contributors.some(contributor=>contributor.userId===person.id))continue;
     try{row.saved=await operation<LogEntry>('log.add_person',{entryId:row.saved.id,revision:row.saved.revision,personId:person.id},{key:person.key,confirmed:true});await updatePending(row);}
     catch(error){if((error as {code?:string}).code==='log_changed'){row.saved=await operation<LogEntry>('log.get',{entryId:row.saved.id});await updatePending(row);row.saved=await operation<LogEntry>('log.add_person',{entryId:row.saved.id,revision:row.saved.revision,personId:person.id},{key:person.key,confirmed:true});await updatePending(row);continue;}
      if(!offlineNetworkError(error)&&(error as {status?:number}).status&&Number((error as {status?:number}).status)<500){row.skipped=[...(row.skipped||[]),person.name];row.skippedIds=[...(row.skippedIds||[]),person.id];await updatePending(row);continue;}throw error;}
    }
    await write(['pending'],tx=>tx.objectStore('pending').delete(row.id));notify();
    window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:['log','storage']}));
    if(row.skipped?.length)window.dispatchEvent(new CustomEvent('newdrugs:offline-log-warning',{detail:`Saved ${row.entry.title||'your Log entry'}, but could not add ${row.skipped.join(', ')}.`}));
   }catch(error){if(offlineNetworkError(error))return;row.error=error instanceof Error?error.message:'Could not sync this Log entry.';await updatePending(row);continue;}
  }
 })().finally(()=>{replaying=undefined;});return replaying;
}
export function startOfflineLogReplay(){
 const resume=()=>{if(document.visibilityState==='visible')void replayOfflineLogs();};
 window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);resume();
 return()=>{window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);};
}
