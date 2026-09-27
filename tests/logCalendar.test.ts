// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Temporal} from '@js-temporal/polyfill';
import {LogCalendar} from '../src/LogCalendar';
import {logWeekStart,logCalendarRange,logCalendarWeeks,logWeekMonth} from '../src/logCalendarModel';
import {PanelVisibilityContext} from '../src/PanelReadiness';
import {setupDOM} from './dom';
const api=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:api.operation}));
let dom:ReturnType<typeof setupDOM>,observers:{fire():void;active:boolean;rootMargin?:string}[];
beforeEach(()=>{dom=setupDOM();observers=[];api.operation.mockReset().mockResolvedValue({items:[],nextCursor:null});vi.stubGlobal('IntersectionObserver',class{record={active:true,rootMargin:'',fire:()=>{if(this.record.active)this.callback([{isIntersecting:true}]);}};constructor(private callback:Function,options:IntersectionObserverInit){this.record.rootMargin=options.rootMargin||'';observers.push(this.record);}observe(){}disconnect(){this.record.active=false;}});});
afterEach(()=>dom.cleanup());
const props={scope:'all' as const,query:'',jump:vi.fn(),create:vi.fn(),open:vi.fn()};
async function mount(){await act(async()=>dom.root.render(createElement('div',{className:'composer-view'},createElement(LogCalendar,props))));}
const edge=()=>observers.findLast(observer=>observer.active)!;
it('uses consecutive descending Sunday weeks across leap days and year boundaries',()=>{const anchor=logWeekStart(Temporal.PlainDate.from('2024-03-02'));expect(anchor.toString()).toBe('2024-02-25');const first=logCalendarRange(anchor,0),second=logCalendarRange(anchor,52);expect(Temporal.PlainDate.from(second.through).add({days:1}).toString()).toBe(first.from);expect(logCalendarWeeks(anchor,156)).toHaveLength(156);expect(logCalendarWeeks(anchor,156).at(-1)!.until(anchor).days).toBe(155*7);});
it('keeps scrolling through empty years and appends without replacing existing week nodes or scroll',async()=>{await mount();const weeks=()=>[...dom.container.querySelectorAll<HTMLElement>('[data-week]')];expect(dom.container.querySelector('[data-week-count]')?.getAttribute('data-week-count')).toBe('52');expect(weeks().length).toBeLessThan(40);const first=weeks()[0],scroller=dom.container.querySelector<HTMLElement>('.composer-view')!;scroller.scrollTop=1234;await act(async()=>edge().fire());expect(dom.container.querySelector('[data-week-count]')?.getAttribute('data-week-count')).toBe('104');expect(weeks().length).toBeLessThan(40);expect(weeks()[0]).toBe(first);expect(scroller.scrollTop).toBe(1234);await act(async()=>edge().fire());expect(dom.container.querySelector('[data-week-count]')?.getAttribute('data-week-count')).toBe('156');expect(weeks().length).toBeLessThan(40);const ranges=api.operation.mock.calls.filter(call=>call[0]==='log.list').map(call=>call[1]).filter(input=>!input.recurring);expect(ranges).toHaveLength(3);expect(Temporal.PlainDate.from(ranges[1].through).add({days:1}).toString()).toBe(ranges[0].from);});
it('finishes all pages in a year before advancing the date range and guards duplicate edge callbacks',async()=>{let resolve!:(value:any)=>void;api.operation.mockImplementation((name,input)=>name==='log.birthdays'?Promise.resolve({items:[]}):input.recurring?Promise.resolve({items:[],nextCursor:null}):input.before?new Promise(done=>{resolve=done;}):Promise.resolve({items:[],nextCursor:'page-two'}));await mount();expect(api.operation.mock.calls.filter(call=>call[0]==='log.list'&&!call[1].recurring)).toHaveLength(2);await act(async()=>resolve({items:[],nextCursor:null}));const current=edge();let finish!:(value:any)=>void;api.operation.mockImplementation(()=>new Promise(done=>{finish=done;}));await act(async()=>{current.fire();current.fire();});expect(api.operation.mock.calls.filter(call=>call[0]==='log.list')).toHaveLength(4);await act(async()=>finish({items:[],nextCursor:null}));expect(dom.container.querySelector('[data-week-count]')?.getAttribute('data-week-count')).toBe('104');});
it('makes occupied days one mosaic target and opens a chooser for multiple entries',async()=>{const date=Temporal.Now.plainDateISO().toString();const entry=(id:string)=>({id,date,title:id,recurrence:'none',contributors:[{name:'Me',note:'note',files:[]}],createdAt:'2026-01-01T00:00:00Z'});api.operation.mockImplementation((name,input)=>Promise.resolve({items:name==='log.birthdays'||input.recurring?[]:[entry('one'),entry('two')],nextCursor:null}));await mount();const day=dom.container.querySelector<HTMLButtonElement>('.log-day:has(.log-day-mosaic)')!;expect(day.querySelectorAll('.log-day-mosaic>span')).toHaveLength(2);expect(day.querySelector('button')).toBeNull();await act(async()=>day.click());expect(dom.container.querySelector('.log-day-picker')?.textContent).toContain('one');expect(dom.container.querySelector('.log-day-picker')?.textContent).toContain('two');});

it('shows a birthday marker and opens that person without creating a synthetic hangout',async()=>{const date=Temporal.Now.plainDateISO().add({days:1}),openPerson=vi.fn();api.operation.mockImplementation(async(name)=>name==='log.birthdays'?{items:[{personId:'friend',name:'Friend',month:date.month,day:date.day}]}:{items:[],nextCursor:null});await act(async()=>dom.root.render(createElement('div',{className:'composer-view'},createElement(LogCalendar,{...props,openPerson}))));const button=[...dom.container.querySelectorAll<HTMLButtonElement>('.log-day')].find(button=>button.getAttribute('aria-label')?.includes("Friend's birthday"))!;expect(button).toBeTruthy();await act(async()=>button.click());expect(openPerson).toHaveBeenCalledWith('friend');expect(api.operation.mock.calls.some(call=>call[0]==='log.create')).toBe(false);});

it('prefetches older weeks a viewport ahead and updates the threshold on resize',async()=>{
 await mount();const scroller=dom.container.querySelector<HTMLElement>('.composer-view')!;Object.defineProperty(scroller,'clientHeight',{value:800,configurable:true});dom.resize(scroller);expect(edge().rootMargin).toBe('0px 0px 800px 0px');Object.defineProperty(scroller,'clientHeight',{value:500,configurable:true});dom.resize(scroller);expect(edge().rootMargin).toBe('0px 0px 500px 0px');
});
it('uses only the owner birthday year for the Logcal age margin',async()=>{
 api.operation.mockImplementation(async(name)=>name==='log.birthday_get'?{birthday:{month:5,day:31,year:2000}}:{items:[],nextCursor:null});await act(async()=>dom.root.render(createElement('div',{className:'composer-view'},createElement(LogCalendar,{...props,month:'2026-05'}))));expect(dom.container.querySelector('.log-week-right[aria-label="26 years"]')?.textContent).toBe('26');expect(dom.container.querySelector('.log-week-right[aria-label="25 years, 9 months"]')?.textContent).toBe('3/4');
});

it('labels the new month on its first-day week instead of the last-day week',()=>{
 const day=(value:string)=>Temporal.PlainDate.from(value);expect(logWeekMonth(day('2026-09-27'))?.toString()).toBe('2026-10-01');expect(logWeekMonth(day('2026-02-22'))).toBeNull();expect(logWeekMonth(day('2026-03-01'))?.month).toBe(3);expect(logWeekMonth(day('2026-12-27'))?.toString()).toBe('2027-01-01');expect(logWeekMonth(day('2026-10-11'))).toBeNull();
});

it('refreshes the changed entry instead of refetching all loaded calendar history',async()=>{
 const date=Temporal.Now.plainDateISO().toString(),entry={id:'changed',date,title:'Original',recurrence:'none',membership:'member',contributors:[{name:'Me',note:'',files:[]}],invitations:[],createdAt:'2026-01-01T00:00:00Z'};
 api.operation.mockImplementation(async(name,input)=>name==='log.get'?{...entry,title:'Updated'}:name==='log.list'?{items:input.recurring?[]:[entry],nextCursor:null}:name==='log.birthday_get'?{birthday:null}:{items:[]});
 await mount();const lists=api.operation.mock.calls.filter(call=>call[0]==='log.list').length;
 await act(async()=>{window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:{keys:['log'],log:[{id:'changed',date}]}}));await new Promise(resolve=>setTimeout(resolve,100));});
 expect(api.operation).toHaveBeenCalledWith('log.get',{entryId:'changed'});
 expect(api.operation.mock.calls.filter(call=>call[0]==='log.list')).toHaveLength(lists);
 expect(dom.container.querySelector('.log-day[aria-label$="Updated"]')).toBeTruthy();
 await act(async()=>{window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:{keys:['log'],log:[{id:'changed',date,deleted:true}]}}));await new Promise(resolve=>setTimeout(resolve,100));});
 expect(dom.container.querySelector('.log-day-mosaic')).toBeNull();
});
