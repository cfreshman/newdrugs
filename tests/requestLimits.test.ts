import express from 'express';
import {expect,it} from 'vitest';
import {apiRequestLimits} from '../server/requestLimits';
import type {AddressInfo} from 'node:net';
it('keeps media and operation budgets separate, with rate limits on both',async()=>{
 const app=express();app.use('/api',apiRequestLimits({api:2,media:3}));app.use((_req,res)=>res.json({ok:true}));const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
 try{
  for(const route of ['/api/files/a','/api/files/b','/api/link-previews/c/image'])expect((await fetch(origin+route)).status).toBe(200);
  expect((await fetch(origin+'/api/files/d')).status).toBe(429);
  expect((await fetch(origin+'/api/operations/log.list',{method:'POST'})).status).toBe(200);
  expect((await fetch(origin+'/api/files/a',{method:'POST'})).status).toBe(200);
  expect((await fetch(origin+'/api/operations/log.list',{method:'POST'})).status).toBe(429);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
