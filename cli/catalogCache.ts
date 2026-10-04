import {createHash,randomUUID} from 'node:crypto';
import {dirname,join} from 'node:path';
import {mkdir,lstat,readFile,rename,unlink,writeFile} from 'node:fs/promises';
import type {ConfigStore,Login} from './config';

export interface CachedOperation {name:string;kind:'read'|'write';version:string;description:string;inputSchema:Record<string,unknown>}
const MAX_ENTRY_BYTES=256*1024;
const privatePath=async(path:string,directory=false)=>{
 const info=await lstat(path);
 return !info.isSymbolicLink()&&(directory?info.isDirectory():info.isFile())&&(!process.getuid||info.uid===process.getuid())&&(process.platform==='win32'||(info.mode&0o077)===0);
};

/** Advisory operation metadata only. Every invocation is fenced and authorized live. */
export class CatalogCache {
 private readonly directory:string;
 private readonly key:string;
 constructor(store:ConfigStore,login:Login,profile:string){
  this.directory=join(dirname(store.file),'contracts');
  this.key=createHash('sha256').update(JSON.stringify([1,profile,login.url,login.token])).digest('hex');
 }
 private file(name:string){return join(this.directory,createHash('sha256').update(`${this.key}:${name}`).digest('hex')+'.json');}
 private valid(value:unknown,name:string):CachedOperation|undefined{
  if(!value||typeof value!=='object'||Array.isArray(value))return;
  const entry=value as {key?:unknown;operation?:unknown},op=entry.operation;
  if(entry.key!==this.key||!op||typeof op!=='object'||Array.isArray(op))return;
  const candidate=op as CachedOperation;
  if(candidate.name!==name||!['read','write'].includes(candidate.kind)||!/^op1:[a-f0-9]{64}$/.test(candidate.version)||typeof candidate.description!=='string'||!candidate.inputSchema||typeof candidate.inputSchema!=='object'||Array.isArray(candidate.inputSchema))return;
  return candidate;
 }
 async get(name:string):Promise<CachedOperation|undefined>{
  const file=this.file(name);
  try{if(!await privatePath(this.directory,true)||!await privatePath(file))return;
   const raw=await readFile(file);if(raw.length>MAX_ENTRY_BYTES)return;
   return this.valid(JSON.parse(raw.toString('utf8')),name);
  }catch{return;}
 }
 async put(operation:CachedOperation){
  if(!this.valid({key:this.key,operation},operation.name))return;
  const body=JSON.stringify({key:this.key,operation});if(Buffer.byteLength(body)>MAX_ENTRY_BYTES)return;
  const file=this.file(operation.name),temporary=`${file}.${randomUUID()}.tmp`;
  try{await mkdir(this.directory,{recursive:true,mode:0o700});if(!await privatePath(this.directory,true))return;
   await writeFile(temporary,body,{flag:'wx',mode:0o600});await rename(temporary,file);
  }catch{/* Metadata caching must not block the live operation. */}
  finally{await unlink(temporary).catch(()=>{});}
 }
 async forget(name:string){try{await unlink(this.file(name));}catch{/* A failed invalidation cannot authorize a business call. */}}
}
