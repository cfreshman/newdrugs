// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {LogEditor} from '../src/LogPanel';
import {SocialExperience} from '../src/SocialExperience';
import {LogScanPanel} from '../src/LogJoining';
import {PanelVisibilityContext} from '../src/PanelReadiness';
import {parseLogCode} from '../shared/logJoining';
import {setupDOM} from './dom';
const mocks=vi.hoisted(()=>({operation:vi.fn(),start:vi.fn().mockResolvedValue(undefined),stop:vi.fn(),destroy:vi.fn(),scanImage:vi.fn(),decode:null as null|((result:{data:string})=>void)}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:mocks.operation}));
vi.mock('qr-scanner',()=>({default:class{static scanImage=mocks.scanImage;start=mocks.start;stop=mocks.stop;destroy=mocks.destroy;constructor(_video:unknown,decode:typeof mocks.decode){mocks.decode=decode;}}}));
vi.mock('qrcode',()=>({default:{toDataURL:vi.fn().mockResolvedValue('data:image/png;base64,fixture')}}));
const user={id:'me',handle:'me',name:'Me',bio:'',city:'',interests:[],discoverable:false};
const entry={id:'entry',ownerId:'me',date:new Date().toLocaleDateString('en-CA'),title:'Walk',place:'Park',links:[],recurrence:'none',coverFileId:null,revision:1,createdAt:'2026-09-27T00:00:00Z',updatedAt:'2026-09-27T00:00:00Z',membership:'member',contributors:[{userId:'me',name:'Me',note:'A memory',files:[]}],invitations:[]};
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();vi.clearAllMocks();mocks.operation.mockImplementation(async(name,input)=>name==='log.preferences'?{arrangement:'calendar',views:[]}:name==='log.neighbors'?{previous:null,next:null}:name==='log.get'?entry:name==='log.contacts'?{items:[{id:'friend',name:'Sam',handle:'sam',sharedHangouts:1}],nextCursor:null}:name==='log.list'?{items:input.recurring?[]:[entry],nextCursor:null}:{items:[],nextCursor:null});});
afterEach(()=>dom.cleanup());
const button=(text:string)=>[...dom.container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text)!;
it('keeps calendar DOM and scroll under the entry overlay and floats actions outside the scroller',async()=>{
 await act(async()=>dom.root.render(createElement(SocialExperience,{mode:'log',active:true,data:{user,messages:[]} as any,reset:0,dockOpen:false,chatBusy:false,onRoute:vi.fn(),globalNavigate:vi.fn(),openAgent:vi.fn(),signup:vi.fn(),discuss:vi.fn(),example:vi.fn(),openMessage:vi.fn()})));
 const calendar=dom.container.querySelector('.log-calendar-history')!,scroller=calendar.closest<HTMLElement>('.composer-view')!;scroller.scrollTop=420;
 expect(dom.container.querySelector('.mode-content-header')).toBeNull();expect(button('scan').closest('.composer-view')).toBeNull();expect(dom.container.querySelectorAll('.log-today-card')).toHaveLength(1);
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('.log-today-card')!.click());expect(calendar.isConnected).toBe(true);expect(scroller.hasAttribute('inert')).toBe(true);expect(scroller.scrollTop).toBe(420);expect(dom.container.querySelector('.log-detail')).not.toBeNull();expect(button('Code')).toBeTruthy();expect(button('Invite')).toBeUndefined();
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
