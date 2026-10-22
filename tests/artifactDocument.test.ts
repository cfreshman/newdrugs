import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {chromium,webkit,type Browser,type Frame,type Page} from '@playwright/test';
import sharp from 'sharp';
import {expect,it} from 'vitest';
import {buildArtifactDocument,artifactScriptJson,prepareArtifactMarkup} from '../src/artifactDocument';
import {ARTIFACT_FRAME_CSP,ARTIFACT_FRAME_SANDBOX,buildArtifactFrameDocument} from '../server/artifactFrame';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwUMMAYAj4IP8cvlVgcAAAAASUVORK5CYII=';
const frameStyles=readFileSync(new URL('../src/artifactFrame.css',import.meta.url),'utf8');
it('escapes script delimiters and Unicode without changing the JSON data',()=>{
 const data={text:'</script><script>globalThis.attack=true</script> & < > \u2028\u2029'};
 const safe=artifactScriptJson(data);expect(safe).not.toContain('</script>');expect(JSON.parse(safe)).toEqual(data);
 const html=buildArtifactDocument({channel:randomUUID(),bodyHtml:'<p>Static HTML</p>'});
 expect(html.indexOf('globalThis.data=')).toBeLessThan(html.indexOf('<body>'));expect(html).toContain('Static HTML');expect(html).not.toContain('min-height:100%');expect(html).toContain('font-size:max(16px,1em)');
});
it('keeps one image payload for repeated aliases and changes only actual image attributes',()=>{
 const body='<IMG SRC = "nd-asset:first"><img src=nd-asset:second><p data-title=\'src="nd-asset:first"\'>Text</p><script>const src="nd-asset:first";</script>';
 const transformed=prepareArtifactMarkup(body,{first:'image',second:'image'});
 expect(transformed).toContain('<IMG data-nd-asset="first">');expect(transformed).toContain('<img data-nd-asset="second">');expect(transformed).toContain('const src="nd-asset:first"');expect(transformed).toContain('data-title=\'src="nd-asset:first"\'');
 const html=buildArtifactDocument({channel:randomUUID(),bodyHtml:body,assets:{aliases:{first:'image',second:'image'},images:{image:png}}});
 expect(html.split(png)).toHaveLength(2);expect(()=>buildArtifactDocument({channel:randomUUID(),bodyHtml:'<img src="nd-asset:missing">'})).toThrow('unavailable');
 expect(()=>buildArtifactDocument({channel:randomUUID(),bodyHtml:'<p>Image</p>',assets:{aliases:{photo:'image'},images:{image:'https://foreign.invalid/image'}}})).toThrow('invalid image');
});
it('preserves full document attributes, head resources and direct body children while initializing data first',()=>{
 const author='<!DOCTYPE html><html lang="en" dir="rtl" class="custom-root"><head data-author="yes"><base href="https://resources.invalid/files/"><meta http-equiv="content-language" content="en"><link rel="stylesheet" href="theme.css"><script>globalThis.authorData=data.value;</script></head><body class="custom-body" style="display:grid"><main id="direct">Document</main></body></html>';
 const html=buildArtifactDocument({channel:randomUUID(),bodyHtml:author,data:{value:7}});
 expect(html).toContain('<!DOCTYPE html><html lang="en" dir="rtl" class="custom-root"><head data-author="yes">');expect(html).toContain('<body class="custom-body" style="display:grid"><main id="direct">');
 expect(html).toContain('<base href="https://resources.invalid/files/">');expect(html).toContain('<meta http-equiv="content-language" content="en">');expect(html).toContain('<link rel="stylesheet" href="theme.css">');
 expect(html.indexOf('globalThis.data=')).toBeLessThan(html.indexOf('globalThis.authorData='));expect(html).not.toContain('<div id="nd-artifact-content">');
});

type Message={source:string;channel:string;type:string;[key:string]:unknown};
const messages=(page:Page)=>page.evaluate(()=>(window as unknown as {messages:Message[]}).messages);
async function send(page:Page,message:Record<string,unknown>){await page.evaluate(value=>document.querySelector<HTMLIFrameElement>('iframe')!.contentWindow!.postMessage({source:'newdrugs-artifact-host',...value},'*'),message);}
async function fixture(browser:Browser){
 const context=await browser.newContext(),page=await context.newPage(),origin='https://artifact-document.invalid',resource='https://artifact-resources.invalid',unexpected:string[]=[];
 await context.route('**/*',async route=>{
  const url=route.request().url();if(url.startsWith('blob:')||url.startsWith('data:'))return route.continue();
  if(url===`${origin}/`)return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; frame-src 'self'"},body:`<!doctype html><style>:root{--surface:#fff;color-scheme:light}:root[data-theme=dark]{--surface:#1c1b1b;color-scheme:dark}body{background:#fac}${frameStyles}</style><div class="artifact-frame" data-display="inline" style="width:400px;height:500px"><iframe src="/frame" sandbox="${ARTIFACT_FRAME_SANDBOX}" class="artifact-frame-document"></iframe></div><script src="/host.js"></script>`});
  if(url===`${origin}/host.js`)return route.fulfill({contentType:'text/javascript',body:'window.messages=[];addEventListener("message",event=>window.messages.push(event.data));'});
  if(url===`${origin}/frame`)return route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':ARTIFACT_FRAME_CSP},body:buildArtifactFrameDocument()});
  if(url==='https://outside.invalid/read')return route.fulfill({contentType:'text/html',body:'<!doctype html><p>Ordinary destination</p>'});
  if(url===`${resource}/assets/theme.css`)return route.fulfill({contentType:'text/css',body:'body > main{color:rgb(12,34,56)}'});
  if(url===`${resource}/assets/author.js`)return route.fulfill({contentType:'text/javascript',body:'window.headValue=data.value;'});
  if(url===`${resource}/assets/photo.png`||url===`${origin}/api/files/log-photo`)return route.fulfill({contentType:'image/png',body:Buffer.from(png.split(',')[1],'base64')});
  unexpected.push(url);return route.fulfill({status:404,body:''});
 });
 await page.goto(origin);return {context,page,origin,resource,unexpected};
}
for(const [name,engine] of [['Chromium',chromium],['WebKit',webkit]] as const){
 it(`${name}: runs the real document with assets, tokens, input focus and local state intact across context changes`,async()=>{
  const browser=await engine.launch({headless:true});
  try{
   const {page,origin,unexpected}=await fixture(browser),channel=randomUUID(),data={text:'</script> & \u2028\u2029'};
   const body='<p id="value"></p><input aria-label="Value"><button id="counter">0</button><img id="photo" src="nd-asset:photo"><a id="link" href="https://outside.invalid/read">Read</a><a id="hash" href="#value">Top</a><script>globalThis.runs=(globalThis.runs||0)+1;document.getElementById("value").textContent=data.text;document.getElementById("counter").onclick=()=>{const button=document.getElementById("counter");button.textContent=String(Number(button.textContent)+1);};const image=document.createElement("img");image.id="dynamic";image.src="nd-asset:photo";document.body.appendChild(image);</script>';
   const html=buildArtifactDocument({bodyHtml:body,data,channel,assets:{aliases:{photo:'one'},images:{one:png}}});
   await send(page,{type:'render',channel,html,context:{appearance:'light',display:'inline',font:'mono'}});
   await expect.poll(async()=>(await messages(page)).some(message=>message.channel===channel&&message.type==='ready')).toBe(true);
   const child=page.frames().find(frame=>frame.url()==='about:srcdoc') as Frame;
   expect(await child.locator('#value').textContent()).toBe(data.text);
   await child.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth===2));
   const initial=await child.evaluate(()=>({color:getComputedStyle(document.body).color,background:getComputedStyle(document.body).backgroundColor,inputSize:parseFloat(getComputedStyle(document.querySelector('input')!).fontSize),payload:document.getElementById('nd-artifact-payload'),asset:(globalThis as unknown as {artifactAssets:{photo:string}}).artifactAssets.photo,frozen:Object.isFrozen((globalThis as unknown as {artifactAssets:object}).artifactAssets)}));
   expect(initial).toMatchObject({color:'rgb(255, 255, 255)',background:'rgb(0, 0, 0)',payload:null,frozen:true});expect(initial.inputSize).toBeGreaterThanOrEqual(16);expect(initial.asset).toMatch(/^blob:/);
   const shell=page.frames().find(frame=>frame.url()===`${origin}/frame`)!;
   const backing=(frame:Frame)=>frame.evaluate(()=>[document.documentElement,document.body,...document.querySelectorAll('iframe')].map(element=>getComputedStyle(element).backgroundColor));
   expect(await backing(shell)).toEqual(['rgb(0, 0, 0)','rgb(0, 0, 0)','rgb(0, 0, 0)']);
   expect(await page.locator('.artifact-frame-document').evaluate(element=>getComputedStyle(element).backgroundColor)).toBe('rgb(0, 0, 0)');
   const pixel=await sharp(await page.locator('.artifact-frame').screenshot()).extract({left:4,top:480,width:1,height:1}).removeAlpha().raw().toBuffer();expect([...pixel]).toEqual([0,0,0]);
   expect(await child.locator('#photo').getAttribute('src')).toBe(await child.locator('#dynamic').getAttribute('src'));
   expect((await messages(page)).filter(message=>message.type==='resize').every(message=>Number(message.height)<500)).toBe(true);
   await child.locator('#counter').click();await child.locator('input').fill('Keep this');
   await expect.poll(async()=>(await messages(page)).some(message=>message.type==='editable-focus'&&message.active===true)).toBe(true);
   await page.evaluate(()=>{document.documentElement.dataset.theme='dark';document.querySelector<HTMLElement>('.artifact-frame')!.dataset.display='expanded';});
   await send(page,{type:'context',channel,context:{appearance:'dark',display:'expanded',font:'serif'}});
   await expect.poll(()=>child.evaluate(()=>document.documentElement.dataset.font)).toBe('serif');
   expect(await child.locator('#counter').textContent()).toBe('1');expect(await child.locator('input').inputValue()).toBe('Keep this');expect(await child.evaluate(()=>(globalThis as unknown as {runs:number}).runs)).toBe(1);
   expect(await child.evaluate(()=>getComputedStyle(document.body).color)).toBe('rgb(245, 243, 243)');
   expect(await backing(shell)).toEqual(['rgb(28, 27, 27)','rgb(28, 27, 27)','rgb(28, 27, 27)']);
   expect(await child.evaluate(()=>getComputedStyle(document.body).backgroundColor)).toBe('rgb(28, 27, 27)');
   await page.evaluate(()=>{document.documentElement.dataset.theme='light';});
   await send(page,{type:'context',channel,context:{appearance:'light',display:'expanded'}});
   await expect.poll(()=>child.evaluate(()=>getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)');
   expect(await backing(shell)).toEqual(['rgb(255, 255, 255)','rgb(255, 255, 255)','rgb(255, 255, 255)']);
   expect(await child.locator('#counter').textContent()).toBe('1');expect(await child.locator('input').inputValue()).toBe('Keep this');expect(await child.evaluate(()=>(globalThis as unknown as {runs:number}).runs)).toBe(1);
   await child.locator('input').press('Escape');await expect.poll(async()=>(await messages(page)).some(message=>message.type==='escape')).toBe(true);
   const nativeLink=await child.evaluate(()=>{
    const link=document.querySelector<HTMLAnchorElement>('#link')!,hash=document.querySelector<HTMLAnchorElement>('#hash')!,prevented:boolean[]=[];
    // Stop the fake destination only after observing whether the document intercepted it.
    const observe=(event:MouseEvent)=>{if(event.target===link||event.target===hash){prevented.push(event.defaultPrevented);event.preventDefault();}};
    window.addEventListener('click',observe);link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));link.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true}));hash.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));window.removeEventListener('click',observe);
    return {href:link.href,prevented};
   });
   expect(nativeLink).toEqual({href:'https://outside.invalid/read',prevented:[false,false,false]});
   expect((await messages(page)).filter(message=>message.type==='link')).toEqual([]);
   expect((await messages(page)).filter(message=>message.type==='error')).toEqual([]);
   await child.evaluate(()=>{const tall=document.createElement('div');tall.id='tall';tall.style.height='1200px';document.body.appendChild(tall);});
   const latestHeight=async()=>Number((await messages(page)).filter(message=>message.type==='resize').at(-1)?.height||0);
   await expect.poll(latestHeight).toBeGreaterThanOrEqual(1200);const beforeScroll=await latestHeight();
   const scroll=await child.evaluate(async()=>{window.scrollTo(0,100);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));document.getElementById('tall')!.append('Mutation while scrolled');await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return scrollY;});
   expect(scroll).toBeGreaterThanOrEqual(100);expect(await latestHeight()).toBe(beforeScroll);
   await child.evaluate(()=>{document.getElementById('tall')!.style.height='1250px';});await expect.poll(latestHeight).toBe(beforeScroll+50);
   expect(await child.locator('#counter').textContent()).toBe('1');expect(await child.locator('input').inputValue()).toBe('Keep this');
   await child.evaluate(()=>{setTimeout(()=>{throw Error('Visible runtime error');},0);void Promise.reject(Error('Visible promise error'));});
   await expect.poll(async()=>(await messages(page)).filter(message=>message.type==='error').map(message=>message.message)).toEqual(expect.arrayContaining(['Visible promise error']));
   expect((await messages(page)).some(message=>message.type==='error'&&(/Visible runtime error/.test(String(message.message))||message.message==='Script error.'))).toBe(true);
   expect(unexpected).toEqual([]);
   const broken=randomUUID();await send(page,{type:'render',channel:broken,html:buildArtifactDocument({channel:broken,bodyHtml:'<script>throw Error("Initial script failure")</script>'})});
   await expect.poll(async()=>(await messages(page)).some(message=>message.channel===broken&&message.type==='error')).toBe(true);
   expect((await messages(page)).some(message=>message.channel===broken&&message.type==='ready')).toBe(false);
  }finally{await browser.close();}
 },60000);
 it(`${name}: preserves full HTML layout, head scripts and direct image URLs`,async()=>{
  const browser=await engine.launch({headless:true});
  try{
   const {page,origin,resource,unexpected}=await fixture(browser),channel=randomUUID();
   const source=`<!DOCTYPE html><html lang="fr" dir="ltr" class="author-root"><head data-author="yes"><base href="${resource}/assets/"><meta http-equiv="content-language" content="fr"><link rel="stylesheet" href="theme.css"><script src="author.js"></script></head><body class="author-body" style="display:grid;grid-template-columns:1fr"><main id="direct">Full document</main><img id="external-photo" src="photo.png"><img id="log-photo" src="${origin}/api/files/log-photo"><script>window.bodyValue=data.value;</script></body></html>`;
   await send(page,{type:'render',channel,html:buildArtifactDocument({channel,bodyHtml:source,data:{value:7}}),context:{appearance:'light',display:'inline',font:'mono'}});
   await expect.poll(async()=>(await messages(page)).some(message=>message.type==='ready'&&message.channel===channel)).toBe(true);
   const child=page.frames().find(frame=>frame.url()==='about:srcdoc')!;await child.waitForFunction(()=>[...document.images].every(image=>image.complete&&image.naturalWidth===2));
   expect(await child.evaluate(()=>({lang:document.documentElement.lang,dir:document.documentElement.dir,root:document.documentElement.className,head:document.head.dataset.author,body:document.body.className,display:getComputedStyle(document.body).display,color:getComputedStyle(document.querySelector('#direct')!).color,direct:document.querySelector('#direct')!.parentElement===document.body,headValue:(window as unknown as {headValue:number}).headValue,bodyValue:(window as unknown as {bodyValue:number}).bodyValue}))).toEqual({lang:'fr',dir:'ltr',root:'author-root',head:'yes',body:'author-body',display:'grid',color:'rgb(12, 34, 56)',direct:true,headValue:7,bodyValue:7});
   expect(await child.locator('#external-photo').getAttribute('src')).toBe('photo.png');expect(await child.locator('#log-photo').getAttribute('src')).toBe(`${origin}/api/files/log-photo`);expect(unexpected).toEqual([]);expect((await messages(page)).filter(message=>message.type==='error')).toEqual([]);
  }finally{await browser.close();}
 },60000);
}
