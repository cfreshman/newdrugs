import {open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pipeline} from 'node:stream/promises';
import type {Request,Response} from 'express';
import type {Upload} from './uploads';
import {config} from './config';
import {AppError} from './errors';
import {workGate} from './workGate';
import {objectBody} from './objectStorage';

// Cache verification metadata, never authorization or file bytes. Stat changes
// force re-verification; concurrent requests for the same inode share that work.
const verified=new Map<string,string>(),checking=new Map<string,Promise<void>>(),verifyGate=workGate(4,128);
export function mediaRange(value:string|undefined,size:number):{start:number;end:number}|null|false{
 if(value===undefined)return null;
 const match=/^bytes=(\d*)-(\d*)$/.exec(value);if(!match||(!match[1]&&!match[2])||!size)return false;
 const a=Number(match[1]),b=Number(match[2]);if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b))return false;
 const start=match[1]?a:Math.max(0,size-b),end=match[1]&&match[2]?Math.min(b,size-1):size-1;
 return start>end||start>=size?false:{start,end};
}

/** Authorized immutable files stream with backpressure, including single byte ranges. */
export async function sendMedia(file:Upload,req:Request,res:Response){
 if(!/^[0-9a-f-]{36}$/.test(file._id))throw new AppError(404,'not_found','This file is unavailable.');
 const range=mediaRange(req.headers.range,file.bytes);
 res.set({'Content-Type':file.mime,'Accept-Ranges':'bytes','Cache-Control':String(res.getHeader('Cache-Control')||'private, no-store'),'X-Content-Type-Options':'nosniff'});
 if(range===false){res.status(416).set('Content-Range',`bytes */${file.bytes}`).end();return;}
 if(file.storage){
  const controller=new AbortController(),cancel=()=>controller.abort();res.once('close',cancel);
  try{
   const {body,length}=await objectBody(file.storage,file.bytes,file.sha256,range||undefined,req.method==='HEAD',AbortSignal.any([controller.signal,AbortSignal.timeout(60000)]));
   res.set('Content-Length',String(length));if(range)res.status(206).set('Content-Range',`bytes ${range.start}-${range.end}/${file.bytes}`);
   if(req.method==='HEAD'||!length){body?.destroy();res.end();return;}
   await pipeline(body!,res);
  }catch(error){if(!res.destroyed&&!controller.signal.aborted)throw error;}finally{res.off('close',cancel);}
  return;
 }
 const handle=await open(resolve(config.DATA_DIR,'files',file._id),'r').catch(()=>{throw new AppError(404,'not_found','This file is unavailable.');});
 try{
  const stat=await handle.stat({bigint:true});
  if(!stat.isFile()||stat.size!==BigInt(file.bytes))throw new AppError(503,'file_unverified','The stored file could not be verified.');
  const signature=[file.sha256,stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs].join(':');
  if(verified.get(file._id)!==signature){
   const key=`${file._id}:${signature}`;
   let task=checking.get(key);
   if(!task){task=verifyGate.run(async()=>{
    const hash=createHash('sha256');for await(const chunk of handle.createReadStream({start:0,autoClose:false}))hash.update(chunk);
    if(hash.digest('hex')!==file.sha256)throw new AppError(503,'file_unverified','The stored file could not be verified.');
    verified.delete(file._id);verified.set(file._id,signature);
    while(verified.size>4096)verified.delete(verified.keys().next().value!);
   }).finally(()=>{checking.delete(key);});checking.set(key,task);}
   await task;
  }
  const length=range?range.end-range.start+1:file.bytes;
  res.set('Content-Length',String(length));
  if(range)res.status(206).set('Content-Range',`bytes ${range.start}-${range.end}/${file.bytes}`);
  if(req.method==='HEAD'||!length){res.end();return;}
  try{await pipeline(handle.createReadStream({start:range?.start||0,end:range?.end,autoClose:false}),res);}
  catch(error){if(!req.destroyed&&(error as {code?:string}).code!=='ERR_STREAM_PREMATURE_CLOSE')throw error;}
 }finally{await handle.close();}
}
