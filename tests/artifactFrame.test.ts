// @vitest-environment jsdom
import {createHash,randomUUID,webcrypto} from 'node:crypto';
import {act,createElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ArtifactFrame,artifactRasterDimensions,loadArtifactImages} from '../src/ArtifactFrame';
import {artifactEditableFocused} from '../src/embeddedArtifactFocus';
import {setupDOM,rect} from './dom';
import type {PublicArtifactDetail} from '../shared/artifacts';

const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwUMMAYAj4IP8cvlVgcAAAAASUVORK5CYII=','base64'));
const digest=createHash('sha256').update(png).digest('hex');
const artifact=(assets=false):PublicArtifactDetail=>{const id=randomUUID();return {id,title:'A graph',bodyHtml:assets?'<img src="nd-asset:photo">':'<p>Graph</p>',data:{value:1},assets:assets?[{id:'photo',url:`/api/artifacts/${id}/assets/photo`,mime:'image/png',bytes:png.length,sha256:digest}]:[],revision:1,contentRevision:1,updatedAt:'2026-10-22T12:00:00.000Z',contentUpdatedAt:'2026-10-22T12:00:00.000Z'};};
let dom:ReturnType<typeof setupDOM>,fetcher:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 dom=setupDOM();vi.stubGlobal('crypto',webcrypto);vi.spyOn(console,'error').mockImplementation(()=>{});
 fetcher=vi.fn(async(url:string|URL)=>String(url).includes('.woff2')?new Response(Uint8Array.of(119,79,70,50,1),{status:200}):new Response(png,{status:200,headers:{'content-type':'image/png'}}));vi.stubGlobal('fetch',fetcher);
 document.documentElement.dataset.theme='light';document.documentElement.dataset.font='mono';
});
afterEach(()=>{dom.cleanup();delete document.documentElement.dataset.theme;delete document.documentElement.dataset.font;});
async function mount(value:PublicArtifactDetail,callbacks:Partial<Parameters<typeof ArtifactFrame>[0]>={}){
 await act(async()=>dom.root.render(createElement(ArtifactFrame,{artifact:value,display:'inline',...callbacks})));
 const frame=dom.container.querySelector<HTMLIFrameElement>('iframe')!;
 Object.defineProperty(frame,'getClientRects',{configurable:true,value:()=>[rect(0,0,300,256)]});
 const post=vi.spyOn(frame.contentWindow!,'postMessage').mockImplementation(()=>{});
 await act(async()=>{frame.dispatchEvent(new Event('load'));await vi.waitFor(()=>expect(post.mock.calls.some(([message])=>message.type==='render')).toBe(true));});
 const render=()=>post.mock.calls.map(([message])=>message).filter(message=>message.type==='render'&&message.html.includes('nd-artifact-payload'));
 const relay=(type:string,detail:Record<string,unknown>={},channel=render().at(-1)!.channel,source:MessageEventSource|null=frame.contentWindow)=>act(()=>{window.dispatchEvent(new MessageEvent('message',{source,data:{source:'newdrugs-artifact-frame',channel,type,...detail}}));});
 return {frame,post,render,relay};
}

it('keeps one outer frame and document across metadata, theme, font and display changes',async()=>{
 const value=artifact(),ready=vi.fn(),view=await mount(value,{onReady:ready});view.relay('ready');expect(ready).toHaveBeenCalledOnce();
 const original=view.frame;
 await act(async()=>dom.root.render(createElement(ArtifactFrame,{artifact:{...value,title:'Renamed',revision:2},display:'expanded',onReady:ready})));
 await act(async()=>{document.documentElement.dataset.theme='dark';document.documentElement.dataset.font='serif';await Promise.resolve();});
 expect(dom.container.querySelector('iframe')).toBe(original);expect(original.title).toBe('Renamed');expect(view.render()).toHaveLength(1);
 expect(view.post.mock.calls.at(-1)?.[0]).toMatchObject({type:'context',context:{appearance:'dark',font:'serif',display:'expanded'}});
 expect(original.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads');expect(original.getAttribute('referrerpolicy')).toBe('no-referrer');expect(original.getAttribute('src')).toBe('/api/artifacts/frame');
 expect(fetcher.mock.calls.every(([url])=>String(url).includes('.woff2'))).toBe(true);
});
it('passes ordinary image URLs straight to HTML without importing or fetching them through the host',async()=>{
 const value={...artifact(),bodyHtml:'<img src="https://photos.invalid/photo.jpg"><img src="/api/files/log-photo">'},view=await mount(value);
 expect(view.render().at(-1)?.html).toContain(value.bodyHtml);expect(fetcher.mock.calls.every(([url])=>String(url).includes('.woff2'))).toBe(true);
});
it('verifies alias bytes once per image digest and rejects foreign URLs, digest drift and oversized decoding',async()=>{
 const value=artifact(true);value.assets.push({...value.assets[0],id:'same',url:`/api/artifacts/${value.id}/assets/same`});
 const bundle=await loadArtifactImages(value,new AbortController().signal);expect(fetcher).toHaveBeenCalledOnce();expect(Object.keys(bundle.images)).toHaveLength(1);expect(bundle.aliases.photo).toBe(bundle.aliases.same);
 await expect(loadArtifactImages({...value,assets:[{...value.assets[0],url:'https://foreign.invalid/image'}]},new AbortController().signal)).rejects.toThrow('invalid');
 await expect(loadArtifactImages({...value,assets:[{...value.assets[0],sha256:'0'.repeat(64)}]},new AbortController().signal)).rejects.toThrow('changed');
 expect(artifactRasterDimensions(png,'image/png')).toEqual({width:2,height:2});
 const huge=new Uint8Array(png);new DataView(huge.buffer).setUint32(16,50000);new DataView(huge.buffer).setUint32(20,50000);fetcher.mockResolvedValueOnce(new Response(huge,{status:200,headers:{'content-type':'image/png'}}));
 await expect(loadArtifactImages({...value,assets:[{...value.assets[0],sha256:createHash('sha256').update(huge).digest('hex')}]},new AbortController().signal)).rejects.toThrow('too large');
 expect(fetcher.mock.calls.some(([url])=>String(url).includes('/operations/'))).toBe(false);
});
it('accepts only the exact pinned image version and rejects noncanonical or additional URL parts',async()=>{
 const value=artifact(true),asset=value.assets[0],base=asset.url,versioned={...value,contentRevision:7,assets:[{...asset,url:`${base}?version=7`}]};
 const bundle=await loadArtifactImages(versioned,new AbortController().signal);expect(Object.keys(bundle.images)).toHaveLength(1);expect(fetcher).toHaveBeenCalledWith(`${base}?version=7`,expect.objectContaining({redirect:'error',cache:'no-store'}));
 const calls=fetcher.mock.calls.length;
 for(const suffix of ['?version=6','?version=07','?version=+7','?version=%37','?version=7.0','?version=7&other=1','?version=7&version=7','?version=7#part','#part'])await expect(loadArtifactImages({...versioned,assets:[{...asset,url:base+suffix}]},new AbortController().signal)).rejects.toThrow('invalid');
 await expect(loadArtifactImages({...versioned,assets:[{...asset,url:`https://foreign.invalid${base}?version=7`}]},new AbortController().signal)).rejects.toThrow('invalid');
 expect(fetcher).toHaveBeenCalledTimes(calls);
});
it('preserves the running document when only the equivalent live or pinned image URL changes',async()=>{
 const value=artifact(true),view=await mount(value);view.relay('ready');
 const pinned={...value,assets:value.assets.map(asset=>({...asset,url:`${asset.url}?version=${value.contentRevision}`}))};
 await act(async()=>dom.root.render(createElement(ArtifactFrame,{artifact:pinned,display:'inline'})));
 await act(async()=>dom.root.render(createElement(ArtifactFrame,{artifact:value,display:'inline'})));
 expect(dom.container.querySelector('iframe')).toBe(view.frame);expect(view.render()).toHaveLength(1);expect(view.frame.style.visibility).toBe('');
 expect(fetcher.mock.calls.filter(([url])=>String(url).includes('/api/artifacts/'))).toHaveLength(1);
});
it('accepts focus only from the active real outer frame and clears it on teardown',async()=>{
 const focus=vi.fn(),escape=vi.fn(),resize=vi.fn(),view=await mount(artifact(),{onEditableFocus:focus,onEscape:escape,onResize:resize});view.relay('ready');
 view.relay('editable-focus',{active:true});expect(artifactEditableFocused()).toBe(false);
 act(()=>view.frame.focus());view.relay('editable-focus',{active:true},'wrong-channel');expect(artifactEditableFocused()).toBe(false);
 view.relay('editable-focus',{active:true});expect(artifactEditableFocused()).toBe(true);expect(focus).toHaveBeenLastCalledWith(true);
 view.relay('link',{href:'https://example.com/read'});expect(escape).not.toHaveBeenCalled();
 view.relay('resize',{height:Infinity});expect(resize).not.toHaveBeenCalled();view.relay('resize',{height:123.4});expect(resize).toHaveBeenCalledWith(124);view.relay('escape');expect(escape).toHaveBeenCalledOnce();
 await act(async()=>dom.root.render(null));expect(artifactEditableFocused()).toBe(false);expect(focus).toHaveBeenLastCalledWith(false);
});
it('retains the prior successful render after network failure and unloads revoked image bytes',async()=>{
 const value=artifact(true),error=vi.fn(),view=await mount(value,{onError:error});view.relay('ready');
 fetcher.mockRejectedValueOnce(Error('Network interrupted'));
 await act(async()=>dom.root.render(createElement(ArtifactFrame,{artifact:{...value,revision:2,contentRevision:2},display:'inline',onError:error})));
 await act(async()=>{await vi.waitFor(()=>expect(error).toHaveBeenCalled());});
 expect(view.render()).toHaveLength(1);expect(dom.container.textContent).toContain('Showing the previous version');expect(dom.container.querySelector('iframe')).toBe(view.frame);
 const removed={...value,assets:[],bodyHtml:'<img src="nd-asset:photo">',revision:3,contentRevision:3};
 await act(async()=>dom.root.render(createElement(ArtifactFrame,{artifact:removed,display:'inline',onError:error})));
 await act(async()=>{await vi.waitFor(()=>expect(error).toHaveBeenLastCalledWith(expect.stringContaining('unavailable')));});
 const latest=view.post.mock.calls.filter(([message])=>message.type==='render').at(-1)![0];expect(latest.html).toBe('<!doctype html><html><body></body></html>');expect(dom.container.textContent).not.toContain('Showing the previous version');expect(view.frame.style.visibility).toBe('hidden');
});
it('reports a shell that never becomes ready and clears that failure when it does connect',async()=>{
 vi.useFakeTimers();
 try{const error=vi.fn(),view=await mount(artifact(),{onError:error});act(()=>vi.advanceTimersByTime(15000));expect(error).toHaveBeenCalledWith(expect.stringContaining('could not start'));expect(dom.container.textContent).toContain('Try opening it again');view.relay('ready');expect(dom.container.querySelector('[role="alert"]')).toBeNull();}finally{vi.useRealTimers();}
});
