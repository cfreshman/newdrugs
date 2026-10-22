// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ArtifactDetail,PublicArtifactDetail} from '../shared/artifacts';
import {ArtifactCache,artifactCacheKey} from '../src/artifactCache';
import {ApiError,api,operation} from '../src/api';
vi.mock('../src/api',()=>({api:vi.fn(),operation:vi.fn(),errorText:(error:Error)=>error.message,ApiError:class extends Error{constructor(message:string,public code:string,public status:number){super(message);}}}));
const id='e189505a-9797-4c51-af56-bf7dd2abc449';
const record=(key=id,revision=1):PublicArtifactDetail=>({id:key,title:'A graph',bodyHtml:'<p>Graph</p>',data:{values:[revision,revision+1]},assets:[],revision,contentRevision:revision,updatedAt:'2026-10-22T00:00:00.000Z',contentUpdatedAt:'2026-10-22T00:00:00.000Z'});
const owner=(revision=1,changes:Partial<ArtifactDetail>={}):ArtifactDetail=>({...record(id,revision),assets:[],createdAt:'2026-10-22T00:00:00.000Z',dataUpdatedAt:'2026-10-22T00:00:00.000Z',producer:{kind:'hosted',name:'Private producer'},ephemeral:false,hasRefreshInstruction:true,refreshInstruction:'Private source instructions',...changes});
let cache:ArtifactCache;
beforeEach(()=>{vi.resetAllMocks();cache=new ArtifactCache();Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});vi.mocked(api).mockImplementation(async path=>{const url=new URL(path,'https://test.invalid'),key=url.pathname.split('/')[2],version=url.searchParams.get('version'),revision=version&&version!=='legacy'?Number(version):1;return url.pathname.endsWith('/state')?{revision,contentRevision:revision,assets:[]}:record(key,revision);});});
afterEach(()=>cache.dispose());
it('caps executing placements at four and protects the expanded placement',()=>{
 for(let index=0;index<30;index++)cache.place(`p${index}`,`${index}`,true,false);
 expect(Array.from({length:30},(_,index)=>cache.active(`p${index}`)).filter(Boolean)).toHaveLength(4);
 cache.place('p0','0',true,true);for(let index=30;index<60;index++)cache.place(`p${index}`,`${index}`,true,false);
 expect(cache.active('p0')).toBe(true);expect(Array.from({length:60},(_,index)=>cache.active(`p${index}`)).filter(Boolean)).toHaveLength(4);
});
it('reads only exact visible records and coalesces overlapping body reads',async()=>{
 let finish!:(value:PublicArtifactDetail)=>void;vi.mocked(api).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
 const release=cache.watch(id),first=cache.load(id),second=cache.load(id);expect(api).toHaveBeenCalledOnce();finish(record());await Promise.all([first,second]);
 expect(cache.get(id).document?.data).toEqual({values:[1,2]});expect(operation).not.toHaveBeenCalled();release();
});
it('retains at most 24 inactive documents while protecting currently watched content',async()=>{
 const release=cache.watch(id);await cache.load(id);for(let index=0;index<50;index++)await cache.load(`e189505a-9797-4c51-af56-${String(index).padStart(12,"0")}`);
 expect(cache.get(id).document).toBeDefined();expect(Array.from({length:50},(_,index)=>cache.get(`e189505a-9797-4c51-af56-${String(index).padStart(12,"0")}`).document).filter(Boolean)).toHaveLength(23);release();
});
it('polls revision metadata only and transfers a body only when it changes',async()=>{
 const release=cache.watch(id);await cache.load(id);vi.mocked(api).mockClear();await cache.poll();expect(api).toHaveBeenCalledOnce();expect(vi.mocked(api).mock.calls[0][0]).toMatch(/\/state$/);
 vi.mocked(api).mockResolvedValueOnce({revision:2}).mockResolvedValueOnce(record(id,2));await cache.poll();expect(cache.get(id).document?.revision).toBe(2);
 release();vi.mocked(api).mockClear();await cache.poll();expect(api).not.toHaveBeenCalled();
});
it('does not poll when the page is hidden',async()=>{cache.watch(id);Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});await cache.poll();expect(api).not.toHaveBeenCalled();});
it('unloads revoked content and ignores an older in-flight read after deletion',async()=>{
 cache.watch(id);await cache.load(id);let finish!:(value:PublicArtifactDetail)=>void;vi.mocked(api).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
 const pending=cache.load(id,true);cache.invalidate({keys:['artifacts'],artifacts:[{id,deleted:true}]});finish(record());await pending;
 expect(cache.get(id).document).toBeUndefined();expect(cache.get(id).unavailable).toBe(true);
});
it('reauthorizes an anonymous shared view and unloads it after a 404',async()=>{
 cache.watch(id);await cache.load(id);vi.mocked(api).mockRejectedValueOnce(new ApiError('Gone','not_found',404));await cache.poll();expect(cache.get(id)).toMatchObject({unavailable:true,loading:false});expect(cache.get(id).document).toBeUndefined();
});
it('preserves a successful document after a temporary refresh failure',async()=>{
 cache.watch(id);await cache.load(id);vi.mocked(api).mockRejectedValueOnce(Error('Offline'));await cache.load(id,true);expect(cache.get(id).document).toEqual(record());expect(cache.get(id).error).toBe('Offline');
});
it('uses owner-scoped changed IDs instead of refreshing all cached bodies',async()=>{
 cache.watch(id);await cache.load(id);vi.mocked(api).mockClear();cache.invalidate({keys:['artifacts'],artifacts:[{id:'unrelated'}]});await Promise.resolve();expect(api).not.toHaveBeenCalled();
});
it('keeps private management data out of the render document',async()=>{
 cache.watch(id);await cache.load(id);vi.mocked(operation).mockResolvedValue({...record(),refreshInstruction:'Private source instructions',ephemeral:true,producer:{name:'Private producer'}});
 await cache.manage(id);expect(cache.get(id).owner?.refreshInstruction).toBe('Private source instructions');expect(cache.get(id).document).toEqual(record());expect(JSON.stringify(cache.get(id).document)).not.toContain('Private');
});
it('withdraws decoded images before fetching a changed manifest even when the body reload fails',async()=>{
 const image={id:'photo',sha256:'a'.repeat(64),url:`/api/artifacts/${id}/assets/photo`,mime:'image/png' as const,bytes:100};
 cache.watch(id);vi.mocked(api).mockResolvedValueOnce({...record(),assets:[image]});await cache.load(id);
 vi.mocked(api).mockResolvedValueOnce({revision:2,assets:[]}).mockRejectedValueOnce(Error('Offline'));await cache.poll();
 expect(cache.get(id).document).toBeUndefined();expect(cache.get(id).error).toBe('Offline');
});

it('keys latest, each numeric version and the frozen legacy baseline independently',async()=>{
 const keys=[artifactCacheKey(id),artifactCacheKey(id,1),artifactCacheKey(id,2),artifactCacheKey(id,'legacy')];
 expect(new Set(keys).size).toBe(4);expect(keys).toEqual([id,`${id}@1`,`${id}@2`,`${id}@legacy`]);
 await Promise.all(keys.map(key=>cache.load(key)));
 expect(vi.mocked(api).mock.calls.map(([path])=>path)).toEqual([`/artifacts/${id}`,`/artifacts/${id}?version=1`,`/artifacts/${id}?version=2`,`/artifacts/${id}?version=legacy`]);
 expect(cache.get(keys[1]).document?.contentRevision).toBe(1);expect(cache.get(keys[2]).document?.contentRevision).toBe(2);
 expect(cache.get(keys[3]).document).not.toBe(cache.get(keys[1]).document);
});

it('refreshes latest content after a root invalidation while pinned versions only recheck fixed state',async()=>{
 const latest=artifactCacheKey(id),first=artifactCacheKey(id,1),second=artifactCacheKey(id,2),legacy=artifactCacheKey(id,'legacy'),keys=[latest,first,second,legacy];
 let current=3;
 vi.mocked(api).mockImplementation(async path=>{const url=new URL(path,'https://test.invalid'),selected=url.searchParams.get('version'),revision=selected==='legacy'?1:selected?Number(selected):current;return url.pathname.endsWith('/state')?{revision,contentRevision:revision,assets:[]}:record(id,revision);});
 keys.forEach(key=>cache.watch(key));await Promise.all(keys.map(key=>cache.load(key)));
 const firstDocument=cache.get(first).document,secondDocument=cache.get(second).document,legacyDocument=cache.get(legacy).document;
 vi.mocked(api).mockClear();current=4;cache.invalidate({keys:['artifacts'],artifacts:[{id}]});
 await vi.waitFor(()=>expect(cache.get(latest).document?.contentRevision).toBe(4));
 expect(cache.get(first).document).toBe(firstDocument);expect(cache.get(second).document).toBe(secondDocument);expect(cache.get(legacy).document).toBe(legacyDocument);
 expect(vi.mocked(api).mock.calls.map(([path])=>path).sort()).toEqual([`/artifacts/${id}`,`/artifacts/${id}/state?version=1`,`/artifacts/${id}/state?version=2`,`/artifacts/${id}/state?version=legacy`].sort());
 expect(cache.get(latest).document?.data).toEqual({values:[4,5]});
});

it('shares latest private owner management across versions without modifying pinned public metadata',async()=>{
 const first=artifactCacheKey(id,1),second=artifactCacheKey(id,2);await Promise.all([cache.load(id),cache.load(first),cache.load(second)]);
 const pinned=cache.get(first).document,other=cache.get(second).document;
 vi.mocked(operation).mockResolvedValueOnce(owner(3));await cache.manage(first);await cache.manage(second);
 expect(operation).toHaveBeenCalledExactlyOnceWith('artifacts.get',{artifactId:id},expect.objectContaining({signal:expect.any(AbortSignal)}));
 const changed=owner(4,{title:'Latest renamed title',contentRevision:1,ephemeral:true});cache.updateOwner(changed);
 for(const key of [id,first,second])expect(cache.get(key).owner).toBe(changed);
 expect(cache.get(id).document).toMatchObject({title:'Latest renamed title',revision:4,contentRevision:1});
 expect(cache.get(first).document).toBe(pinned);expect(cache.get(second).document).toBe(other);
 expect(cache.get(first).document).toMatchObject({title:'A graph',revision:1,contentRevision:1});
 for(const key of [id,first,second]){expect(cache.get(key).document).not.toHaveProperty('refreshInstruction');expect(cache.get(key).document).not.toHaveProperty('producer');expect(cache.get(key).document).not.toHaveProperty('ephemeral');}
});

it('refreshes current owner metadata for a historical viewer without fetching its immutable body',async()=>{
 const key=artifactCacheKey(id,1);cache.watch(key);await cache.load(key);vi.mocked(operation).mockResolvedValueOnce(owner(3));await cache.manage(key);
 const pinned=cache.get(key).document;vi.mocked(api).mockClear();vi.mocked(operation).mockResolvedValueOnce(owner(4));
 cache.invalidate({keys:['artifacts'],artifacts:[{id}]});
 await vi.waitFor(()=>expect(cache.get(key).owner?.revision).toBe(4));
 expect(cache.get(key).document).toBe(pinned);expect(cache.get(key).document?.revision).toBe(1);
 expect(vi.mocked(operation).mock.calls.at(-1)?.[1]).toEqual({artifactId:id});
 expect(vi.mocked(api).mock.calls.map(([path])=>path)).toEqual([`/artifacts/${id}/state?version=1`]);
});

it('revokes every cached version and pending public, state and owner response when the root is deleted',async()=>{
 const first=artifactCacheKey(id,1),second=artifactCacheKey(id,2),keys=[id,first,second];keys.forEach(key=>cache.watch(key));await Promise.all(keys.map(key=>cache.load(key)));
 let finishBody!:(value:unknown)=>void,finishState!:(value:unknown)=>void,finishOwner!:(value:unknown)=>void;
 vi.mocked(api).mockImplementation(path=>path===`/artifacts/${id}?version=2`?new Promise(resolve=>{finishBody=resolve;}):path===`/artifacts/${id}/state?version=1`?new Promise(resolve=>{finishState=resolve;}):Promise.resolve({revision:1,assets:[]}));
 vi.mocked(operation).mockReturnValueOnce(new Promise(resolve=>{finishOwner=resolve;}));
 const body=cache.load(second,true),management=cache.manage(first),state=cache.poll();
 cache.remove(second);
 for(const key of [...keys,artifactCacheKey(id,'legacy')])expect(cache.get(key)).toMatchObject({unavailable:true,loading:false});
 finishBody(record(id,2));finishState({revision:1,assets:[]});finishOwner(owner(5));await Promise.all([body,management,state]);
 for(const key of keys){expect(cache.get(key).document).toBeUndefined();expect(cache.get(key).owner).toBeUndefined();}
 vi.mocked(api).mockClear();await cache.load(first,true);await cache.poll();expect(api).not.toHaveBeenCalled();
});

it('withdraws revoked images from a pinned version even when its original revision is unchanged',async()=>{
 const key=artifactCacheKey(id,1),image={id:'photo',sha256:'a'.repeat(64),url:`/api/artifacts/${id}/assets/photo?version=1`,mime:'image/png' as const,bytes:100};
 cache.watch(key);vi.mocked(api).mockResolvedValueOnce({...record(),assets:[image]});await cache.load(key);
 let fail!:(error:Error)=>void;vi.mocked(api).mockResolvedValueOnce({revision:1,contentRevision:1,assets:[]}).mockImplementationOnce(()=>new Promise((_resolve,reject)=>{fail=reject;}));
 const pending=cache.poll();await vi.waitFor(()=>expect(fail).toBeDefined());
 expect(cache.get(key).document).toBeUndefined();expect(cache.get(key).loading).toBe(true);
 fail(Error('Offline'));await pending;expect(cache.get(key).document).toBeUndefined();expect(cache.get(key).error).toBe('Offline');
 expect(vi.mocked(api).mock.calls.at(-1)?.[0]).toBe(`/artifacts/${id}?version=1`);
});

it('keeps a missing pinned version local instead of poisoning other valid root versions',async()=>{
 const first=artifactCacheKey(id,1),missing=artifactCacheKey(id,99);await Promise.all([cache.load(id),cache.load(first)]);cache.watch(missing);cache.watch(first);
 vi.mocked(api).mockRejectedValueOnce(new ApiError('Missing version','not_found',404));await cache.load(missing);
 expect(cache.get(missing).unavailable).toBe(true);const latest=cache.get(id).document,pinned=cache.get(first).document;
 vi.mocked(api).mockClear();await cache.poll();
 expect(vi.mocked(api).mock.calls.map(([path])=>path)).toEqual([`/artifacts/${id}/state?version=1`]);
 expect(cache.get(id).document).toBe(latest);expect(cache.get(first).document).toBe(pinned);expect(cache.get(id).unavailable).toBeUndefined();
});

it('counts all root versions toward the same 24-entry cache and four executing placements',async()=>{
 const protectedKey=artifactCacheKey(id,1);cache.watch(protectedKey);await cache.load(protectedKey);
 for(let version=2;version<=50;version++){const key=artifactCacheKey(id,version);await cache.load(key);cache.place(`version-${version}`,key,true,false);}
 expect(cache.get(protectedKey).document).toBeDefined();
 expect(Array.from({length:50},(_,index)=>cache.get(artifactCacheKey(id,index+1)).document).filter(Boolean)).toHaveLength(24);
 expect(Array.from({length:50},(_,index)=>cache.active(`version-${index+1}`)).filter(Boolean)).toHaveLength(4);
});

it('does not let an older owner read or public response undo newer owner metadata',async()=>{
 const first=artifactCacheKey(id,1);await Promise.all([cache.load(id),cache.load(first)]);
 let finishOwner!:(value:unknown)=>void,finishBody!:(value:unknown)=>void;
 vi.mocked(operation).mockReturnValueOnce(new Promise(resolve=>{finishOwner=resolve;}));vi.mocked(api).mockReturnValueOnce(new Promise(resolve=>{finishBody=resolve;}));
 const management=cache.manage(first),body=cache.load(id,true),updated=owner(2,{contentRevision:1,title:'Human title'});cache.updateOwner(updated);
 finishOwner(owner(1));finishBody(record(id,1));await Promise.all([management,body]);
 expect(cache.get(first).owner).toBe(updated);expect(cache.get(first).document).toMatchObject({title:'A graph',revision:1});
 expect(cache.get(id).document).toMatchObject({title:'Human title',revision:2});
});

it('does not display an older latest-body response after owner management proves a newer content version',async()=>{
 cache.watch(id);await cache.load(id);let finish!:(value:unknown)=>void;
 vi.mocked(api).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce(record(id,3));
 const seen:number[]=[];cache.subscribe(()=>{const value=cache.get(id).document;if(value)seen.push(value.contentRevision);});
 const pending=cache.load(id,true);vi.mocked(operation).mockResolvedValueOnce(owner(3));await cache.manage(id);finish(record(id,2));await pending;
 await vi.waitFor(()=>expect(cache.get(id).document?.contentRevision).toBe(3));expect(seen).not.toContain(2);expect(cache.get(id).owner?.revision).toBe(3);
});

it('bounds stale latest retries and accepts newer public metadata only for the same content version',async()=>{
 cache.watch(id);await cache.load(id);let finish!:(value:unknown)=>void;
 vi.mocked(api).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;})).mockResolvedValue(record(id,2));
 const pending=cache.load(id,true);vi.mocked(operation).mockResolvedValueOnce(owner(3));await cache.manage(id);finish(record(id,2));await pending;
 await vi.waitFor(()=>expect(cache.get(id).error).toContain('changed while loading'));expect(api).toHaveBeenCalledTimes(3);expect(cache.get(id).document?.contentRevision).toBe(1);
 vi.mocked(api).mockResolvedValueOnce(record(id,3));await cache.load(id,true);expect(cache.get(id).document?.contentRevision).toBe(3);expect(cache.get(id).error).toBeUndefined();
 const metadata=owner(5,{contentRevision:4,title:'Current title'});vi.mocked(api).mockResolvedValueOnce(record(id,4));cache.updateOwner(metadata);
 await vi.waitFor(()=>expect(cache.get(id).document?.contentRevision).toBe(4));expect(cache.get(id).document).toMatchObject({title:'Current title',revision:5,contentRevision:4});
 expect(cache.get(id).document).not.toHaveProperty('refreshInstruction');
});

it('defers hidden root changes until reopening without refetching pinned sources',async()=>{
 const key=artifactCacheKey(id,1);cache.watch(key);await cache.load(key);const saved=cache.get(key).document;
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});vi.mocked(api).mockClear();cache.invalidate({keys:['artifacts'],artifacts:[{id}]});await Promise.resolve();expect(api).not.toHaveBeenCalled();
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});await cache.poll();
 expect(cache.get(key).document).toBe(saved);expect(vi.mocked(api).mock.calls.map(([path])=>path)).toEqual([`/artifacts/${id}/state?version=1`]);
});
