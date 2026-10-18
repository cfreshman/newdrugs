// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {Temporal} from '@js-temporal/polyfill';
import {setupDOM} from './dom';
import {useLogClock} from '../src/useLogClock';
import {LogCalendar} from '../src/LogCalendar';
import {LogPanel} from '../src/LogPanel';
import {balanceDigits} from '../src/api';

const api=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:api.operation}));
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{
 dom=setupDOM();vi.useFakeTimers({toFake:['Date','setTimeout','clearTimeout']});
 vi.setSystemTime(new Date(2026,9,14,23,59,59,900));
 api.operation.mockReset().mockImplementation(async(name,input)=>name==='log.calendar'?calendarPage(input):name==='log.preferences'?{arrangement:'calendar',views:[],todayPresentation:'full'}:{items:[],nextCursor:null});
});
afterEach(()=>{dom.cleanup();vi.useRealTimers();});
function calendarPage(input:any,items:any[]=[]){
 const first=Temporal.PlainDate.from(input.from),count=first.until(Temporal.PlainDate.from(input.through)).days+1;
 return {days:Array.from({length:count},(_,i)=>{const date=first.add({days:i}).toString();return {date,items:items.filter(item=>item.date===date),more:false};}),indexing:false};
}
const props={scope:'all' as const,query:'',jump:vi.fn(),create:vi.fn(),open:vi.fn()};
async function calendar(){await act(async()=>dom.root.render(createElement('div',{className:'composer-view'},createElement(LogCalendar,props))));}
function Clock(){const clock=useLogClock();return createElement('span',null,`${clock.day}:${clock.from}`);}

it('advances the empty new day at local midnight without remounting the calendar',async()=>{
 await calendar();const week=dom.container.querySelector('[data-week="2026-10-11"]');
 expect(dom.container.querySelector('[data-today]')?.getAttribute('aria-label')).toContain('OCTOBER 14');
 const before=api.operation.mock.calls.length,initialWindows=api.operation.mock.calls.filter(call=>call[0]==='log.calendar').length;
 await act(async()=>{await vi.advanceTimersByTimeAsync(200);});
 expect(dom.container.querySelector('[data-today]')?.getAttribute('aria-label')).toContain('OCTOBER 15');
 expect(dom.container.querySelector('[data-week="2026-10-11"]')).toBe(week);
 const requests=api.operation.mock.calls.slice(before).filter(call=>call[0]==='log.calendar');
 expect(requests.length).toBeGreaterThan(0);expect(requests.length).toBeLessThanOrEqual(initialWindows);
 expect(new Set(requests.map(([,input])=>`${input.from}:${input.through}`)).size).toBe(requests.length);
 expect(requests.every(call=>call[1].today==='2026-10-15')).toBe(true);
});
it('prepends the new Sunday week while retaining its existing photo nodes',async()=>{
 vi.setSystemTime(new Date(2026,9,17,23,59,59,900));
 const photo={id:'photo',date:'2026-10-17',title:'Photo',createdAt:'',cover:{id:'cover',mime:'image/webp',url:'/retained-photo'}};
 api.operation.mockImplementation(async(name,input)=>name==='log.calendar'?calendarPage(input,[photo]):{items:[]});
 await calendar();const image=dom.container.querySelector('img[src="/retained-photo"]'),week=dom.container.querySelector('[data-week="2026-10-11"]');
 expect(image).not.toBeNull();
 await act(async()=>{await vi.advanceTimersByTimeAsync(200);});
 expect(dom.container.querySelector('[data-week]')?.getAttribute('data-week')).toBe('2026-10-18');
 expect(dom.container.querySelector('[data-today]')?.getAttribute('aria-label')).toContain('OCTOBER 18');
 expect(dom.container.querySelector('[data-week="2026-10-11"]')).toBe(week);
 expect(dom.container.querySelector('img[src="/retained-photo"]')).toBe(image);
 expect(dom.container.querySelector('.composer-view')?.scrollTop).toBe(0);
});
it('keeps the visible history anchored when a new week is inserted',async()=>{
 vi.setSystemTime(new Date(2026,9,17,23,59,59,900));
 vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(500);
 vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(600);
 await calendar();const scroller=dom.container.querySelector<HTMLElement>('.composer-view')!;
 vi.spyOn(scroller,'scrollHeight','get').mockReturnValue(10000);
 scroller.scrollTo=((options:ScrollToOptions)=>{scroller.scrollTop=options.top||0;scroller.dispatchEvent(new Event('scroll'));}) as typeof scroller.scrollTo;
 await act(async()=>{scroller.scrollTop=500;scroller.dispatchEvent(new Event('scroll'));});
 const week=dom.container.querySelector('[data-week="2026-10-11"]')!.parentElement!,before=Number(week.style.transform.match(/translateY\(([^p]+)px\)/)?.[1]);
 await act(async()=>{await vi.advanceTimersByTimeAsync(200);});
 const after=Number(week.style.transform.match(/translateY\(([^p]+)px\)/)?.[1]);
 expect(week.isConnected).toBe(true);expect(after).toBeGreaterThan(before);
 expect(scroller.scrollTop).toBeCloseTo(500+after-before,1);
});
it('catches up after several weeks asleep using bounded visible requests',async()=>{
 await calendar();const before=api.operation.mock.calls.length,initialWindows=api.operation.mock.calls.filter(call=>call[0]==='log.calendar').length;
 await act(async()=>{vi.setSystemTime(new Date(2026,10,8,10));window.dispatchEvent(new Event('pageshow'));});
 expect(dom.container.querySelector('[data-week]')?.getAttribute('data-week')).toBe('2026-11-08');
 expect(dom.container.querySelector('[data-today]')?.getAttribute('aria-label')).toContain('NOVEMBER 8');
 const requests=api.operation.mock.calls.slice(before).filter(call=>call[0]==='log.calendar');
 expect(requests.length).toBeLessThanOrEqual(initialWindows);
 for(const [,input] of requests)expect(Temporal.PlainDate.from(input.from).until(Temporal.PlainDate.from(input.through)).days).toBeLessThan(42);
});
it('refreshes the Today cards at 8am without changing the calendar day',async()=>{
 vi.setSystemTime(new Date(2026,9,18,7,59,59,900));
 const entry=(id:string,date:string)=>({id,date,title:id,place:'',links:[],recurrence:'none',ownerId:'me',revision:1,membership:'member',createdAt:'',updatedAt:'',contributors:[{userId:'me',name:'Me',note:'',files:[]}],invitations:[]});
 const entries=[entry('Yesterday','2026-10-17'),entry('Today','2026-10-18')];
 api.operation.mockImplementation(async(name,input)=>name==='log.preferences'?{arrangement:'calendar',views:[],todayPresentation:'full'}:name==='log.calendar'?calendarPage(input):name==='log.list'?{items:entries.filter(entry=>entry.date>=input.from&&entry.date<=input.through),nextCursor:null}:{items:[],nextCursor:null});
 const user={id:'me',handle:'me',name:'Me',bio:'',city:'',cityKey:'',interests:[],photos:[],discoverable:false};
 await act(async()=>dom.root.render(createElement('div',{className:'composer-view'},createElement(LogPanel,{user,navigate:vi.fn()}))));
 expect(dom.container.querySelectorAll('.log-today-card')).toHaveLength(2);
 await act(async()=>{await vi.advanceTimersByTimeAsync(200);});
 expect(dom.container.querySelectorAll('.log-today-card')).toHaveLength(1);
 expect(dom.container.querySelector('.log-today-card')?.textContent).toContain('Today');
});
it('checks a changed local date on focus without waiting for an old timer',async()=>{
 await act(async()=>dom.root.render(createElement(Clock)));
 await act(async()=>{vi.setSystemTime(new Date(2026,9,20,9));window.dispatchEvent(new Event('focus'));});
 expect(dom.container.textContent).toBe('2026-10-20:2026-10-20');
});
it('pads dollars while retaining cents, rounding, negatives and larger balances',()=>{
 expect(balanceDigits(1e9)).toBe('01.00');expect(balanceDigits(1.23e9)).toBe('01.23');
 expect(balanceDigits(1)).toBe('00.01');expect(balanceDigits(-1.23e9)).toBe('-01.23');
 expect(balanceDigits(123.45e9)).toBe('123.45');expect(balanceDigits(1234.56e9)).toBe('1,234.56');
});
