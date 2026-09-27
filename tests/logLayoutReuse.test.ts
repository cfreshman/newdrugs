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
 const requests=api.operation.mock.calls.filter(call=>call[0]==='log.calendar').length;await click('Calendar');expect(dom.container.querySelector('.log-calendar-history')).toBe(calendar);expect(dom.container.querySelector('.log-day')).toBe(firstDay);expect(scroller.scrollTop).toBe(40000);expect(api.operation.mock.calls.filter(call=>call[0]==='log.calendar')).toHaveLength(requests);
 await act(async()=>finish({items:[],nextCursor:null}));
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
