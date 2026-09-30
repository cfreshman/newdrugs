// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Temporal} from '@js-temporal/polyfill';
import {LogCalendar} from '../src/LogCalendar';
import {PanelVisibilityContext} from '../src/PanelReadiness';
import {setupDOM,rect} from './dom';
const api=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:api.operation}));
let dom:ReturnType<typeof setupDOM>;
const date=Temporal.Now.plainDateISO().toString();
const entries=[{id:'one',date,title:'One',createdAt:'2026-01-01T01:00:00Z',cover:null,contributors:[{name:'Me',files:[]}]},{id:'two',date,title:'Two',createdAt:'2026-01-01T02:00:00Z',cover:null,contributors:[{name:'Friend',files:[]}]}];
const open=vi.fn(),create=vi.fn();
beforeEach(()=>{dom=setupDOM();vi.clearAllMocks();Object.defineProperties(HTMLElement.prototype,{showPopover:{configurable:true,value:vi.fn(function(this:HTMLElement){this.dataset.topLayer='true';})},hidePopover:{configurable:true,value:vi.fn(function(this:HTMLElement){delete this.dataset.topLayer;})}});api.operation.mockImplementation(async(name,input)=>{
 if(name==='log.calendar'){const first=Temporal.PlainDate.from(input.from);return {days:Array.from({length:first.until(Temporal.PlainDate.from(input.through)).days+1},(_,i)=>{const day=first.add({days:i}).toString();return {date:day,items:day===date?entries:[],more:false};}),indexing:false};}
 return {items:name==='log.list'&&input.calendarDay===date?entries:[],nextCursor:null};
});});
afterEach(()=>{dom.cleanup();delete (HTMLElement.prototype as any).showPopover;delete (HTMLElement.prototype as any).hidePopover;});
async function mount(visible=true){await act(async()=>dom.root.render(createElement('div',{className:'app'},createElement('div',{className:'mode-main'},createElement('div',{className:'composer-view'},createElement(PanelVisibilityContext.Provider,{value:visible},createElement(LogCalendar,{scope:'all',query:'',jump:vi.fn(),open,create})))))));}
const layer=()=>dom.container.querySelector<HTMLDialogElement>('.log-day-layer')!;
const arrow=(label:string)=>layer().querySelector<HTMLButtonElement>(`[aria-label="${label} day"]`)!;
const pick=async()=>act(async()=>dom.container.querySelector<HTMLButtonElement>('.log-day:has(.log-day-mosaic)')!.click());
function pointer(node:HTMLElement,type:string,id:number,x:number,y:number){const event=new MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y});Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:'touch'}});act(()=>node.dispatchEvent(event));return event;}

it('opens a centered top-layer chooser outside week rows without moving or rebuilding the calendar',async()=>{
 await mount();const week=dom.container.querySelector('[data-week]'),calendar=dom.container.querySelector('.log-calendar-weeks'),scroller=dom.container.querySelector<HTMLElement>('.composer-view')!;scroller.scrollTop=200;await pick();
 expect(layer().tagName).toBe('DIALOG');expect(layer().open).toBe(true);expect(layer().dataset.topLayer).toBe('true');expect(layer().closest('[data-week]')).toBeNull();expect(layer().querySelectorAll('.log-day-choice')).toHaveLength(2);expect(dom.container.querySelector('[data-week]')).toBe(week);expect(dom.container.querySelector('.log-calendar-weeks')).toBe(calendar);expect(scroller.scrollTop).toBe(200);
 expect(layer().querySelector('[aria-label="Close day"]')).toBeNull();expect(layer().querySelectorAll('.log-choice-placeholder')).toHaveLength(2);await act(async()=>pointer(layer().querySelector<HTMLElement>('.log-day-scrim')!,'pointerdown',1,10,10));expect(layer()).toBeNull();expect(scroller.scrollTop).toBe(200);expect(dom.container.querySelector('[data-week]')).toBe(week);
});
it('keeps both side arrows available on touch layouts and changes one day per action',async()=>{
 await mount();await pick();expect(arrow('Previous').hidden).toBe(false);expect(arrow('Next').hidden).toBe(false);await act(async()=>arrow('Next').click());expect(api.operation.mock.lastCall?.[1].calendarDay).toBe(Temporal.PlainDate.from(date).add({days:1}).toString());await act(async()=>arrow('Previous').click());expect(layer().querySelectorAll('.log-day-choice')).toHaveLength(2);expect(open).not.toHaveBeenCalled();
});
it('swipes from a result row between days and consumes its release click',async()=>{
 await mount();await pick();const node=layer().querySelector<HTMLElement>('.log-day-choice')!;pointer(node,'pointerdown',1,200,100);pointer(node,'pointermove',1,130,102);pointer(node,'pointerup',1,120,102);await act(async()=>{await Promise.resolve();});expect(api.operation.mock.lastCall?.[1].calendarDay).toBe(Temporal.PlainDate.from(date).add({days:1}).toString());const click=new MouseEvent('click',{bubbles:true,cancelable:true});await act(async()=>arrow('Next').dispatchEvent(click));expect(click.defaultPrevented).toBe(true);expect(layer()).toBeTruthy();expect(open).not.toHaveBeenCalled();
});
it('keeps vertical scrolling and two-touch pinch from changing days',async()=>{
 await mount();await pick();const node=layer().querySelector<HTMLElement>('.log-day-choices')!,before=api.operation.mock.calls.length;pointer(node,'pointerdown',1,100,100);pointer(node,'pointermove',1,105,190);pointer(node,'pointerup',1,160,220);expect(api.operation.mock.calls).toHaveLength(before);
 pointer(node,'pointerdown',2,100,100);pointer(node,'pointerdown',3,200,100);pointer(node,'pointerup',2,20,100);pointer(node,'pointerup',3,240,100);expect(api.operation.mock.calls).toHaveLength(before);
});
it('retains the selected day behind an entry and restores it without changing calendar scroll',async()=>{
 await mount();await pick();const dialog=layer();await act(async()=>dialog.querySelector<HTMLAnchorElement>('.log-day-choice')!.click());expect(open.mock.lastCall?.[0].id).toBe('one');expect(open.mock.lastCall?.slice(1)).toEqual([undefined,undefined,undefined]);await mount(false);expect(layer()).toBe(dialog);expect(dialog.open).toBe(false);await mount(true);expect(layer()).toBe(dialog);expect(dialog.open).toBe(true);
});
it('keeps Log another event and passes the browsed date to the editor',async()=>{
 await mount();await pick();await act(async()=>arrow('Previous').click());const link=[...layer().querySelectorAll<HTMLAnchorElement>('a')].find(link=>link.textContent==='Log another event')!;expect(link.href).toContain('/log/new?date=');await act(async()=>link.click());expect(create).toHaveBeenLastCalledWith(Temporal.PlainDate.from(date).subtract({days:1}).toString());
});
it('follows the main panel when side chat shifts it',async()=>{
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return rect(this.closest('.app')?.hasAttribute('data-agent-dock')?300:500,12,680,780);});await mount();await pick();expect(layer().style.left).toBe('500px');await act(async()=>dom.container.querySelector('.app')!.setAttribute('data-agent-dock','true'));expect(layer().style.left).toBe('300px');
});
