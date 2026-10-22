import {chromium,webkit,type Browser,type Frame,type Locator,type Page} from '@playwright/test';
import {expect,it} from 'vitest';
import {mkdir} from 'node:fs/promises';
import {ARTIFACT_FRAME_CSP,buildArtifactFrameDocument} from '../server/artifactFrame';
import type {PublicArtifactDetail,ArtifactDetail} from '../shared/artifacts';
import type {Bootstrap} from '../shared/types';

// Uses the user's already-running Vite. It never launches a server, calls a
// provider, or writes to the cloud API. All app data is synthetic and routed.
const run=it.skipIf(process.env.ARTIFACT_BROWSER_TEST!=='1');
const origin='http://127.0.0.1:7330',id='e189505a-9797-4c51-af56-bf7dd2abc449',now='2026-10-22T00:00:00.000Z';
const doc:PublicArtifactDetail={id,title:'Weekend distances',bodyHtml:`<style>h3{margin:0 0 16px;font-size:20px}.bars{display:flex;align-items:end;gap:12px;height:120px;margin:12px 0}.bar{background:#73b6ff;border-radius:5px 5px 0 0;flex:1;text-align:center;color:#092947;padding:6px}button{padding:8px 12px;border:1px solid currentColor;border-radius:10px;color:inherit;background:transparent}input{max-width:100%;display:block;margin-top:12px}</style><h3>Weekend distances</h3><div class="bars" id="bars"></div><button id="counter">0</button><input aria-label="Graph note" placeholder="A note"><script>document.getElementById('bars').innerHTML=data.values.map((value,i)=>'<div class="bar" style="height:'+value*10+'px">'+value+' mi</div>').join('');let count=0;document.getElementById('counter').onclick=()=>document.getElementById('counter').textContent=String(++count);</script>`,data:{values:[5,9,7]},assets:[],revision:1,contentRevision:1,updatedAt:now,contentUpdatedAt:now};
const owner:ArtifactDetail={...doc,assets:[],ephemeral:true,refreshInstruction:'Update the distances from the latest user-supplied values.',hasRefreshInstruction:true,createdAt:now,dataUpdatedAt:now,producer:{kind:'hosted',name:'Agent'}};
async function fixture(browser:Browser,{mobile=false,dark=false,owned=true,historyCount=0}:{mobile?:boolean;dark?:boolean;owned?:boolean;historyCount?:number}={}){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,colorScheme:dark?'dark':'light',serviceWorkers:'block'}),page=await context.newPage(),requests:{path:string;search:string;method:string;body:unknown;status?:number}[]=[],errors:string[]=[];
 // Playwright's service-worker block shim touches this forbidden property in
 // opaque frames; these exact messages come from fixture instrumentation.
 const blockedWorkerErrors=new Set(["Service Worker is disabled because the context is sandboxed and lacks the 'allow-same-origin' flag","Failed to read the 'serviceWorker' property from 'Navigator': Service worker is disabled because the context is sandboxed and lacks the 'allow-same-origin' flag."]);
 page.on('pageerror',error=>{if(!blockedWorkerErrors.has(error.message))errors.push(error.message);});
 await page.addInitScript(({dark})=>{if(window!==window.top)return;localStorage.setItem('nd-appearance',dark?'dark':'light');Object.defineProperty(window,'EventSource',{value:undefined,configurable:true});},{dark});
 const bootstrap:Bootstrap={user:{id:'test-viewer',handle:'test',name:'Test viewer',city:'',bio:'',interests:[],discoverable:false},wallet:{balanceNanos:1e9,reservedNanos:0,availableNanos:1e9,entries:[]},preferences:{appearance:dark?'dark':'light',font:'mono',landingPage:'agent',revision:1},messages:[...Array.from({length:historyCount},(_,i)=>({id:`history-${i}`,role:'assistant' as const,text:`Earlier message ${i}. Context stays in the conversation.`,createdAt:now,source:'app' as const})),{id:'artifact-message',role:'assistant',text:'Here is the graph.',artifacts:[{artifactId:id,title:doc.title,presentation:'inline',presentedRevision:1}],createdAt:now,source:'app'}],config:{aiEnabled:true,paymentsEnabled:false,development:true,model:'test',version:'0.65.12'}};
 let current=structuredClone(doc),currentOwner=structuredClone(owner),deleted=false;
 const versions=new Map([[doc.contentRevision,structuredClone(doc)]]),legacyContentRevision=doc.contentRevision;
 const selected=(version:string|null)=>version===null?current:version==='legacy'?versions.get(legacyContentRevision):/^[1-9][0-9]*$/.test(version)&&Number.isSafeInteger(Number(version))?versions.get(Number(version)):undefined;
 const update=(value:Partial<PublicArtifactDetail>)=>{
  const changed=['bodyHtml','data','assets'].some(key=>key in value&&JSON.stringify(value[key as keyof PublicArtifactDetail])!==JSON.stringify(current[key as keyof PublicArtifactDetail]));
  const revision=current.revision+1,updatedAt=new Date(Date.parse(now)+revision*1000).toISOString();
  current={...current,...value,id,revision,contentRevision:current.contentRevision+Number(changed),updatedAt,contentUpdatedAt:changed?updatedAt:current.contentUpdatedAt};
  currentOwner={...currentOwner,...current,assets:[],dataUpdatedAt:value.data!==undefined?updatedAt:currentOwner.dataUpdatedAt};
  if(changed)versions.set(current.contentRevision,structuredClone(current));
  return structuredClone(current);
 };
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;let body:unknown;try{body=request.postDataJSON();}catch{}const entry={path,search:url.search,method:request.method(),body,status:200};requests.push(entry);
  const json=(value:unknown,status=200)=>{entry.status=status;return route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});};
  if(path==='/api/artifacts/frame')return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':ARTIFACT_FRAME_CSP,'Referrer-Policy':'no-referrer'},body:buildArtifactFrameDocument()});
  if(path===`/api/artifacts/${id}`||path===`/api/artifacts/${id}/state`){const value=selected(url.searchParams.get('version'));return deleted||!value?json({error:{message:'Gone',code:'not_found'}},404):json(path.endsWith('/state')?{id,revision:value.revision,contentRevision:value.contentRevision,updatedAt:value.updatedAt,assets:value.assets.map(asset=>({id:asset.id,sha256:asset.sha256}))}:value);}
  if(path==='/api/bootstrap')return json(bootstrap);
  if(path==='/api/operations/artifacts.get'){if(!owned)return json({error:{message:'Not yours',code:'forbidden'}},403);const version=(body as {contentRevision?:number|'legacy'}|undefined)?.contentRevision,value=selected(version===undefined?null:String(version));return deleted||!value?json({error:{message:'Gone',code:'not_found'}},404):json({data:version===undefined?currentOwner:{...currentOwner,...value,assets:[]}});}
  if(path==='/api/operations/artifacts.list')return json({data:{items:currentOwner.ephemeral?[]:[currentOwner],nextCursor:null}});
  if(path==='/api/operations/artifacts.update'){const patch=body as Partial<ArtifactDetail>;currentOwner={...currentOwner,...patch};update(Object.fromEntries(Object.entries(patch).filter(([key])=>['title','bodyHtml','data','assets'].includes(key))));return json({data:currentOwner});}
  if(path==='/api/operations/artifacts.delete'){deleted=true;return json({data:{deleted:true,artifactId:id}});}
  if(path==='/api/calls/incoming')return json({call:null});
  if(path==='/api/chat')return json({run:{id:'refresh-run',status:'completed',draft:'',progress:[],approvals:[],clientId:'test',revision:1}});
  if(path.startsWith('/api/operations/'))return json({data:{items:[],people:[],nextCursor:null}});
  return json({ok:true});
 });
 return {context,page,requests,errors,bootstrap,update,remove:()=>{deleted=true;}};
}
async function child(page:Page){await page.locator('.artifact-frame-document').waitFor();await expect.poll(()=>page.frames().filter(frame=>frame.url()==='about:srcdoc').length,{timeout:20000}).toBe(1);const frame=page.frames().find(frame=>frame.url()==='about:srcdoc')!;await frame.locator('#counter').waitFor();return frame;}
async function childOf(slot:Locator){
 await slot.locator('.artifact-frame-document').waitFor();const outer=await slot.locator('.artifact-frame-document').elementHandle(),shell=(await outer!.contentFrame())!;
 await expect.poll(()=>shell.childFrames().filter(frame=>frame.url()==='about:srcdoc').length,{timeout:20000}).toBe(1);
 const frame=shell.childFrames().find(frame=>frame.url()==='about:srcdoc')!;await frame.locator('#counter').waitFor();return frame;
}
for(const [name,engine] of [['Chromium',chromium],['WebKit',webkit]] as const){
 run(`${name}: anonymous bearer URL renders without session/bootstrap and closes to the app`,async()=>{
  const browser=await engine.launch();try{
   const {page,requests,errors}=await fixture(browser,{owned:false,mobile:true});await page.goto(`${origin}/artifacts/${id}`);const frame=await child(page);expect(await frame.locator('.bar').count()).toBe(3);
   expect(requests.some(request=>['/api/bootstrap','/api/session','/api/chat'].includes(request.path))).toBe(false);expect(await page.locator('[aria-label="Artifact actions"]').count()).toBe(0);
   expect(await page.locator('dialog[open]').boundingBox()).toMatchObject({x:0,y:0,width:390,height:844});expect(errors).toEqual([]);
   await page.getByRole('button',{name:'Close artifact',exact:true}).click();await page.locator('#thought').waitFor();expect(new URL(page.url()).pathname).toBe('/');
  }finally{await browser.close();}
 },60000);
 run(`${name}: inline/full-screen/Close/Back preserve the same interactive document and draft`,async()=>{
  const browser=await engine.launch();try{
   const {page,errors}=await fixture(browser,{historyCount:10});await page.goto(origin);const frame=await child(page);await page.locator('#thought').fill('Keep this draft');await frame.locator('#counter').click();
   const original=await page.locator('.artifact-frame-document').elementHandle();await page.getByRole('link',{name:'Open full screen'}).click();await page.locator('dialog[open]').waitFor();
   expect(await frame.locator('#counter').textContent()).toBe('1');expect(await original!.evaluate(element=>element===document.querySelector('.artifact-frame-document'))).toBe(true);
   await page.getByRole('button',{name:'Close artifact',exact:true}).click();await expect.poll(()=>new URL(page.url()).pathname).toBe('/');expect(await frame.locator('#counter').textContent()).toBe('1');expect(await page.locator('#thought').inputValue()).toBe('Keep this draft');
   await page.getByRole('link',{name:'Open full screen'}).click();await page.locator('dialog[open]').waitFor();await page.goBack();await expect.poll(()=>page.locator('dialog[open]').count()).toBe(0);const restored=await child(page);expect(await restored.locator('#counter').textContent()).toBe('1');expect(errors).toEqual([]);
  }finally{await browser.close();}
 },60000);
}
run('mobile and desktop theme layouts, library visibility and exact refresh handoff',async()=>{
 const browser=await chromium.launch();try{
  await mkdir('/tmp/newdrugs-artifacts',{recursive:true});
  for(const mobile of [false,true])for(const dark of [false,true]){
   const {page,context,requests}=await fixture(browser,{mobile,dark});await page.goto(origin);await child(page);await page.locator('#thought').fill('My unrelated draft');
   await page.screenshot({path:`/tmp/newdrugs-artifacts/${mobile?'mobile':'desktop'}-${dark?'dark':'light'}-inline.png`});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.getByRole('link',{name:'Open full screen'}).click();await page.locator('dialog[open]').waitFor();await page.getByLabel('Artifact actions').click();await page.getByRole('button',{name:'Save to Artifacts',exact:true}).click({timeout:5000}).catch(async error=>{await page.screenshot({path:'/tmp/newdrugs-artifacts/menu-failure.png'});throw Error(String(error)+' '+await page.locator('dialog[open]').innerText());});
   await page.getByLabel('Artifact actions').click();await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect.poll(()=>requests.filter(request=>request.path==='/api/chat').length).toBe(1);
   const chat=requests.find(request=>request.path==='/api/chat')?.body as {recordRefs:unknown[]};expect(chat.recordRefs).toEqual([{kind:'artifact',id,revision:2}]);expect(await page.locator('#thought').inputValue()).toBe('My unrelated draft');
   await page.getByRole('link',{name:'Open full screen'}).click();await page.locator('dialog[open]').waitFor();await page.screenshot({path:`/tmp/newdrugs-artifacts/${mobile?'mobile':'desktop'}-${dark?'dark':'light'}-expanded.png`});
   await page.getByRole('button',{name:'Close artifact',exact:true}).click();await page.getByRole('button',{name:'Open New Drugs',exact:true}).click();await page.getByRole('link',{name:'Artifacts',exact:true}).click();await page.locator('.artifact-list-row').filter({hasText:'Weekend distances'}).waitFor();
   await context.close();
  }
 }finally{await browser.close();}
},120000);
run('tall inline artifacts expand in place with Show more left and full-screen right',async()=>{
 const browser=await chromium.launch();try{
  for(const mobile of [false,true]){
   const {page,context,update,bootstrap}=await fixture(browser,{mobile});const tall=update({bodyHtml:doc.bodyHtml+'<div style="height:900px;padding-top:80px">More graph details</div>'});bootstrap.messages.at(-1)!.artifacts![0].contentRevision=tall.contentRevision;
   await page.goto(origin);const frame=await child(page);
   const slot=page.locator('.artifact-inline'),surface=slot.locator('.artifact-surface'),toggle=slot.getByRole('button',{name:'Show more',exact:true}),link=slot.getByRole('link',{name:'Open full screen'});
   expect(await slot.getAttribute('data-artifact-version')).toBe(String(tall.contentRevision));
   await expect.poll(()=>slot.evaluate(node=>Number.parseFloat((node as HTMLElement).style.getPropertyValue('--artifact-content-height')))).toBeGreaterThan(1100);
   await toggle.waitFor();expect((await surface.boundingBox())!.height).toBe(mobile?256:512);
   expect(await frame.evaluate(()=>{const root=globalThis.document.scrollingElement!;root.scrollTop=100;return root.scrollTop;})).toBe(100);
   const left=(await toggle.boundingBox())!,right=(await link.boundingBox())!,bounds=(await slot.boundingBox())!;
   expect(left.x).toBeCloseTo(bounds.x,0);expect(right.x+right.width).toBeCloseTo(bounds.x+bounds.width,0);expect(right.x).toBeGreaterThan(left.x+left.width);
   const iframe=await slot.locator('.artifact-frame-document').elementHandle();await toggle.click();await expect.poll(async()=>(await surface.boundingBox())!.height).toBeGreaterThan(1100);
   expect(await iframe!.evaluate(element=>element===document.querySelector('.artifact-frame-document'))).toBe(true);
   await page.screenshot({path:`/tmp/newdrugs-artifacts/${mobile?'mobile':'desktop'}-show-less.png`});
   await slot.getByRole('button',{name:'Show less',exact:true}).click();await expect.poll(async()=>(await surface.boundingBox())!.height).toBe(mobile?256:512);
   await page.screenshot({path:`/tmp/newdrugs-artifacts/${mobile?'mobile':'desktop'}-show-more.png`});
   await context.close();
  }
 }finally{await browser.close();}
},60000);

run('saved and legacy chat versions stay fixed while the canonical viewer follows the latest content',async()=>{
 const browser=await chromium.launch();try{
  const {page,bootstrap,requests,errors,update,remove}=await fixture(browser);
  await page.setViewportSize({width:1440,height:1400});
  const second=update({data:{values:[4,8]}});
  bootstrap.messages.push(...[1,second.contentRevision].map(contentRevision=>({id:`version-${contentRevision}`,role:'assistant' as const,text:`Saved version ${contentRevision}.`,source:'app' as const,createdAt:now,artifacts:[{artifactId:id,title:doc.title,presentation:'inline' as const,presentedRevision:contentRevision,contentRevision}]})));
  await page.goto(origin);
  const legacy=page.locator('[data-message-id="artifact-message"] .artifact-inline'),one=page.locator('[data-message-id="version-1"] .artifact-inline'),two=page.locator('[data-message-id="version-2"] .artifact-inline');
  const firstFrames:Frame[]=[];
  for(const slot of [legacy,one,two]){await slot.scrollIntoViewIfNeeded();firstFrames.push(await childOf(slot));}
  expect(await firstFrames[0].locator('.bar').count()).toBe(3);expect(await firstFrames[1].locator('.bar').count()).toBe(3);expect(await firstFrames[2].locator('.bar').count()).toBe(2);
  expect(requests.filter(request=>request.path===`/api/artifacts/${id}`).map(request=>request.search)).toEqual(expect.arrayContaining(['?version=legacy','?version=1','?version=2']));
  await firstFrames[1].locator('#counter').click();
  const third=update({data:{values:[2,3,5,8]}});expect(third.contentRevision).toBe(3);
  await page.evaluate(id=>window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:{keys:['artifacts'],artifacts:[{id}]}})),id);
  await expect.poll(()=>requests.filter(request=>request.path===`/api/artifacts/${id}/state`).length).toBeGreaterThan(0);
  for(let index=0;index<firstFrames.length;index++)expect(await firstFrames[index].locator('.bar').count()).toBe(index===2?2:3);
  expect(await firstFrames[1].locator('#counter').textContent()).toBe('1');
  await one.getByRole('link',{name:'Open full screen'}).click();await page.locator('dialog[open]').waitFor();
  expect(new URL(page.url()).searchParams.get('version')).toBe('1');expect(await firstFrames[1].locator('.bar').count()).toBe(3);
  await page.locator('dialog[open]').getByRole('link',{name:'Latest version',exact:true}).click();
  await expect.poll(()=>new URL(page.url()).search).toBe('');
  const latest=await childOf(page.locator('.artifact-standalone'));
  expect(await latest.locator('.bar').count()).toBe(4);
  await page.getByRole('button',{name:'Close artifact',exact:true}).click();await expect.poll(()=>new URL(page.url()).pathname).toBe('/');await expect.poll(()=>page.locator('dialog[open]').count()).toBe(0);
  await one.getByRole('link',{name:'Open full screen'}).click();await page.locator('dialog[open]').getByRole('link',{name:'Latest version',exact:true}).click();
  expect(await (await childOf(page.locator('.artifact-standalone'))).locator('.bar').count()).toBe(4);
  remove();await page.evaluate(id=>window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:{keys:['artifacts'],artifacts:[{id,deleted:true}]}})),id);
  await expect.poll(()=>page.locator('.artifact-frame-document').count()).toBe(0);
  expect(await page.locator('.artifact-inline').count()).toBe(3);
  for(const slot of [legacy,one,two])expect(await slot.textContent()).toContain('This artifact is no longer available.');
  expect(errors).toEqual([]);
 }finally{await browser.close();}
},60000);
