import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {Request,Response} from 'express';
import {chromium,webkit,type Browser,type Frame,type Page} from '@playwright/test';
import {expect,it} from 'vitest';
import {ARTIFACT_FRAME_CSP,ARTIFACT_FRAME_MAX_BYTES,ARTIFACT_FRAME_SANDBOX,buildArtifactFrameDocument,sendArtifactFrame} from '../server/artifactFrame';

const origin='https://artifact-app.invalid';
const resourceOrigin='https://artifact-resources.invalid';
const font=readFileSync(new URL('../src/fonts/noto-sans-normal-latin.woff2',import.meta.url));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwUMMAYAj4IP8cvlVgcAAAAASUVORK5CYII=','base64');
type PresentationEvent={source:string;channel:string;type:string;[key:string]:unknown};
function response(){const value={headers:{} as Record<string,string>,body:'',set(headers:Record<string,string>){Object.assign(this.headers,headers);return this;},send(body:string){this.body=body;return this;}};return value;}
it('serves an anonymous no-data shell allowing ordinary resources while keeping its origin opaque',()=>{
 const res=response(),req={originalUrl:'/api/artifacts/frame?private-marker=ignored'} as Request;
 sendArtifactFrame(req,res as unknown as Response);
 expect(res.headers['Content-Security-Policy']).toBe(ARTIFACT_FRAME_CSP);
 for(const directive of [`sandbox ${ARTIFACT_FRAME_SANDBOX}`,'default-src http: https: data: blob:',"script-src http: https: data: blob: 'unsafe-inline' 'unsafe-eval'",'connect-src http: https: ws: wss: data: blob:',"frame-ancestors 'self'",'form-action http: https: data: blob:'])expect(ARTIFACT_FRAME_CSP).toContain(directive);
 expect(ARTIFACT_FRAME_CSP).not.toMatch(/allow-same-origin|allow-top-navigation|(?:connect|worker|form-action|base-uri)-src 'none'/);
 expect(res.headers).toMatchObject({'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'});
 expect(res.headers['Permissions-Policy']).toBeUndefined();
 expect(res.body).toBe(buildArtifactFrameDocument());expect(res.body).not.toContain('private-marker');expect(res.body).not.toContain('owner');
 const authenticated=response();sendArtifactFrame({actor:{userId:'private-owner',source:'external',scope:'read'}} as Request,authenticated as unknown as Response);
 expect(authenticated.body).toBe(res.body);expect(authenticated.body).not.toContain('private-owner');
});

async function fixture(browser:Browser){
 const context=await browser.newContext(),page=await context.newPage(),unexpected:string[]=[],diagnostics:string[]=[];
 page.on('console',message=>{if(message.type()==='error')diagnostics.push(message.text());});page.on('pageerror',error=>diagnostics.push(error.message));
 await context.route('**/*',async route=>{
  const url=route.request().url();
  if(url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
  if(url===`${origin}/`)return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':"default-src 'none'; script-src 'self'; frame-src 'self'"},body:`<!doctype html><iframe id="shell" src="/api/artifacts/frame" sandbox="${ARTIFACT_FRAME_SANDBOX}"></iframe><script src="/host.js"></script>`});
  if(url===`${origin}/host.js`)return route.fulfill({contentType:'text/javascript',body:"window.appSecret='private-app-value';document.cookie='app-secret=private';window.artifactEvents=[];window.addEventListener('message',event=>{if(event.source===document.getElementById('shell').contentWindow)window.artifactEvents.push(event.data);});"});
  if(url===`${origin}/api/artifacts/frame`)return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':ARTIFACT_FRAME_CSP,'Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN'},body:buildArtifactFrameDocument()});
  if(url.startsWith(`${resourceOrigin}/`)){
   const path=new URL(url).pathname,headers={'Access-Control-Allow-Origin':'*'};unexpected.push(url);
   if(path==='/data.json')return route.fulfill({contentType:'application/json',headers,body:'{"value":7}'});
   if(path==='/script.js')return route.fulfill({contentType:'text/javascript',headers,body:'window.externalScriptLoaded=true;'});
   if(path==='/style.css')return route.fulfill({contentType:'text/css',headers,body:`@font-face{font-family:ExternalNoto;src:url(${resourceOrigin}/font.woff2)}.external-style{color:rgb(12,34,56);font-family:ExternalNoto}`});
   if(path==='/font.woff2')return route.fulfill({contentType:'font/woff2',headers,body:font});
   if(path==='/image.png')return route.fulfill({contentType:'image/png',headers,body:png});
   if(path==='/download')return route.fulfill({contentType:'text/plain',headers:{...headers,'Content-Disposition':'attachment; filename="artifact.txt"'},body:'Artifact download'});
   return route.fulfill({contentType:'text/html',headers,body:`<!doctype html><title>Destination</title><p id="destination">${route.request().method()} destination</p>`});
  }
  if(!url.endsWith('/favicon.ico'))unexpected.push(url);
  return route.fulfill({status:200,contentType:'text/html',body:'Unexpected network destination'});
 });
 await page.goto(origin);
 const outer=await page.locator('#shell').elementHandle().then(handle=>handle!.contentFrame());
 if(!outer)throw Error('Frame shell did not load.');
 return {context,page,outer,unexpected,diagnostics};
}
async function events(page:Page){return page.evaluate(()=>(window as unknown as {artifactEvents:PresentationEvent[]}).artifactEvents);}
async function host(page:Page,message:Record<string,unknown>){await page.evaluate(message=>document.querySelector<HTMLIFrameElement>('#shell')!.contentWindow!.postMessage({source:'newdrugs-artifact-host',...message},'*'),message);}
function childHtml(channel:string){return `<!doctype html><meta charset="utf-8"><button id="counter">0</button><input id="field"><script>
(()=>{const channel=${JSON.stringify(channel)},send=(type,detail={})=>parent.postMessage({source:'newdrugs-artifact-document',channel,type,...detail},'*');
window.probe={loaded:true,count:0,contexts:[]};
document.getElementById('counter').onclick=()=>{window.probe.count++;document.getElementById('counter').textContent=String(window.probe.count);};
window.addEventListener('message',event=>{if(event.source===parent&&event.data?.source==='newdrugs-artifact-frame'&&event.data.channel===channel&&event.data.type==='context')window.probe.contexts.push(event.data.context);});
window.sendPresentation=send;send('ready');})();
</script>`;}
async function rendered(page:Page,outer:Frame,channel:string,diagnostics:string[]=[]){
 await host(page,{type:'render',channel,html:childHtml(channel),context:{appearance:'light',display:'inline'}});
 try{await expect.poll(async()=>(await events(page)).some(event=>event.type==='ready'&&event.channel===channel),{timeout:10000}).toBe(true);}catch{const states=await Promise.all(page.frames().map(async frame=>({url:frame.url(),state:await frame.evaluate(()=>({ready:document.readyState,probe:typeof(window as unknown as {probe?:unknown}).probe,body:document.body?.innerHTML.slice(0,1500)})).catch(()=>null)})));throw Error(`Artifact child failed: ${JSON.stringify({states,events:await events(page),diagnostics})}`);}
 const child=outer.childFrames()[0];if(!child)throw Error('Generated child did not load.');
 expect(child.url()).toBe('about:srcdoc');await child.waitForFunction(()=>Boolean((window as unknown as {probe?:unknown}).probe));return child;
}

for(const [name,engine] of [['Chromium',chromium],['WebKit',webkit]] as const){
 it(`${name}: executes opaque child HTML and relays only bounded presentation messages without rebuilding for context`,async()=>{
  const browser=await engine.launch({headless:true});
  try{
   const {page,outer,unexpected,diagnostics}=await fixture(browser),channel=randomUUID(),child=await rendered(page,outer,channel,diagnostics),url=child.url();
   expect(await outer.evaluate(()=>[document.documentElement,document.body,document.querySelector('iframe')!].map(element=>getComputedStyle(element).backgroundColor))).toEqual(['rgb(0, 0, 0)','rgb(0, 0, 0)','rgb(0, 0, 0)']);
   await child.locator('#counter').click();
   await host(page,{type:'context',channel,context:{appearance:'dark',display:'expanded',font:'serif'}});
   await expect.poll(()=>child.evaluate(()=>(window as unknown as {probe:{contexts:unknown[]}}).probe.contexts.at(-1))).toEqual({appearance:'dark',display:'expanded',font:'serif'});
   expect(await outer.evaluate(()=>[document.documentElement,document.body,document.querySelector('iframe')!].map(element=>getComputedStyle(element).backgroundColor))).toEqual(['rgb(28, 27, 27)','rgb(28, 27, 27)','rgb(28, 27, 27)']);
   await host(page,{type:'render',channel,html:childHtml(channel)});
   expect(child.url()).toBe(url);expect(await child.locator('#counter').textContent()).toBe('1');
   const before=(await events(page)).length;
   await page.evaluate(channel=>document.querySelector<HTMLIFrameElement>('#shell')!.contentWindow!.postMessage({source:'newdrugs-artifact-document',channel,type:'error',message:'wrong sender'},'*'),channel);
   await child.evaluate(({channel})=>{
    const send=(value:Record<string,unknown>)=>parent.postMessage({source:'newdrugs-artifact-document',channel,...value},'*');
    send({type:'execute',operation:'files.delete',input:{fileId:'private'}});send({type:'error',channel:'wrong-channel',message:'wrong channel'});
    send({type:'editable-focus',active:'not-a-boolean'});send({type:'resize',height:Infinity});send({type:'resize',height:20001});send({type:'link',href:'javascript:alert(1)'});
    parent.postMessage({source:'newdrugs-artifact-host',type:'render',channel,html:'<p>takeover</p>'},'*');
    send({type:'editable-focus',active:true,privateData:'never-forward'});send({type:'resize',height:123.2,privateData:'never-forward'});send({type:'escape',privateData:'never-forward'});send({type:'link',href:'/posts/example',privateData:'never-forward'});send({type:'link',href:'https://outbound.invalid/request-only',privateData:'never-forward'});send({type:'error',message:'x'.repeat(500),privateData:'never-forward'});
   },{channel});
   await expect.poll(async()=>(await events(page)).length).toBe(before+4);
   const relayed=(await events(page)).slice(before);
   expect(relayed).toEqual([
    {source:'newdrugs-artifact-frame',channel,type:'editable-focus',active:true},
    {source:'newdrugs-artifact-frame',channel,type:'resize',height:124},
    {source:'newdrugs-artifact-frame',channel,type:'escape'},
    {source:'newdrugs-artifact-frame',channel,type:'error',message:'x'.repeat(300)},
   ]);
   await host(page,{type:'context',channel,context:{appearance:'light',command:'delete'}});
   expect(await child.evaluate(()=>(window as unknown as {probe:{contexts:unknown[]}}).probe.contexts.at(-1))).toEqual({appearance:'dark',display:'expanded',font:'serif'});
   await host(page,{type:'render',channel:randomUUID(),html:'é'.repeat(ARTIFACT_FRAME_MAX_BYTES/2+1)});
   await expect.poll(async()=>(await events(page)).at(-1)?.type).toBe('error');
   expect(child.url()).toBe(url);expect(await child.locator('#counter').textContent()).toBe('1');expect(unexpected).toEqual([]);
  }finally{await browser.close();}
 },60000);

 it(`${name}: loads external resources, fetches and workers while app DOM, cookies and top navigation stay isolated`,async()=>{
  const browser=await engine.launch({headless:true});
  try{
   const {page,outer,unexpected,diagnostics}=await fixture(browser),child=await rendered(page,outer,randomUUID(),diagnostics);
   const result=await child.evaluate(async resource=>{
    const blocked=(read:()=>unknown)=>{try{read();return false;}catch{return true;}};
    let cookies=true;try{cookies=!document.cookie.includes('app-secret=private');document.cookie='artifact-cookie=forbidden; Path=/';}catch{}
    const guards={parentDom:blocked(()=>parent.document),appDom:blocked(()=>top!.document),cookies,storage:blocked(()=>localStorage.getItem('app-secret'))};
    const data=await fetch(`${resource}/data.json`).then(response=>response.json());
    await new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src=`${resource}/script.js`;script.onload=()=>resolve();script.onerror=reject;document.head.appendChild(script);});
    await new Promise<void>((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href=`${resource}/style.css`;link.onload=()=>resolve();link.onerror=reject;document.head.appendChild(link);});
    const text=document.createElement('p');text.className='external-style';text.textContent='External font';document.body.appendChild(text);await document.fonts.load('16px ExternalNoto');
    const image=new Image();image.src=`${resource}/image.png`;document.body.appendChild(image);await image.decode();
    const worker=await new Promise<string>((resolve,reject)=>{const url=URL.createObjectURL(new Blob(['postMessage("worker ready")'],{type:'text/javascript'})),worker=new Worker(url);worker.onmessage=event=>{worker.terminate();URL.revokeObjectURL(url);resolve(event.data);};worker.onerror=reject;});
    try{parent.location.href=`${resource}/parent-navigation`;}catch{}try{top!.location.href=`${resource}/top-navigation`;}catch{}
    return {guards,data,script:(window as unknown as {externalScriptLoaded:boolean}).externalScriptLoaded,color:getComputedStyle(text).color,font:document.fonts.check('16px ExternalNoto'),image:image.naturalWidth,worker,evaluation:new Function('return 7')()};
   },resourceOrigin);
   expect(result).toEqual({guards:{parentDom:true,appDom:true,cookies:true,storage:true},data:{value:7},script:true,color:'rgb(12, 34, 56)',font:true,image:2,worker:'worker ready',evaluation:7});
   const cookies=await page.evaluate(()=>document.cookie);expect(cookies).toContain('app-secret=private');expect(cookies).not.toContain('artifact-cookie=forbidden');
   expect(unexpected).toEqual(expect.arrayContaining(['/data.json','/script.js','/style.css','/font.woff2','/image.png'].map(path=>resourceOrigin+path)));expect(unexpected.some(url=>/parent-navigation|top-navigation/.test(url))).toBe(false);expect(page.url()).toBe(`${origin}/`);
  }finally{await browser.close();}
 },60000);

 it(`${name}: keeps ordinary links, new tabs, downloads and forms native inside the sandbox`,async()=>{
  const browser=await engine.launch({headless:true});
  try{
   const {context,page,outer,diagnostics}=await fixture(browser),child=await rendered(page,outer,randomUUID(),diagnostics);
   await child.evaluate(resource=>{document.body.insertAdjacentHTML('beforeend',`<a id="popup" href="${resource}/popup" target="_blank">Popup</a><a id="download" href="${resource}/download" download>Download</a><a id="same" href="${resource}/navigation">Navigate</a>`);},resourceOrigin);
   const [popup]=await Promise.all([context.waitForEvent('page'),child.locator('#popup').click()]);await popup.waitForURL(`${resourceOrigin}/popup`);expect(await popup.locator('#destination').textContent()).toBe('GET destination');await popup.close();
   await child.evaluate(()=>{const link=document.querySelector<HTMLAnchorElement>('#download')!;link.href=URL.createObjectURL(new Blob(['Artifact download'],{type:'text/plain'}));link.download='artifact.txt';});
   const [download]=await Promise.all([page.waitForEvent('download',{timeout:5000}),child.locator('#download').click()]);expect(download.suggestedFilename()).toBe('artifact.txt');
   await child.locator('#same').click();await child.waitForURL(`${resourceOrigin}/navigation`);expect(page.url()).toBe(`${origin}/`);expect((await events(page)).some(event=>event.type==='error')).toBe(false);
   const next=await rendered(page,outer,randomUUID(),diagnostics);
   await next.evaluate(resource=>document.body.insertAdjacentHTML('beforeend',`<form action="${resource}/form" method="post"><input name="value" value="7"><button id="submit">Submit</button></form>`),resourceOrigin);
   await next.locator('#submit').click();await next.waitForURL(`${resourceOrigin}/form`);expect(await next.locator('#destination').textContent()).toBe('POST destination');expect(page.url()).toBe(`${origin}/`);
  }finally{await browser.close();}
 },60000);

 it(`${name}: rejects cross-origin embedding before the shell can initialize`,async()=>{
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage(),foreign='https://foreign-frame.invalid';
   await page.route('**/*',async route=>{
    const url=route.request().url();
    if(url===`${foreign}/`)return route.fulfill({contentType:'text/html',body:`<!doctype html><iframe id="shell" src="${origin}/api/artifacts/frame"></iframe><script>window.artifactEvents=[];addEventListener('message',event=>window.artifactEvents.push(event.data));</script>`});
    return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':ARTIFACT_FRAME_CSP,'X-Frame-Options':'SAMEORIGIN'},body:buildArtifactFrameDocument()});
   });
   await page.goto(foreign);
   await host(page,{type:'render',channel:randomUUID(),html:'<script>parent.postMessage({source:"newdrugs-artifact-document",type:"ready"},"*")</script>'});
   await page.waitForTimeout(100);
   expect(await events(page)).toEqual([]);
   const shell=page.frames().find(frame=>frame!==page.mainFrame());
   if(shell)expect(await shell.content()).not.toContain('newdrugs-artifact-host');
  }finally{await browser.close();}
 },60000);
}
