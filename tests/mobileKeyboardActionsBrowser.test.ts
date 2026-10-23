import {chromium,webkit,type Browser,type Page} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {expect,it} from 'vitest';

// Runs the built frontend with synthetic data and a keyboard-sized viewport.
// All requests are intercepted. No local server or real account writes are used.
const run=it.skipIf(process.env.MOBILE_ACTION_BROWSER_TEST!=='1');
const origin='https://newdrugs.test',now='2026-10-23T12:00:00Z';
const user={id:'viewer',handle:'test',name:'Test',city:'',bio:'',interests:[],discoverable:false};
const post={id:'sample-post',userId:'someone',text:'A post',createdAt:now,city:'',likeCount:0,liked:false,replyCount:0,saved:false,author:{name:'Someone',handle:'someone'}};
const entry={id:'sample-entry',ownerId:user.id,date:'2026-10-23',title:'Walk',place:'Park',links:[],recurrence:'none',coverFileId:null,revision:1,createdAt:now,updatedAt:now,membership:'member',contributors:[{userId:user.id,name:user.name,handle:user.handle,note:'Original note',files:[]}],invitations:[]};
async function fixture(browser:Browser,dark=false){
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',colorScheme:dark?'dark':'light'}),page=await context.newPage();
 const requests:{operation:string;input:Record<string,unknown>}[]=[],errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
  Object.defineProperty(window,'EventSource',{value:undefined,configurable:true});
  const viewport=Object.assign(new EventTarget(),{height:844,width:390,offsetTop:0,offsetLeft:0,scale:1});
  Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});
  document.addEventListener('focusin',event=>{
   if(event.target instanceof Element&&event.target.matches('textarea,input:not([type]),input[type="text"]')){viewport.height=500;viewport.dispatchEvent(new Event('resize'));}
  },true);
 });
 const bootstrap={user,wallet:{balanceNanos:1e9,reservedNanos:0,availableNanos:1e9,entries:[]},preferences:{appearance:dark?'dark':'light',font:'mono',landingPage:'agent',revision:1},messages:[],config:{aiEnabled:true,paymentsEnabled:false,development:true,model:'test',version:'0.67.3'}};
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(url.origin!==origin)return route.abort();
  if(path.startsWith('/api/')){
   if(path==='/api/bootstrap')return route.fulfill({json:bootstrap});
   if(path==='/api/calls/active')return route.fulfill({json:{call:null}});
   const name=path.replace('/api/operations/',''),input=route.request().postDataJSON()||{};
   if(path.startsWith('/api/operations/'))requests.push({operation:name,input});
   let data:unknown={items:[],nextCursor:null};
   if(name==='posts.get')data=post;
   if(name==='posts.save')data={...post,saved:true};
   if(name==='posts.create'||name==='log.update')return route.fulfill({status:503,json:{error:{message:'Synthetic action received',code:'fixture'}}});
   if(name==='log.get')data=entry;
   if(name==='log.neighbors')data={previous:null,next:null};
   if(name==='log.preferences')data={arrangement:'calendar',views:[]};
   if(name==='log.calendar')data={days:[],indexing:false};
   return route.fulfill({json:{data}});
  }
  const file=extname(path)?resolve('dist/web','.'+path):resolve('dist/web/index.html');
  const types:Record<string,string>={'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.html':'text/html','.svg':'image/svg+xml','.png':'image/png'};
  try{return route.fulfill({contentType:types[extname(file)]||'application/octet-stream',body:await readFile(file)});}catch{return route.fulfill({status:404,body:''});}
 });
 return {context,page,requests,errors};
}
async function tap(page:Page,selector:string){
 const box=await page.locator(selector).boundingBox();expect(box).not.toBeNull();
 // A physical coordinate tap exposes blur-induced layout shifts that a locator
 // retry or a programmatic click would hide.
 await page.touchscreen.tap(box!.x+box!.width/2,box!.y+box!.height/2);
}
for(const [engineName,engine] of [['Chromium',chromium],['WebKit',webkit]] as const){
 run(`${engineName}: first keyboard-open tap publishes once and keeps the draft on failure`,async()=>{
  const browser=await engine.launch();try{
   for(const dark of [false,true]){
    const {page,context,requests,errors}=await fixture(browser,dark);
    await page.goto(origin+'/compose');await page.getByLabel('New post',{exact:true}).fill('First tap post');await page.locator('.app[data-keyboard-open=true]').waitFor();
    const selector='.post-compose-actions > button.solid',before=await page.locator(selector).boundingBox();
    await tap(page,selector);
    await expect.poll(()=>requests.filter(request=>request.operation==='posts.create').length).toBe(1);
    await page.getByText('Synthetic action received',{exact:true}).waitFor();
    expect(await page.getByLabel('New post',{exact:true}).inputValue()).toBe('First tap post');
    expect(await page.locator(selector).boundingBox()).toEqual(before);
    expect(await page.evaluate(()=>document.activeElement?.id)).toBe('post-text');expect(errors).toEqual([]);
    await mkdir('/tmp/newdrugs-keyboard',{recursive:true});await page.screenshot({path:`/tmp/newdrugs-keyboard/${engineName}-${dark?'dark':'light'}-post.png`});await context.close();
   }
  }finally{await browser.close();}
 },60000);
 run(`${engineName}: first tap saves a post while the reply field is focused`,async()=>{
  const browser=await engine.launch();try{
   const {page,requests,errors}=await fixture(browser);await page.goto(origin+'/posts/'+post.id);
   await page.getByLabel('Your reply',{exact:true}).fill('Unsent reply');await page.locator('.app[data-keyboard-open=true]').waitFor();
   await tap(page,'.post-current button[aria-label="Save post"]');
   await expect.poll(()=>requests.filter(request=>request.operation==='posts.save').length).toBe(1);
   expect(await page.getByLabel('Your reply',{exact:true}).inputValue()).toBe('Unsent reply');
   expect(requests.some(request=>request.operation==='posts.reply')).toBe(false);expect(errors).toEqual([]);
  }finally{await browser.close();}
 },60000);
 run(`${engineName}: first tap saves an edited hangout while typing`,async()=>{
  const browser=await engine.launch();try{
   const {page,requests,errors}=await fixture(browser);await page.goto(origin+'/log/'+entry.id);
   await page.locator('.log-modal[data-open=true]').getByRole('button',{name:'Edit',exact:true}).click();
   await page.getByLabel('Your note',{exact:true}).fill('Changed note');await page.locator('.app[data-keyboard-open=true]').waitFor();
   await tap(page,'.log-modal[data-open=true] .log-editor-footer button.solid');
   await expect.poll(()=>requests.filter(request=>request.operation==='log.update').length).toBe(1);
   expect(requests.find(request=>request.operation==='log.update')?.input).toMatchObject({contribution:{note:'Changed note'}});
   expect(await page.getByLabel('Your note',{exact:true}).inputValue()).toBe('Changed note');expect(errors).toEqual([]);
  }finally{await browser.close();}
 },60000);
}
