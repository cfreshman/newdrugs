import {clearLogEntryAccount,logCacheScope,updateLogEntryCache,rejectLogEntryCache} from './logEntryCache';
import {clearLogImageCache,updateLogImageCache} from './logImageCache';
import {cacheOfflineRead,cachedOfflineRead,clearOfflineLog,offlineNetworkError} from './offlineLog';
export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number) { super(message); }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.error?.message || 'Could not connect. Please try again.', body.error?.code || 'unknown', response.status);
  if(path==='/account/logout')await Promise.all([clearLogImageCache(),clearLogEntryAccount(),clearOfflineLog().catch(()=>{})]);
  return body as T;
}
export const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body || {}) });
export async function uploadReportAudio(reportId:string,body:Blob){
 const response=await fetch(`/api/reports/${encodeURIComponent(reportId)}/audio`,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream'},body});
 const value=await response.json();
 if(!response.ok)throw new ApiError(value.error?.message||'Could not attach Talk audio.',value.error?.code||'unknown',response.status);
 return value as {attached:true;durationSeconds:number};
}
type OperationOptions={confirmed?:boolean;key?:string;signal?:AbortSignal;dedupe?:boolean};
type ReadFlight={promise:Promise<unknown>;controller:AbortController;subscribers:number};
const readFlights=new Map<string,ReadFlight>();
function abortError(signal?:AbortSignal){return signal?.reason||new DOMException('The request was cancelled.','AbortError');}
function shareRead<T>(key:string,request:(signal:AbortSignal)=>Promise<T>,signal?:AbortSignal):Promise<T>{
 if(signal?.aborted)return Promise.reject(abortError(signal));
 let flight=readFlights.get(key);
 if(!flight){
  const controller=new AbortController();flight={controller,subscribers:0,promise:request(controller.signal)};
  readFlights.set(key,flight);
  const current=flight;void current.promise.then(()=>{if(readFlights.get(key)===current)readFlights.delete(key);},()=>{if(readFlights.get(key)===current)readFlights.delete(key);});
 }
 const current=flight;current.subscribers++;
 return new Promise<T>((resolve,reject)=>{
  let finished=false;
  const release=(aborted:boolean)=>{if(finished)return false;finished=true;signal?.removeEventListener('abort',onAbort);current.subscribers--;if(aborted&&!current.subscribers){if(readFlights.get(key)===current)readFlights.delete(key);current.controller.abort();}return true;};
  const onAbort=()=>{if(release(true))reject(abortError(signal));};
  signal?.addEventListener('abort',onAbort,{once:true});
  if(signal?.aborted){onAbort();return;}
  void current.promise.then(value=>{if(release(false))resolve(value as T);},error=>{if(release(false))reject(error);});
 });
}
export function operation<T>(name: string, input: unknown = {}, options: OperationOptions = {}):Promise<T> {
 if(options.dedupe&&!options.key&&!options.confirmed){
  const scope=logCacheScope();
  return shareRead(`${scope.userId||'anonymous'}:${scope.generation}:${name}:${JSON.stringify(input)}`,signal=>performOperation<T>(name,input,{...options,signal}),options.signal);
 }
 return performOperation<T>(name,input,options);
}
async function performOperation<T>(name:string,input:unknown,options:OperationOptions):Promise<T>{
  const cacheScope=logCacheScope();
  const result = await api<{ data: T }>(`/operations/${name}`, { method: 'POST', body: JSON.stringify(input), signal: options.signal, headers: { 'Idempotency-Key': options.key || crypto.randomUUID(), ...(options.confirmed ? { 'X-NewDrugs-Confirmed': 'true' } : {}) } }).catch(async error=>{
    rejectLogEntryCache(cacheScope,name,input,error instanceof ApiError?error.status:0);
    if(offlineNetworkError(error)){const cached=await cachedOfflineRead<T>(name,input);if(cached!==null)return {data:cached};}
    throw error;
  });
  updateLogImageCache(name,input,result.data);
  updateLogEntryCache(cacheScope,name,input,result.data);
  await cacheOfflineRead(name,input,result.data);
  return result.data;
}
export const money = (nanos: number, detail = false) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: detail ? 4 : 2, maximumFractionDigits: detail ? 6 : 2 }).format(nanos / 1e9);
export const balanceLabel = (nanos: number) => money((Math.ceil(nanos / 10_000_000) || 0) * 10_000_000);
export const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
