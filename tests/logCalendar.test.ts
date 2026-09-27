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
beforeEach(()=>{dom=setupDOM();observers=[];api.operation.mockReset().mockImplementation(async(name,input)=>name==='log.calendar'?calendarPage(input):{items:[],nextCursor:null});vi.stubGlobal('IntersectionObserver',class{record={active:true,rootMargin:'',fire:()=>{if(this.record.active)this.callback([{isIntersecting:true}]);}};constructor(private callback:Function,options:IntersectionObserverInit){this.record.rootMargin=options.rootMargin||'';observers.push(this.record);}observe(){}disconnect(){this.record.active=false;}});});
afterEach(()=>dom.cleanup());
const props={scope:'all' as const,query:'',jump:vi.fn(),create:vi.fn(),open:vi.fn()};
function calendarPage(input:any,items:any[]=[]){const first=Temporal.PlainDate.from(input.from);return {days:Array.from({length:first.until(Temporal.PlainDate.from(input.through)).days+1},(_,i)=>{const date=first.add({days:i}).toString();return {date,items:items.filter(item=>item.date===date).map(item=>({...item,cover:null})),more:false};}),indexing:false};}
async function mount(){await act(async()=>dom.root.render(createElement('div',{className:'composer-view'},createElement(LogCalendar,props))));}
const edge=()=>observers.findLast(observer=>observer.active)!;
it('uses consecutive descending Sunday weeks across leap days and year boundaries',()=>{const anchor=logWeekStart(Temporal.PlainDate.from('2024-03-02'));expect(anchor.toString()).toBe('2024-02-25');const first=logCalendarRange(anchor,0),second=logCalendarRange(anchor,52);expect(Temporal.PlainDate.from(second.through).add({days:1}).toString()).toBe(first.from);expect(logCalendarWeeks(anchor,156)).toHaveLength(156);expect(logCalendarWeeks(anchor,156).at(-1)!.until(anchor).days).toBe(155*7);});
it('keeps scrolling through empty years and appends without replacing existing week nodes or scroll',async()=>{await mount();const weeks=()=>[...dom.container.querySelectorAll<HTMLElement>('[data-week]')];expect(dom.container.querySelector('[data-week-count]')?.getAttribute('data-week-count')).toBe('52');expect(weeks().length).toBeLessThan(40);const first=weeks()[0],scroller=dom.container.querySelector<HTMLElement>('.composer-view')!;scroller.scrollTop=1234;await act(async()=>edge().fire());expect(dom.container.querySelector('[data-week-count]')?.getAttribute('data-week-count')).toBe('104');expect(weeks().length).toBeLessThan(40);expect(weeks()[0]).toBe(first);expect(scroller.scrollTop).toBe(1234);await act(async()=>edge().fire());expect(dom.container.querySelector('[data-week-count]')?.getAttribute('data-week-count')).toBe('156');expect(weeks().length).toBeLessThan(40);const ranges=api.operation.mock.calls.filter(call=>call[0]==='log.calendar').map(call=>call[1]);expect(ranges.length).toBeLessThan(12);for(const range of ranges)expect(Temporal.PlainDate.from(range.from).until(Temporal.PlainDate.from(range.through)).days).toBeLessThan(42);expect(api.operation.mock.calls.some(call=>call[0]==='log.list')).toBe(false);});
it('does not drain annual pages or all recurring entries to render the calendar',async()=>{await mount();expect(api.operation.mock.calls.some(call=>call[0]==='log.list')).toBe(false);expect(api.operation.mock.calls.filter(call=>call[0]==='log.calendar').length).toBeGreaterThan(0);});
it('makes occupied days one mosaic target and opens a chooser for multiple entries',async()=>{const date=Temporal.Now.plainDateISO().toString();const entry=(id:string)=>({id,date,title:id,recurrence:'none',contributors:[{name:'Me',note:'note',files:[]}],createdAt:'2026-01-01T00:00:00Z'});api.operation.mockImplementation(async(name,input)=>name==='log.calendar'?calendarPage(input,[entry('one'),entry('two')]):{items:name==='log.list'?[entry('one'),entry('two')]:[],nextCursor:null});await mount();const day=dom.container.querySelector<HTMLButtonElement>('.log-day:has(.log-day-mosaic)')!;expect(day.querySelectorAll('.log-day-mosaic>span')).toHaveLength(2);expect(day.querySelector('button')).toBeNull();await act(async()=>day.click());expect(dom.container.querySelector('.log-day-picker')?.textContent).toContain('one');expect(dom.container.querySelector('.log-day-picker')?.textContent).toContain('two');});

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

it('refreshes only affected cached date windows, keeping unrelated history and birthdays',async()=>{
 const date=Temporal.Now.plainDateISO().toString();let title='Original',removed=false;
 api.operation.mockImplementation(async(name,input)=>name==='log.calendar'?calendarPage(input,removed?[]:[{id:'changed',date,title,createdAt:'2026-01-01T00:00:00Z'}]):name==='log.birthday_get'?{birthday:null}:{items:[]});
 await mount();const ranges=()=>api.operation.mock.calls.filter(call=>call[0]==='log.calendar');const count=ranges().length,birthdays=api.operation.mock.calls.filter(call=>call[0]==='log.birthdays').length;title='Updated';
 await act(async()=>{window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:{keys:['log'],log:[{id:'changed',date}]}}));await new Promise(resolve=>setTimeout(resolve,100));});
 expect(ranges()).toHaveLength(count+1);expect(api.operation.mock.calls.filter(call=>call[0]==='log.birthdays')).toHaveLength(birthdays);
 expect(dom.container.querySelector('.log-day[aria-label$="Updated"]')).toBeTruthy();removed=true;
 await act(async()=>{window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:{keys:['log'],log:[{id:'changed',date,deleted:true}]}}));await new Promise(resolve=>setTimeout(resolve,100));});
 expect(dom.container.querySelector('.log-day-mosaic')).toBeNull();
});
it('opens the multi-event chooser immediately from tiles while detail records load',async()=>{
 const date=Temporal.Now.plainDateISO().toString(),previews=[{id:'one',date,title:'First',createdAt:''},{id:'two',date,title:'Second',createdAt:''}];let finish!:(page:any)=>void;
 api.operation.mockImplementation(async(name,input)=>name==='log.calendar'?calendarPage(input,previews):name==='log.list'?new Promise(resolve=>{finish=resolve;}):{items:[]});await mount();
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('.log-day:has(.log-day-mosaic)')!.click());
 const picker=dom.container.querySelector('.log-day-picker')!;expect(picker.textContent).toContain('First');expect(picker.textContent).toContain('Second');expect(picker.querySelector('[aria-label="Loading entries"]')).toBeNull();expect(picker.querySelectorAll('.log-people-placeholder')).toHaveLength(2);
 await act(async()=>picker.querySelector<HTMLButtonElement>('.log-day-choice')!.click());expect(props.open).toHaveBeenCalledWith(expect.objectContaining({id:'one'}),expect.arrayContaining([expect.objectContaining({id:'two'})]),expect.objectContaining({calendarDay:date}),undefined);
 await act(async()=>finish({items:[],nextCursor:null}));
});
