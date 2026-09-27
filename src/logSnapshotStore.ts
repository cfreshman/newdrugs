import {logEntrySchema,type LogEntry} from '../shared/log';
export interface LogSnapshot {key:string;userId:string;entry:LogEntry;storedAt:number;accessedAt:number;bytes:number}
export const LOG_SNAPSHOT_LIMITS={items:200,bytes:4*1024*1024,age:7*86400000,itemBytes:256*1024};
/** Presentation snapshots only. Every detail opening still fetches log.get. */
export class LogSnapshotStore {
 private connection?:Promise<IDBDatabase>;private queue:Promise<unknown>=Promise.resolve();
 constructor(private options:{factory?:IDBFactory;now?:()=>number;limits?:Partial<typeof LOG_SNAPSHOT_LIMITS>}={}){}
 private now(){return this.options.now?.()??Date.now();}
 private get limits(){return {...LOG_SNAPSHOT_LIMITS,...this.options.limits};}
 private run<T>(work:()=>Promise<T>){const next=this.queue.then(work);this.queue=next.catch(()=>{});return next;}
 private open(){return this.connection??=(new Promise<IDBDatabase>((resolve,reject)=>{
  const factory=this.options.factory||(typeof indexedDB!=='undefined'?indexedDB:undefined);if(!factory){reject(Error('Local storage unavailable'));return;}
  const request=factory.open('newdrugs-log-details',1),timer=setTimeout(()=>reject(Error('Local storage unavailable')),1500);
  request.onupgradeneeded=()=>{request.result.createObjectStore('entries',{keyPath:'key'});request.result.createObjectStore('state');};
  request.onerror=()=>{clearTimeout(timer);reject(request.error);};request.onblocked=()=>{clearTimeout(timer);reject(Error('Local storage blocked'));};
  request.onsuccess=()=>{clearTimeout(timer);const db=request.result;db.onversionchange=()=>{db.close();this.connection=undefined;};resolve(db);};
 }));}
 private async read<T>(store:string,key?:string):Promise<T>{const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction(store),request=key===undefined?tx.objectStore(store).getAll():tx.objectStore(store).get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
 private async write(work:(tx:IDBTransaction)=>void){const db=await this.open();return new Promise<void>((resolve,reject)=>{const tx=db.transaction(['entries','state'],'readwrite');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('Local storage failed'));tx.onerror=()=>{};work(tx);});}
 bind(userId:string|null){return this.run(async()=>{
  const previous=await this.read<string|undefined>('state','account');
  if(previous!==userId){await this.write(tx=>{tx.objectStore('entries').clear();if(userId)tx.objectStore('state').put(userId,'account');else tx.objectStore('state').delete('account');});return [] as LogSnapshot[];}
  const all=await this.read<LogSnapshot[]>('entries'),valid=all.filter(row=>row.userId===userId&&this.now()-row.storedAt<=this.limits.age&&logEntrySchema.safeParse(row.entry).success);
  if(valid.length!==all.length){const keep=new Set(valid.map(row=>row.key));await this.write(tx=>{for(const row of all)if(!keep.has(row.key))tx.objectStore('entries').delete(row.key);});}return valid;
 }).catch(()=>[] as LogSnapshot[]);}
 get(userId:string,entryId:string){return this.run(async()=>{
  if(await this.read<string>('state','account')!==userId)return null;
  const row=await this.read<LogSnapshot|undefined>('entries',`${userId}:${entryId}`);if(!row)return null;
  if(this.now()-row.storedAt>this.limits.age||!logEntrySchema.safeParse(row.entry).success){await this.write(tx=>tx.objectStore('entries').delete(row.key));return null;}
  row.accessedAt=this.now();await this.write(tx=>tx.objectStore('entries').put(row));return row;
 }).catch(()=>null);}
 put(row:LogSnapshot){return this.run(async()=>{
  if(await this.read<string>('state','account')!==row.userId||row.bytes>this.limits.itemBytes||row.bytes>this.limits.bytes)return;
  const all=await this.read<LogSnapshot[]>('entries'),prior=all.find(item=>item.key===row.key);
  if(prior&&(prior.entry.revision>row.entry.revision||prior.storedAt>row.storedAt))return;
  const remaining=all.filter(item=>item.key!==row.key&&this.now()-item.storedAt<=this.limits.age).sort((a,b)=>a.accessedAt-b.accessedAt),discard=all.filter(item=>this.now()-item.storedAt>this.limits.age).map(item=>item.key);let bytes=remaining.reduce((sum,item)=>sum+item.bytes,0)+row.bytes;
  while(remaining.length>=this.limits.items||bytes>this.limits.bytes){const old=remaining.shift();if(!old)break;discard.push(old.key);bytes-=old.bytes;}
  const save=()=>this.write(tx=>{for(const key of discard)tx.objectStore('entries').delete(key);tx.objectStore('entries').put(row);});
  try{await save();}catch(error){if((error as DOMException).name!=='QuotaExceededError')throw error;await this.write(tx=>{for(const old of remaining.slice(0,Math.ceil(remaining.length/2)))tx.objectStore('entries').delete(old.key);});await save();}
 }).catch(()=>{});}
 remove(userId:string,entryId:string){return this.run(()=>this.write(tx=>tx.objectStore('entries').delete(`${userId}:${entryId}`))).catch(()=>{});}
 clear(userId?:string){return this.run(async()=>{if(!userId||await this.read<string>('state','account')===userId)await this.write(tx=>tx.objectStore('entries').clear());}).catch(()=>{});}
}
