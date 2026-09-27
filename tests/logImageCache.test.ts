import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {IDBFactory} from 'fake-indexeddb';
import {expect,it,vi} from 'vitest';
const code=readFileSync(new URL('../public/log-image-cache.js',import.meta.url),'utf8');
function factory(){const scope:any={};runInNewContext(code,{self:scope,setTimeout,clearTimeout,Date,Map,Set,Promise});return scope.createLogImageCache;}
it('persists account-scoped photos with LRU, age, count and byte limits',async()=>{
 let now=100;const indexedDB=new IDBFactory(),create=factory(),cache=create({factory:indexedDB,now:()=>now,maxBytes:9,maxItems:2,maxAge:1000,estimate:async()=>({})});await cache.bind('one');
 const put=(id:string)=>cache.put('one',id,new Blob(['1234']),'image/webp',cache.ticket());
 await put('a');now++;await put('b');now++;await cache.get('one','a');now++;await put('c');expect(await cache.get('one','b')).toBeNull();expect(await cache.stats()).toEqual({items:2,bytes:8});
 const restarted=create({factory:indexedDB,now:()=>now,maxAge:1000});expect((await restarted.get('one','a')).blob.size).toBe(4);expect(await restarted.get('two','a')).toBeNull();
 now+=1001;expect(await cache.get('one','a')).toBeNull();expect(await cache.put('one','huge',new Blob(['1234567890']),'image/webp',cache.ticket())).toBe(false);
});
it('purges on account changes and logout and prevents old in-flight writes from returning',async()=>{
 const cache=factory()({factory:new IDBFactory(),estimate:async()=>({})});await cache.bind('one');const ticket=cache.ticket();await cache.put('one','a',new Blob(['a']),'image/webp',ticket);await cache.bind('two');expect(await cache.stats()).toEqual({items:0,bytes:0});expect(await cache.put('one','a',new Blob(['a']),'image/webp',ticket)).toBe(false);await cache.clear();expect(await cache.account()).toBeUndefined();
});
it('reconciles detached images and entry/file deletion without clearing unrelated photos',async()=>{
 const cache=factory()({factory:new IDBFactory(),estimate:async()=>({})});await cache.bind('one');await cache.invalidate('one',{entries:[{id:'entry',fileIds:['a','b']},{id:'other',fileIds:['c']}]});
 for(const id of ['a','b','c'])await cache.put('one',id,new Blob([id]),'image/webp',cache.ticket());
 await cache.invalidate('one',{entries:[{id:'entry',fileIds:['a']}]});expect(await cache.get('one','b')).toBeNull();expect(await cache.stats()).toEqual({items:2,bytes:2});await cache.invalidate('one',{entryId:'entry'});expect(await cache.get('one','a')).toBeNull();expect(await cache.get('one','c')).toBeTruthy();await cache.invalidate('one',{fileId:'c'});expect(await cache.stats()).toEqual({items:0,bytes:0});
});
it('respects available origin storage and excludes non-images',async()=>{
 const cache=factory()({factory:new IDBFactory(),estimate:async()=>({quota:100,usage:96})});await cache.bind('one');expect(await cache.put('one','a',new Blob(['1234']),'image/webp',cache.ticket())).toBe(false);expect(await cache.put('one','audio',new Blob(['a']),'audio/mp4',cache.ticket())).toBe(false);
});
it('intercepts only marked Log images and serves a repeat from IndexedDB without a second request',async()=>{
 const events:any={},fetch=vi.fn(async()=>new Response(new Blob(['photo']),{headers:{'Content-Type':'image/webp'}}));const scope:any={location:{origin:'https://druggie.org'},addEventListener:(name:string,callback:any)=>{events[name]=callback;}};
 runInNewContext(code,{self:scope,indexedDB:new IDBFactory(),navigator:{storage:{estimate:async()=>({})}},setTimeout,clearTimeout,Date,Map,Set,Promise,URL,Response,fetch});
 let work:Promise<any>;events.message({data:{type:'log-images:account',account:'one'},source:{url:'https://druggie.org/log'},waitUntil:(p:Promise<any>)=>{work=p;}});await work!;
 const read=async(url:string)=>{let response:Promise<Response>|undefined;events.fetch({request:new Request(url),respondWith:(p:Promise<Response>)=>{response=p;},waitUntil:()=>{}});return response;};
 expect(await read('https://druggie.org/api/bootstrap')).toBeUndefined();expect(await read('https://druggie.org/api/files/a')).toBeUndefined();
 const first=await read('https://druggie.org/api/files/a?log-image=1');expect(await first?.text()).toBe('photo');const second=await read('https://druggie.org/api/files/a?log-image=1');expect(second?.headers.get('X-NewDrugs-Image-Cache')).toBe('hit');expect(await second?.text()).toBe('photo');expect(fetch).toHaveBeenCalledTimes(1);
});
it('falls back to the network if browser storage is denied',async()=>{
 const events:any={},fetch=vi.fn(async()=>new Response('photo',{headers:{'Content-Type':'image/webp'}})),scope:any={location:{origin:'https://druggie.org'},addEventListener:(name:string,fn:any)=>{events[name]=fn;}};
 runInNewContext(code,{self:scope,indexedDB:{open(){throw new DOMException('Denied','SecurityError');}},navigator:{},setTimeout,clearTimeout,Date,Map,Set,Promise,URL,Response,fetch});
 let response:Promise<Response>;events.fetch({request:new Request('https://druggie.org/api/files/a?log-image=1'),respondWith:(p:Promise<Response>)=>{response=p;},waitUntil:()=>{}});expect(await (await response!).text()).toBe('photo');
});

it('associates an uploaded preview with its saved entry so leaving removes the cached file',async()=>{
 const cache=factory()({factory:new IDBFactory(),estimate:async()=>({})});await cache.bind('one');await cache.put('one','preview',new Blob(['photo']),'image/webp',cache.ticket());await cache.invalidate('one',{entries:[{id:'saved-entry',fileIds:['preview']}]});expect((await cache.get('one','preview')).entryId).toBe('saved-entry');await cache.invalidate('one',{entryId:'saved-entry'});expect(await cache.get('one','preview')).toBeNull();
});
