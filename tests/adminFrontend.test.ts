import {afterAll,beforeAll,expect,it} from 'vitest';
import express from 'express';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Server} from 'node:http';
import type {AddressInfo} from 'node:net';
import {mountAdminFrontend} from '../server/adminFrontend';
let server:Server,directory:string,origin:string;
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),'newdrugs-admin-route-'));await mkdir(join(directory,'assets'));
 await writeFile(join(directory,'index.html'),'<!doctype html><title>Admin fixture</title><h1>Admin sign-in</h1>');await writeFile(join(directory,'assets','app.js'),'const adminFixture = true;');
 const app=express();mountAdminFrontend(app,directory);app.get('/',(_req,res)=>res.send('Public app'));
 await new Promise<void>(resolve=>{server=app.listen(0,'127.0.0.1',()=>resolve());});origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async()=>{if(server)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));if(directory)await rm(directory,{recursive:true,force:true});});
it('redirects the bare admin URL exactly once, then serves the admin page',async()=>{
 const redirect=await fetch(`${origin}/admin`,{redirect:'manual'});expect(redirect.status).toBe(302);expect(redirect.headers.get('location')).toBe('/admin/');
 const page=await fetch(new URL(redirect.headers.get('location')!,origin),{redirect:'manual'});expect(page.status).toBe(200);expect(page.headers.get('location')).toBeNull();expect(await page.text()).toContain('Admin sign-in');
 const followed=await fetch(`${origin}/admin`);expect(followed.status).toBe(200);expect(followed.url).toBe(`${origin}/admin/`);
});
it.each(['/admin/','/admin/reports','/admin/?from=link'])('serves %s without a redirect',async(path)=>{
 const response=await fetch(origin+path,{redirect:'manual'});expect(response.status).toBe(200);expect(response.headers.get('location')).toBeNull();expect(response.headers.get('cache-control')).toBe('no-cache');expect(await response.text()).toContain('Admin fixture');
});
it('serves admin assets and leaves the public app route alone',async()=>{
 const asset=await fetch(`${origin}/admin/assets/app.js`,{redirect:'manual'});expect(asset.status).toBe(200);expect(asset.headers.get('content-type')).toContain('javascript');expect(await asset.text()).toBe('const adminFixture = true;');
 expect(await (await fetch(origin)).text()).toBe('Public app');
});
