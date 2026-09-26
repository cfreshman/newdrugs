// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {PersonPanel} from '../src/PersonPanel';
import {setupDOM} from './dom';
const transport=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:transport.operation}));
const user={id:'me',handle:'me',name:'Me',city:'',bio:'',interests:[],discoverable:true};
const friend={...user,id:'friend',handle:'friend',name:'Friend'};
const connection={id:'connection',fromId:'me',toId:'friend',note:'hello',status:'accepted'};
let dom:ReturnType<typeof setupDOM>;const navigate=vi.fn();
beforeEach(()=>{dom=setupDOM();navigate.mockClear();transport.operation.mockReset();transport.operation.mockImplementation(async(name:string)=>name==='people.get'?friend:name==='connections.status'?{connection}:{items:[],nextCursor:null});});
afterEach(()=>dom.cleanup());
const mount=async(personId='friend')=>act(async()=>dom.root.render(createElement(PersonPanel,{personId,user,navigate})));
const choose=async(label:string)=>act(async()=>{const menu=dom.container.querySelector<HTMLDetailsElement>('.profile-menu')!;menu.open=true;[...menu.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent===label)!.click();});
it('keeps messages beside a single action menu and preserves explicit unfriend review',async()=>{
 await mount();const row=dom.container.querySelector('.profile-contact')!;
 expect([...row.querySelectorAll(':scope > button')].map(button=>button.textContent)).toEqual(['Open messages']);
 expect([...row.querySelectorAll('.profile-menu button')].map(button=>button.textContent)).toEqual(['Unfriend','Block','Report']);
 await act(async()=>row.querySelector<HTMLButtonElement>(':scope > button')!.click());expect(navigate).toHaveBeenCalledWith({view:'messages',resourceId:'connection'});
 await choose('Unfriend');expect(dom.container.querySelector<HTMLDetailsElement>('.profile-menu')!.open).toBe(false);
 expect(transport.operation.mock.calls.some(([name])=>name==='connections.disconnect')).toBe(false);
 await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('.action-review button')].find(button=>button.textContent==='Unfriend')!.click());
 expect(transport.operation).toHaveBeenCalledWith('connections.disconnect',{connectionId:'connection'},{confirmed:true});
});
it('opens block and report forms from the menu without submitting either action',async()=>{
 await mount();await choose('Block');expect(dom.container.querySelector('.person-safety')?.textContent).toContain('Block @friend');
 await choose('Report');expect(dom.container.querySelector('.person-safety textarea')).not.toBeNull();expect(dom.container.querySelector('.action-review')).toBeNull();
 expect(transport.operation.mock.calls.some(([name])=>name==='people.block'||name==='people.report')).toBe(false);
 await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('.person-safety button')].find(button=>button.textContent==='Cancel')!.click());expect(dom.container.querySelector('.person-safety')).toBeNull();
});
it('omits unfriend for non-friends and all safety actions on your own profile',async()=>{
 const original=transport.operation.getMockImplementation()!;transport.operation.mockImplementation((name:string,...args:unknown[])=>name==='connections.status'?Promise.resolve({connection:null}):original(name,...args));
 await mount();expect([...dom.container.querySelectorAll('.profile-menu button')].map(button=>button.textContent)).toEqual(['Block','Report']);
 const menu=dom.container.querySelector<HTMLDetailsElement>('.profile-menu')!;menu.open=true;act(()=>document.body.dispatchEvent(new Event('pointerdown',{bubbles:true})));expect(menu.open).toBe(false);
 await mount('me');expect(dom.container.querySelector('.profile-menu')).toBeNull();expect(dom.container.querySelector('.profile-contact')?.textContent).toBe('Edit profile');
});
