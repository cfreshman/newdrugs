import {expect,it} from 'vitest';
import express from 'express';
import type {AddressInfo} from 'node:net';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {config} from '../server/config';
import {mediaRange,sendMedia} from '../server/mediaDelivery';
import type {Upload} from '../server/uploads';

it('validates ordinary, suffix, open and invalid byte ranges',()=>{
 expect(mediaRange(undefined,100)).toBeNull();expect(mediaRange('bytes=10-19',100)).toEqual({start:10,end:19});
 expect(mediaRange('bytes=-10',100)).toEqual({start:90,end:99});expect(mediaRange('bytes=95-',100)).toEqual({start:95,end:99});
 for(const value of ['bytes=','bytes=-0','bytes=100-','bytes=9-2','bytes=0-1,5-6','bytes=9007199254740992-'])expect(mediaRange(value,100)).toBe(false);
});
it('streams ranges and HEAD without full response buffers, and rechecks changed file contents',async()=>{
 const id=randomUUID(),path=resolve(config.DATA_DIR,'files',id),bytes=Buffer.alloc(256*1024,41);await mkdir(resolve(config.DATA_DIR,'files'),{recursive:true});await writeFile(path,bytes);
 const file={_id:id,bytes:bytes.length,mime:'audio/wav',sha256:createHash('sha256').update(bytes).digest('hex')} as Upload;
 const app=express();app.get('/media',async(req,res)=>{await sendMedia(file,req,res);});app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.status||500).json({code:error.code}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/media`;
 try{
  const results=await Promise.all(Array.from({length:4},()=>fetch(url,{headers:{Range:'bytes=20-119'}}).then(async res=>({status:res.status,range:res.headers.get('content-range'),bytes:Buffer.from(await res.arrayBuffer())}))));
  for(const result of results){expect(result.status).toBe(206);expect(result.range).toBe(`bytes 20-119/${bytes.length}`);expect(result.bytes).toEqual(bytes.subarray(20,120));}
  const head=await fetch(url,{method:'HEAD'});expect(head.headers.get('content-length')).toBe(String(bytes.length));expect(await head.text()).toBe('');
  expect((await fetch(url,{headers:{Range:'bytes=-0'}})).status).toBe(416);
  const full=await fetch(url);expect(full.status).toBe(200);expect(Buffer.from(await full.arrayBuffer())).toEqual(bytes);
  await writeFile(path,Buffer.alloc(bytes.length,42));const changed=await fetch(url);expect(changed.status).toBe(503);expect(await changed.json()).toMatchObject({code:'file_unverified'});
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await unlink(path);}
});
