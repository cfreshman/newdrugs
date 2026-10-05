// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Temporal} from '@js-temporal/polyfill';
import {LogPanel} from '../src/LogPanel';
import {setupDOM} from './dom';
const api=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:api.operation}));
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();api.operation.mockReset();});afterEach(()=>dom.cleanup());
it('keeps Log blank until the saved Grid or List arrangement is known',async()=>{
 let resolvePreferences!:(value:any)=>void;
 api.operation.mockImplementation((name,input)=>name==='log.preferences'?new Promise(resolve=>{resolvePreferences=resolve;}):name==='log.list'?Promise.resolve({items:[],nextCursor:null}):name==='log.birthdays'?Promise.resolve({items:[]}):name==='log.birthday_get'?Promise.resolve({birthday:null}):Promise.resolve({days:[],indexing:false}));
 await act(async()=>dom.root.render(createElement('div',{className:'composer-view'},createElement(LogPanel,{user:{id:'me',name:'Me'} as any,navigate:vi.fn()}))));
 expect(dom.container.querySelector('.log-retained-calendar,.log-gallery,.log-list')).toBeNull();
 expect(api.operation.mock.calls.some(([name])=>name==='log.calendar')).toBe(false);
 await act(async()=>resolvePreferences({arrangement:'list',todayPresentation:'full',views:[]}));
 expect(dom.container.querySelector('.log-list')).not.toBeNull();
 expect(dom.container.querySelector('.log-retained-calendar:not([hidden])')).toBeNull();
 expect(api.operation.mock.calls.some(([name])=>name==='log.calendar'||name==='log.birthdays'||name==='log.birthday_get')).toBe(false);
});
it('opens Today cards into full Log chronology instead of a Today-only sequence',async()=>{
 const date=Temporal.Now.plainDateISO().toString(),entry={id:'today',ownerId:'me',date,title:'Today',place:'',links:[],recurrence:'none',coverFileId:null,revision:1,createdAt:`${date}T12:00:00Z`,updatedAt:`${date}T12:00:00Z`,cover:null,membership:'member',contributors:[],invitations:[]};
 api.operation.mockImplementation(async(name,input)=>name==='log.preferences'?{arrangement:'calendar',todayPresentation:'full',views:[]}:name==='log.list'?{items:input.from?[entry]:[],nextCursor:null}:name==='log.birthdays'?{items:[]}:name==='log.birthday_get'?{birthday:null}:{days:[],indexing:false});
 const navigate=vi.fn();await act(async()=>dom.root.render(createElement('div',{className:'composer-view'},createElement(LogPanel,{user:{id:'me',name:'Me'} as any,navigate}))));
 await act(async()=>dom.container.querySelector<HTMLAnchorElement>('.log-today-card')!.click());
 expect(navigate.mock.lastCall?.[0]).toEqual({view:'log',resourceId:'today'});
});
it('uses the ordinary three-row Log card for search results',async()=>{
 const entry={id:'shared',ownerId:'me',date:'2026-09-20',title:'A day',place:'',links:[],recurrence:'none',coverFileId:null,revision:1,createdAt:'2026-09-20T12:00:00Z',updatedAt:'2026-09-20T12:00:00Z',cover:null,membership:'member',contributors:[{userId:'me',name:'Me',note:'',files:[]},{userId:'friend',name:'Cyrus Freshman',handle:'cyrus',note:'',files:[]}],invitations:[]};
 api.operation.mockImplementation(async(name)=>name==='log.preferences'?{arrangement:'list',todayPresentation:'full',views:[]}:name==='log.search'?{items:[{entryId:entry.id,title:entry.title,date:entry.date,place:'',snippet:'With Cyrus Freshman',score:1,match:'text',entry}],nextCursor:null,indexing:false,mode:'keyword',notices:[]}:name==='log.list'?{items:[],nextCursor:null}:name==='log.birthdays'?{items:[]}:name==='log.birthday_get'?{birthday:null}:{days:[],indexing:false});
 await act(async()=>dom.root.render(createElement('div',{className:'composer-view'},createElement(LogPanel,{user:{id:'me',name:'Me'} as any,navigate:vi.fn(),initialQuery:'cyrus'}))));
 const row=dom.container.querySelector('.log-search-results .log-list>a')!;
 expect([...row.querySelectorAll('span:last-child > *')].map(node=>node.className||node.tagName.toLowerCase())).toContain('log-list-people');
 expect(row.querySelector('.log-list-people')?.textContent).toBe('Me, Cyrus Freshman');
 expect(row.querySelector('.log-list-preview')).toBeNull();
});
it('reshapes loaded calendar tiles immediately, retaining the calendar and avoiding a second list fetch',async()=>{
 let savedPreferences={arrangement:'calendar',todayPresentation:'full',views:[]};
 const date=Temporal.Now.plainDateISO().toString(),tile={id:'entry',date,title:'A day together',createdAt:'2026-09-27T00:00:00Z',cover:null};let finish!:(page:any)=>void;
 api.operation.mockImplementation(async(name,input)=>{
  if(name==='log.preferences')return savedPreferences;
  if(name==='log.preferences_update'){savedPreferences=input;return input;}
  if(name==='log.calendar'){const first=Temporal.PlainDate.from(input.from);return {days:Array.from({length:first.until(Temporal.PlainDate.from(input.through)).days+1},(_,i)=>{const day=first.add({days:i}).toString();return {date:day,items:day===date?[tile]:[],more:false};}),indexing:false};}
  if(name==='log.list'&&!input.from)return new Promise(resolve=>{finish=resolve;});
  return {items:[],nextCursor:null};
 });
 await act(async()=>dom.root.render(createElement('div',{className:'composer-view'},createElement(LogPanel,{user:{id:'me',name:'Me'} as any,navigate:vi.fn()}))));
 const scroller=dom.container.querySelector<HTMLElement>('.composer-view')!;let scroll=40000;Object.defineProperty(scroller,'scrollTop',{configurable:true,get:()=>dom.container.querySelector('.log-retained-calendar[hidden]')?Math.min(scroll,200):scroll,set:(value:number)=>{scroll=value;}});
 const calendar=dom.container.querySelector('.log-calendar-history'),firstDay=dom.container.querySelector('.log-day');expect(dom.container.querySelector('.log-day-mosaic')).toBeTruthy();
 const click=async(label:string)=>act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('[aria-label="Log view"] button')].find(button=>button.textContent===label)!.click());
 await click('Grid');expect(dom.container.querySelector('.log-gallery')?.textContent).toContain('A day together');expect(dom.container.querySelector('[aria-label="Loading entries"]')).toBeNull();expect(dom.container.querySelector('.log-calendar-history')).toBe(calendar);
 await click('List');expect(dom.container.querySelector('.log-list')?.textContent).toContain('A day together');expect(api.operation.mock.calls.filter(call=>call[0]==='log.list'&&!call[1].from)).toHaveLength(1);
 const requests=api.operation.mock.calls.filter(call=>call[0]==='log.calendar').length;await click('Mosaic');expect(dom.container.querySelector('.log-calendar-history')).toBe(calendar);expect(dom.container.querySelector('.log-day')).toBe(firstDay);expect(scroller.scrollTop).toBe(40000);expect(api.operation.mock.calls.filter(call=>call[0]==='log.calendar')).toHaveLength(requests);
 await act(async()=>finish({items:[],nextCursor:null}));
});

it('opens search in Log options, hides today cards and filters the mounted calendar and Grid',async()=>{
 let preferences={arrangement:'calendar',todayPresentation:'full',views:[]};
 const date=Temporal.Now.plainDateISO().toString(),entry={id:'today',date,title:'Plant day',createdAt:'2026-09-27T00:00:00Z',place:'',contributors:[],links:[],recurrence:'none',coverFileId:null,membership:'member'};
 api.operation.mockImplementation(async(name,input)=>{
  if(name==='log.preferences')return preferences;
  if(name==='log.preferences_update'){preferences=input;return input;}
  if(name==='log.list')return {items:input.from?[entry]:[],nextCursor:null};
  if(name==='log.calendar')return {days:[],indexing:false};
  return {items:[],nextCursor:null};
 });
 const onStateChange=vi.fn();await act(async()=>dom.root.render(createElement('div',{className:'composer-view'},createElement(LogPanel,{user:{id:'me',name:'Me'} as any,navigate:vi.fn(),onStateChange}))));
 const scroller=dom.container.querySelector<HTMLElement>('.composer-view')!,calendar=dom.container.querySelector('.log-calendar-history');scroller.scrollTop=240;
 expect(dom.container.querySelector('.log-today-card')).not.toBeNull();
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('.log-options-toggle')!.click());
 expect(dom.container.querySelector('.log-today-card')).toBeNull();
 const input=dom.container.querySelector<HTMLInputElement>('.log-options input[type=search]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'plant');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>input.closest('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(dom.container.querySelector('.log-calendar-history')).toBe(calendar);expect(scroller.scrollTop).toBe(240);
 expect(api.operation.mock.calls.some(([name,value])=>name==='log.calendar'&&value.query==='plant')).toBe(true);
 await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('[aria-label="Log view"] button')].find(button=>button.textContent==='Grid')!.click());
 expect(api.operation.mock.calls.some(([name,value])=>name==='log.list'&&!value.from&&value.query==='plant')).toBe(true);
 expect(onStateChange).toHaveBeenCalledWith({query:'plant'});
});
it('does not restore older saved layouts over newer optimistic choices',async()=>{
 let initial!:(value:any)=>void,first!:(value:any)=>void,second!:(value:any)=>void,reads=0,writes=0;
 const preferences={arrangement:'list',todayPresentation:'full',views:[]};
 api.operation.mockImplementation(async(name,input)=>{
  if(name==='log.preferences')return ++reads===1?new Promise(resolve=>{initial=resolve;}):preferences;
  if(name==='log.preferences_update')return ++writes===1?new Promise(resolve=>{first=resolve;}):new Promise(resolve=>{second=resolve;});
  return name==='log.calendar'?{days:[],indexing:false}:{items:[],nextCursor:null};
 });
 await act(async()=>dom.root.render(createElement('div',{className:'composer-view'},createElement(LogPanel,{user:{id:'me',name:'Me'} as any,navigate:vi.fn()}))));
 const button=(name:string)=>[...dom.container.querySelectorAll<HTMLButtonElement>('[aria-label="Log view"] button')].find(button=>button.textContent===name)!;
 await act(async()=>button('Grid').click());await act(async()=>initial({...preferences,arrangement:'calendar'}));expect(button('Grid').getAttribute('aria-pressed')).toBe('true');
 await act(async()=>button('List').click());await act(async()=>{window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:['log_preferences']}));await new Promise(resolve=>setTimeout(resolve,100));});expect(button('List').getAttribute('aria-pressed')).toBe('true');
 await act(async()=>first({...preferences,arrangement:'gallery'}));expect(button('List').getAttribute('aria-pressed')).toBe('true');
 await act(async()=>second(preferences));expect(button('List').getAttribute('aria-pressed')).toBe('true');
});

it('evicts a deleted calendar preview from Grid after authoritative refresh',async()=>{
 const dom=setupDOM();let deleted=false;
 let preferences={arrangement:'calendar',todayPresentation:'full',views:[]};
 const date=Temporal.Now.plainDateISO().toString();
 const tile={id:'entry',date,title:'Deleted review fixture',createdAt:'2026-09-27T00:00:00Z',cover:null};
 api.operation.mockImplementation(async(name,input)=>{
  if(name==='log.preferences')return preferences;
  if(name==='log.preferences_update'){preferences=input;return input;}
  if(name==='log.calendar'){const first=Temporal.PlainDate.from(input.from);return {days:Array.from({length:first.until(Temporal.PlainDate.from(input.through)).days+1},(_,i)=>{const day=first.add({days:i}).toString();return {date:day,items:!deleted&&day===date?[tile]:[],more:false};}),indexing:false};}
  if(name==='log.list'&&!input.from&&!deleted)return {items:[{...tile,place:'',contributors:[],links:[],recurrence:'none',coverFileId:null,membership:'member'}],nextCursor:null};
  return {items:[],nextCursor:null};
 });
 try{
  await act(async()=>dom.root.render(createElement('div',{className:'composer-view'},createElement(LogPanel,{user:{id:'me',name:'Me'} as any,navigate:vi.fn()}))));
  await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('[aria-label="Log view"] button')].find(button=>button.textContent==='Grid')!.click());
  expect(dom.container.querySelector('.log-gallery')?.textContent).toContain(tile.title);
  deleted=true;api.operation.mockClear();
  await act(async()=>{window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:{keys:['log'],log:[{id:tile.id,date,deleted:true}]}}));await new Promise(resolve=>setTimeout(resolve,120));});
  expect(api.operation.mock.calls.some(call=>call[0]==='log.list')).toBe(true);
  expect(dom.container.querySelector('.log-gallery')?.textContent).not.toContain(tile.title);
 }finally{dom.cleanup();}
});
