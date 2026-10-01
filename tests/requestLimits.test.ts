import express from 'express';
import {expect,it} from 'vitest';
import {apiRequestLimits,requestRateLimit} from '../server/requestLimits';
import type {AddressInfo} from 'node:net';
import {MemoryStore} from 'express-rate-limit';
it('keeps media and operation budgets separate, with rate limits on both',async()=>{
 const app=express();app.use('/api',apiRequestLimits({api:2,media:3,store:()=>new MemoryStore()}));app.use((_req,res)=>res.json({ok:true}));const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 try{
  for(const route of ['/api/files/a','/api/files/b','/api/link-previews/c/image'])expect((await fetch(origin+route)).status).toBe(200);
  expect((await fetch(origin+'/api/files/d')).status).toBe(429);
  expect((await fetch(origin+'/api/operations/log.list',{method:'POST'})).status).toBe(200);
  expect((await fetch(origin+'/api/files/a',{method:'POST'})).status).toBe(200);
  expect((await fetch(origin+'/api/operations/log.list',{method:'POST'})).status).toBe(429);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

it('keeps verified browser use outside request quotas and isolates external accounts on the same IP',async()=>{
 const app=express();app.use((req,_res,next)=>{const source=req.get('X-Test-Source');if(source==='browser'||source==='external')req.actor={userId:req.get('X-Test-User')||'one',source,scope:'read'};next();});
 app.use('/api',apiRequestLimits({api:2,media:2,store:()=>new MemoryStore()}));
 app.post('/api/session',requestRateLimit('session',1,60000,{store:new MemoryStore()}),(_req,res)=>res.json({ok:true}));app.use((_req,res)=>res.json({ok:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 try{
  expect((await fetch(origin+'/api/session',{method:'POST'})).status).toBe(200);expect((await fetch(origin+'/api/session',{method:'POST',headers:{Cookie:'unverified=value'}})).status).toBe(429);
  for(let i=0;i<35;i++)expect((await fetch(origin+'/api/session',{method:'POST',headers:{'X-Test-Source':'browser'}})).status).toBe(200);
  for(let i=0;i<5;i++)expect((await fetch(origin+'/api/files/photo',{headers:{'X-Test-Source':'browser'}})).status).toBe(200);
  for(let i=0;i<2;i++)expect((await fetch(origin+'/api/operations/people.search',{headers:{'X-Test-Source':'external'}})).status).toBe(200);
  expect((await fetch(origin+'/api/operations/people.search',{headers:{'X-Test-Source':'external'}})).status).toBe(429);
  expect((await fetch(origin+'/api/operations/people.search',{headers:{'X-Test-Source':'external','X-Test-User':'two'}})).status).toBe(200);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});

it('counts failed credential attempts even for browser sessions, without charging successful sign-ins',async()=>{
 const app=express();app.use((req,_res,next)=>{req.actor={userId:'one',source:'browser',scope:'write'};next();});
 app.post('/login',requestRateLimit('login',2,60000,{credentialAttempts:true,store:new MemoryStore()}),(req,res)=>res.status(req.get('X-Test-Fail')?401:200).json({ok:true}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 try{for(let i=0;i<5;i++)expect((await fetch(origin+'/login',{method:'POST'})).status).toBe(200);for(let i=0;i<2;i++)expect((await fetch(origin+'/login',{method:'POST',headers:{'X-Test-Fail':'yes'}})).status).toBe(401);expect((await fetch(origin+'/login',{method:'POST',headers:{'X-Test-Fail':'yes'}})).status).toBe(429);}
 finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
