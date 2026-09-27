import * as snapshots from '../src/logEntryCache';
import * as calendarModel from '../src/logCalendarModel';
import {cacheLogEntry,cachedLogEntry,bindLogEntryCache,clearLogEntries} from '../src/logEntryCache';
import {swipeTodayPresentation} from '../src/LogTodayCards';
// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {LogEditor,LogDetail} from '../src/LogPanel';
import {SocialExperience} from '../src/SocialExperience';
import {LogScanPanel} from '../src/LogJoining';
import {PanelVisibilityContext} from '../src/PanelReadiness';
import {ApiError} from '../src/api';
import {parseLogCode} from '../shared/logJoining';
import {setupDOM} from './dom';
const mocks=vi.hoisted(()=>({operation:vi.fn(),start:vi.fn().mockResolvedValue(undefined),stop:vi.fn(),destroy:vi.fn(),scanImage:vi.fn(),decode:null as null|((result:{data:string})=>void)}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:mocks.operation}));
vi.mock('qr-scanner',()=>({default:class{static scanImage=mocks.scanImage;start=mocks.start;stop=mocks.stop;destroy=mocks.destroy;constructor(_video:unknown,decode:typeof mocks.decode){mocks.decode=decode;}}}));
vi.mock('qrcode',()=>({default:{toDataURL:vi.fn().mockResolvedValue('data:image/png;base64,fixture')}}));
const user={id:'me',handle:'me',name:'Me',bio:'',city:'',interests:[],discoverable:false};
const entry={id:'entry',ownerId:'me',date:new Date().toLocaleDateString('en-CA'),title:'Walk',place:'Park',links:[],recurrence:'none',coverFileId:null,revision:1,createdAt:'2026-09-27T00:00:00Z',updatedAt:'2026-09-27T00:00:00Z',membership:'member',contributors:[{userId:'me',name:'Me',note:'A memory',files:[]}],invitations:[]};
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();clearLogEntries();Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value(){this.setAttribute('open','');}});Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value(){this.removeAttribute('open');}});vi.clearAllMocks();mocks.operation.mockImplementation(async(name,input)=>name==='log.preferences'?{arrangement:'calendar',views:[]}:name==='log.neighbors'?{previous:null,next:null}:name==='log.get'?entry:name==='log.contacts'?{items:[{id:'friend',name:'Sam',handle:'sam',sharedHangouts:1}],nextCursor:null}:name==='log.list'?{items:input.recurring?[]:[entry],nextCursor:null}:{items:[],nextCursor:null});});
afterEach(()=>dom.cleanup());
const button=(text:string)=>[...dom.container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text)!;
it('keeps calendar DOM and scroll under the entry overlay and floats actions outside the scroller',async()=>{
 const props={mode:'log' as const,active:true,data:{user,messages:[]} as any,reset:0,dockOpen:false,chatBusy:false,onRoute:vi.fn(),globalNavigate:vi.fn(),openAgent:vi.fn(),signup:vi.fn(),discuss:vi.fn(),example:vi.fn(),openMessage:vi.fn()};
 await act(async()=>dom.root.render(createElement(SocialExperience,props)));
 const calendar=dom.container.querySelector('.log-calendar-history')!,scroller=calendar.closest<HTMLElement>('.composer-view')!;scroller.scrollTop=420;
 expect(dom.container.querySelector('.mode-content-header')).toBeNull();expect(button('Scan').closest('.composer-view')).toBeNull();expect(dom.container.querySelectorAll('.log-today-card')).toHaveLength(1);const header=dom.container.querySelector<HTMLButtonElement>('.log-fixed-weekdays button')!;expect(header.closest('.composer-view')).toBeNull();scroller.scrollTo=vi.fn();await act(async()=>header.click());expect(scroller.scrollTo).toHaveBeenCalledWith({top:0,behavior:'smooth'});
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('.log-today-card')!.click());expect(calendar.isConnected).toBe(true);expect(scroller.hasAttribute('inert')).toBe(true);expect(scroller.scrollTop).toBe(420);expect(dom.container.querySelector('.log-modal[data-open=true] .log-detail')).not.toBeNull();expect(button('Code')).toBeTruthy();expect(button('Invite')).toBeUndefined();
 const detail=dom.container.querySelector('.log-detail');await act(async()=>dom.root.render(createElement(SocialExperience,{...props,covered:true})));expect(dom.container.querySelector('.log-modal[data-open=true] .log-detail')).toBe(detail);expect(scroller.scrollTop).toBe(420);await act(async()=>dom.root.render(createElement(SocialExperience,{...props,covered:false})));expect(dom.container.querySelector('.log-modal[data-open=true] .log-detail')).toBe(detail);
 await act(async()=>button('Close').click());expect(scroller.hasAttribute('inert')).toBe(false);expect(scroller.scrollTop).toBe(420);expect(dom.container.querySelector('.log-calendar-history')).toBe(calendar);
});
it('retries a partially saved people selection without creating a duplicate hangout, then clears the new draft',async()=>{
 const saved=vi.fn();let fail=true;
 const original=mocks.operation.getMockImplementation()!;mocks.operation.mockImplementation(async(name,input,options)=>{
  if(name==='log.create')return entry;
  if(name==='log.add_person'){if(fail){fail=false;throw Error('Connection interrupted');}return {...entry,revision:2,contributors:[...entry.contributors,{userId:'friend',name:'Sam',note:'',files:[]}]};}
  return original(name,input,options);
 });
 await act(async()=>dom.root.render(createElement(LogEditor,{user,onSaved:saved,cancel:vi.fn()})));
 await act(async()=>button('people').click());await act(async()=>dom.container.querySelector<HTMLButtonElement>('.log-contact-picker button')!.click());
 const form=dom.container.querySelector('form')!;await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(saved).not.toHaveBeenCalled();expect(dom.container.textContent).toContain('Connection interrupted');
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(mocks.operation.mock.calls.filter(c=>c[0]==='log.create')).toHaveLength(1);expect(mocks.operation.mock.calls.filter(c=>c[0]==='log.update')).toHaveLength(0);
 const adds=mocks.operation.mock.calls.filter(c=>c[0]==='log.add_person');expect(adds).toHaveLength(2);expect(adds[0][2]).toEqual(adds[1][2]);expect(adds[0][2].confirmed).toBe(true);expect(saved).toHaveBeenCalledOnce();expect((dom.container.querySelector('[aria-label="Your note"]') as HTMLTextAreaElement).value).toBe('');
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(mocks.operation.mock.calls.filter(c=>c[0]==='log.create')).toHaveLength(2);
});
it('parses only New Drugs join codes and canonical join links',()=>{
 const code='a'.repeat(32);for(const value of [code,`https://druggie.org/log/join/${code}`,`http://localhost:7330/log/join/${code}`])expect(parseLogCode(value,'http://localhost:7330')).toBe(code);
 for(const value of [`https://evil.test/log/join/${code}`,`https://secret@druggie.org/log/join/${code}`,'javascript:alert(1)','https://druggie.org/people/someone'])expect(parseLogCode(value,'http://localhost:7330')).toBeNull();
});
it('stops the camera after one recognized scan and destroys it when the panel hides',async()=>{
 vi.stubGlobal('navigator',{...navigator,mediaDevices:{getUserMedia:vi.fn()}});const navigate=vi.fn(),close=vi.fn();
 const render=(visible:boolean)=>createElement(PanelVisibilityContext.Provider,{value:visible},createElement(LogScanPanel,{navigate,close}));
 await act(async()=>dom.root.render(render(true)));expect(mocks.start).toHaveBeenCalledOnce();
 await act(async()=>{mocks.decode!({data:'https://evil.test'});});expect(navigate).not.toHaveBeenCalled();
 await act(async()=>{mocks.decode!({data:'a'.repeat(32)});mocks.decode!({data:'a'.repeat(32)});});expect(navigate).toHaveBeenCalledExactlyOnceWith({view:'log_join',resourceId:'a'.repeat(32)});expect(mocks.stop).toHaveBeenCalledOnce();
 await act(async()=>dom.root.render(render(false)));expect(mocks.destroy).toHaveBeenCalledOnce();
});

it('shows the empty personal log prompt without blank contribution headers',async()=>{
 const blank={...entry,title:'',place:'',contributors:[{userId:'me',name:'Me',handle:'me',note:'   ',files:[]}]};
 const original=mocks.operation.getMockImplementation()!;mocks.operation.mockImplementation(async(name,...args)=>name==='log.get'?blank:original(name,...args));
 await act(async()=>dom.root.render(createElement(LogDetail,{entryId:entry.id,user,navigate:vi.fn()})));
 expect(dom.container.querySelectorAll('.log-contribution')).toHaveLength(1);expect(dom.container.querySelector('.log-empty-contribution .log-author')?.textContent).toBe('me');expect(dom.container.querySelector('.log-add-note')?.textContent).toBe('tap to add log');expect(dom.container.querySelector('.log-with')?.textContent).toContain('me');
 await act(async()=>button('tap to add log').click());expect(dom.container.querySelector('.log-editor')).not.toBeNull();
});

it.each([{title:'Dinner'},{place:'Park'},{links:['https://freshman.dev']},{recurrence:'anniversary'},{contributors:[{userId:'me',name:'Me',note:'',files:[{id:'photo',mime:'image/webp',url:'/photo',name:'Photo'}]}]},{contributors:[{userId:'me',name:'Me',note:'',files:[]},{userId:'friend',name:'Friend',note:'',files:[]}]}])('does not nag for a note when the hangout already contains information: %j',async info=>{
 const saved={...entry,title:'',place:'',contributors:[{userId:'me',name:'Me',note:'',files:[]}],...info},original=mocks.operation.getMockImplementation()!;mocks.operation.mockImplementation(async(name,...args)=>name==='log.get'?saved:original(name,...args));await act(async()=>dom.root.render(createElement(LogDetail,{entryId:entry.id,user,navigate:vi.fn()})));expect(dom.container.querySelector('.log-add-note')).toBeNull();
});

it('swipes between full cards and left/right squares without capturing vertical scrolling',()=>{expect(swipeTodayPresentation('full',-50,0)).toBe('left');expect(swipeTodayPresentation('full',50,0)).toBe('right');expect(swipeTodayPresentation('left',50,0)).toBe('full');expect(swipeTodayPresentation('right',-50,0)).toBe('full');expect(swipeTodayPresentation('full',10,70)).toBe('full');expect(swipeTodayPresentation('full',20,0)).toBe('full');});

it('renders a prefetched neighboring hangout before its refresh finishes',async()=>{
 const next={...entry,id:'next-entry',title:'Next hangout'},original=mocks.operation.getMockImplementation()!;
 mocks.operation.mockImplementation(async(name,input,...args)=>name==='log.neighbors'?{previous:null,next}:name==='log.get'&&input.entryId===next.id?new Promise(()=>{}):original(name,input,...args));
 await act(async()=>dom.root.render(createElement(LogDetail,{key:entry.id,entryId:entry.id,user,navigate:vi.fn()})));
 await act(async()=>dom.root.render(createElement(LogDetail,{key:next.id,entryId:next.id,user,navigate:vi.fn()})));
 expect(dom.container.querySelector('.log-detail h2')?.textContent).toBe('Next hangout');expect(dom.container.querySelector('.log-loading')).toBeNull();
});

it('returns from QR-origin scanning to its QR code and Close returns through previous screens',async()=>{
 const props={mode:'log' as const,active:true,data:{user,messages:[]} as any,reset:0,dockOpen:false,chatBusy:false,onRoute:vi.fn(),globalNavigate:vi.fn(),openAgent:vi.fn(),signup:vi.fn(),discuss:vi.fn(),example:vi.fn(),openMessage:vi.fn()};
 const original=mocks.operation.getMockImplementation()!;mocks.operation.mockImplementation(async(name,...args)=>name==='log.code'?{entryId:entry.id,code:'a'.repeat(32),url:'https://druggie.org/log/join/'+ 'a'.repeat(32)}:original(name,...args));
 await act(async()=>dom.root.render(createElement(SocialExperience,props)));await act(async()=>dom.container.querySelector<HTMLButtonElement>('.log-today-card')!.click());
 const activeButton=(label:string)=>[...dom.container.querySelectorAll<HTMLButtonElement>('.log-modal[data-open=true] button')].find(button=>button.textContent===label)!;
 await act(async()=>activeButton('Code').click());expect(dom.container.querySelector('.log-modal[data-open=true] .log-code')).not.toBeNull();
 await act(async()=>activeButton('Scan').click());expect(dom.container.querySelector('.log-modal[data-open=true] .log-scan')).not.toBeNull();
 await act(async()=>activeButton('Cancel').click());expect(dom.container.querySelector('.log-modal[data-open=true] .log-code')).not.toBeNull();
 await act(async()=>activeButton('Back').click());expect(dom.container.querySelector('.log-modal[data-open=true] .log-detail')).not.toBeNull();await act(async()=>activeButton('Close').click());expect(dom.container.querySelector('.log-modal[data-open=true]')).toBeNull();expect(dom.container.querySelector('.composer-view:not([hidden]) .log-browser')).not.toBeNull();
});

it('replaces the active hangout on Older/Newer so Close does not walk through neighbors',async()=>{
 const next={...entry,id:'next',title:'Next hangout'},route=vi.fn(),original=mocks.operation.getMockImplementation()!;mocks.operation.mockImplementation(async(name,input,...args)=>name==='log.neighbors'?{previous:null,next}:name==='log.get'&&input.entryId==='next'?next:original(name,input,...args));
 await act(async()=>dom.root.render(createElement(SocialExperience,{mode:'log',active:true,data:{user,messages:[]} as any,reset:0,dockOpen:false,chatBusy:false,onRoute:route,globalNavigate:vi.fn(),openAgent:vi.fn(),signup:vi.fn(),discuss:vi.fn(),example:vi.fn(),openMessage:vi.fn()})));await act(async()=>dom.container.querySelector<HTMLButtonElement>('.log-day:not([data-future])')!.click());await act(async()=>dom.container.querySelector<HTMLButtonElement>('.log-modal[data-open=true] [aria-label="Next entry"]')!.click());
 expect(route.mock.lastCall?.[2]).toMatchObject({replace:true,stack:[{view:'log'},{view:'log',resourceId:'next'}]});await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('.log-modal[data-open=true] button')].find(button=>button.textContent==='Close')!.click());expect(dom.container.querySelector('.log-modal[data-open=true]')).toBeNull();
});

it('shows selected details before the request resolves and immediately replaces them with fresh data',async()=>{
 cacheLogEntry(user.id,entry as any);let resolve!:(value:any)=>void;const original=mocks.operation.getMockImplementation()!;mocks.operation.mockImplementation((name,...args)=>name==='log.get'?new Promise(done=>{resolve=done;}):original(name,...args));
 await act(async()=>dom.root.render(createElement(LogDetail,{entryId:entry.id,user,navigate:vi.fn()})));expect(dom.container.querySelector('.log-detail h2')?.textContent).toBe('Walk');expect(button('Edit').disabled).toBe(true);expect(mocks.operation.mock.calls.some(c=>c[0]==='log.get')).toBe(true);
 await act(async()=>resolve({...entry,revision:2,title:'Updated remotely',contributors:[{...entry.contributors[0],note:'Fresh note'}]}));expect(dom.container.querySelector('.log-detail h2')?.textContent).toBe('Updated remotely');expect(dom.container.textContent).toContain('Fresh note');expect(button('Edit').disabled).toBe(false);
});
it('drops a cached hangout immediately when the server says it is no longer accessible',async()=>{
 cacheLogEntry(user.id,entry as any);mocks.operation.mockImplementation(async(name)=>{if(name==='log.get')throw new ApiError('Unavailable','not_found',404);return {previous:null,next:null};});await act(async()=>dom.root.render(createElement(LogDetail,{entryId:entry.id,user,navigate:vi.fn()})));expect(dom.container.querySelector('.log-detail')).toBeNull();expect(dom.container.textContent).toContain('Unavailable');expect(cachedLogEntry(user.id,entry.id)).toBeNull();
});
it('opens and closes without rebuilding the calendar or waiting for details',async()=>{
 bindLogEntryCache(user.id);const weeks=vi.spyOn(calendarModel,'logCalendarWeeks'),original=mocks.operation.getMockImplementation()!;mocks.operation.mockImplementation((name,...args)=>name==='log.get'?new Promise(()=>{}):original(name,...args));
 await act(async()=>dom.root.render(createElement(SocialExperience,{mode:'log',active:true,data:{user,messages:[]} as any,reset:0,dockOpen:false,chatBusy:false,onRoute:vi.fn(),globalNavigate:vi.fn(),openAgent:vi.fn(),signup:vi.fn(),discuss:vi.fn(),example:vi.fn(),openMessage:vi.fn()})));
 const calendar=dom.container.querySelector('.log-calendar-history'),first=dom.container.querySelector('[data-week]'),before=weeks.mock.calls.length;
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('.log-today-card')!.click());expect(dom.container.querySelector('.log-modal[data-open=true] .log-detail h2')?.textContent).toBe('Walk');expect(weeks).toHaveBeenCalledTimes(before);
 await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('.log-modal[data-open=true] button')].find(b=>b.textContent==='Close')!.click());expect(dom.container.querySelector('.log-modal[data-open=true]')).toBeNull();expect(dom.container.querySelector('.log-calendar-history')).toBe(calendar);expect(dom.container.querySelector('[data-week]')).toBe(first);expect(weeks).toHaveBeenCalledTimes(before);
});

it('does not let a late disk snapshot replace the response already displayed',async()=>{
 let disk!:(value:any)=>void,fresh!:(value:any)=>void;vi.spyOn(snapshots,'readCachedLogEntry').mockImplementation(()=>new Promise(resolve=>{disk=resolve;}));const original=mocks.operation.getMockImplementation()!;mocks.operation.mockImplementation((name,...args)=>name==='log.get'?new Promise(resolve=>{fresh=resolve;}):original(name,...args));
 await act(async()=>dom.root.render(createElement(LogDetail,{entryId:entry.id,user,navigate:vi.fn()})));
 await act(async()=>fresh({...entry,revision:2,title:'Fresh response'}));await act(async()=>disk(entry));expect(dom.container.querySelector('.log-detail h2')?.textContent).toBe('Fresh response');
});
it('ignores a delayed response for the previously opened entry',async()=>{
 let old!:(value:any)=>void;const next={...entry,id:'next',title:'Next'},original=mocks.operation.getMockImplementation()!;mocks.operation.mockImplementation((name,input,...args)=>name==='log.get'?input.entryId===entry.id?new Promise(resolve=>{old=resolve;}):Promise.resolve(next):original(name,input,...args));
 await act(async()=>dom.root.render(createElement(LogDetail,{entryId:entry.id,user,navigate:vi.fn()})));await act(async()=>dom.root.render(createElement(LogDetail,{entryId:next.id,user,navigate:vi.fn()})));await act(async()=>old(entry));expect(dom.container.querySelector('.log-detail h2')?.textContent).toBe('Next');
});

it('keeps an image and voice note in their own editor areas without duplicating the photo',async()=>{
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
 const mediaEntry={...entry,contributors:[{...entry.contributors[0],files:[{id:'photo',name:'Photo',mime:'image/webp',url:'/photo'},{id:'audio',name:'Recording.weba',mime:'audio/webm',url:'/voice'}]}]};
 await act(async()=>dom.root.render(createElement(LogEditor,{entry:mediaEntry as any,user,cancel:vi.fn(),onSaved:vi.fn()})));
 expect(dom.container.querySelectorAll('.log-editor-preview img')).toHaveLength(1);
 expect(dom.container.querySelector('.log-editor-files')).toBeNull();
 expect(dom.container.querySelector('.log-voice-notes audio')?.getAttribute('src')).toBe('/voice');
 expect(dom.container.querySelector('.log-voice-notes')?.textContent).toBe('Play voice noteRemove');
 expect(dom.container.querySelector('.log-note-input')!.compareDocumentPosition(dom.container.querySelector('.log-voice-notes')!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('[aria-label="Remove voice note Recording.weba"]')!.click());
 expect(dom.container.querySelectorAll('.log-editor-preview img')).toHaveLength(1);expect(dom.container.querySelector('.log-voice-notes')?.textContent).toBe('Record voice note');
});
