// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {SocialExperience} from '../src/SocialExperience';
import {PersonPanel} from '../src/PersonPanel';
import {setupDOM} from './dom';
const api=vi.hoisted(()=>({operation:vi.fn()}));vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:api.operation}));
const user={id:'me',name:'Me',handle:'me',bio:'',city:'',interests:[],discoverable:true};
const entry={id:'hangout',ownerId:'me',date:'2026-09-27',title:'A shared walk',place:'Park',links:[],recurrence:'none',coverFileId:null,revision:1,createdAt:'2026-09-27T00:00:00Z',updatedAt:'2026-09-27T00:00:00Z',membership:'member',contributors:[{userId:'me',name:'Me',note:'',files:[]},{userId:'friend',name:'Friend',note:'',files:[]}],invitations:[]};
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();api.operation.mockReset().mockImplementation(async(name:string)=>name==='people.get'?{...user,id:'friend',name:'Friend',handle:'friend'}:name==='connections.status'?{connection:{id:'pair',status:'accepted'}}:name==='log.list'?{items:[entry],nextCursor:null}:name==='log.get'?entry:name==='log.neighbors'?{previous:null,next:null}:{items:[],nextCursor:null});});afterEach(()=>dom.cleanup());
it('opens shared hangouts from a friend profile in its current mode and restores the selected tab on Close',async()=>{
 const route=vi.fn(),navigate=vi.fn();await act(async()=>dom.root.render(createElement(SocialExperience,{mode:'friends',active:true,data:{user,messages:[]} as any,request:{id:1,destination:{view:'person',resourceId:'friend'}},reset:0,dockOpen:false,chatBusy:false,onRoute:route,globalNavigate:navigate,openAgent:vi.fn(),signup:vi.fn(),discuss:vi.fn(),example:vi.fn(),openMessage:vi.fn()})));
 const tab=[...dom.container.querySelectorAll<HTMLButtonElement>('.profile-posts .view-tabs button')].find(button=>button.textContent==='Hangouts')!;expect(tab).toBeTruthy();await act(async()=>tab.click());
 expect(api.operation).toHaveBeenCalledWith('log.list',{personId:'friend',scope:'shared',limit:30});await act(async()=>dom.container.querySelector<HTMLButtonElement>('.profile-hangouts .log-list button')!.click());
 expect(dom.container.querySelector('.social-friends .log-modal[data-open=true] .log-detail')?.textContent).toContain('A shared walk');expect(navigate).not.toHaveBeenCalled();
 await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('.log-modal[data-open=true] button')].find(button=>button.textContent==='Back')!.click());
 expect(dom.container.querySelector('.log-modal[data-open=true]')).toBeNull();expect(tab.getAttribute('aria-pressed')).toBe('true');expect(dom.container.querySelector('.composer-view:not([hidden]) .profile-hangouts')).not.toBeNull();
});
it('does not offer Hangouts without friendship or shared hangouts',async()=>{const original=api.operation.getMockImplementation()!;api.operation.mockImplementation(async(name,...args)=>name==='connections.status'?{connection:null}:original(name,...args));await act(async()=>dom.root.render(createElement(PersonPanel,{personId:'friend',user,navigate:vi.fn()})));expect([...dom.container.querySelectorAll('button')].some(button=>button.textContent==='Hangouts')).toBe(false);expect(api.operation.mock.calls.some(call=>call[0]==='log.list')).toBe(false);});

it('shows shared hangouts with a nonfriend without unlocking direct messages',async()=>{
 const original=api.operation.getMockImplementation()!;api.operation.mockImplementation(async(name,...args)=>name==='connections.status'?{connection:null}:name==='people.get'?{...user,id:'friend',hasSharedHangouts:true}:original(name,...args));
 await act(async()=>dom.root.render(createElement(PersonPanel,{personId:'friend',user,navigate:vi.fn()})));
 const tab=[...dom.container.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Hangouts')!;expect(tab).toBeTruthy();expect(dom.container.textContent).not.toContain('Open messages');await act(async()=>tab.click());expect(api.operation).toHaveBeenCalledWith('log.list',{personId:'friend',scope:'shared',limit:30});expect(dom.container.querySelector('.profile-hangouts')?.textContent).toContain('A shared walk');
});
