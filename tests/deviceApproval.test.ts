// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {DeviceApproval} from '../src/DeviceApproval';
import {Connections} from '../src/Panels';
import {setupDOM} from './dom';
const calls=vi.hoisted(()=>({api:vi.fn(),post:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),api:calls.api,post:calls.post}));
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();vi.clearAllMocks();calls.api.mockResolvedValue({userCode:'BCDF-GHJK',name:'Cloud CLI',scope:'read',status:'pending',expiresAt:new Date(Date.now()+600000).toISOString()});calls.post.mockResolvedValue({userCode:'BCDF-GHJK',name:'Cloud CLI',scope:'read',status:'approved',expiresAt:new Date(Date.now()+600000).toISOString()});});
afterEach(()=>dom.cleanup());
it('shows the signed-in account and submits the same permission/expiry fields as Connected agents',async()=>{
 await act(async()=>dom.root.render(createElement(DeviceApproval,{initialCode:'BCDF-GHJK',registered:true,handle:'owner',onAccount:vi.fn()})));
 expect(dom.container.textContent).toContain('Signed in as @owner');expect(dom.container.querySelector<HTMLSelectElement>('[name=scope]')?.value).toBe('read');
 await act(async()=>dom.container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(calls.post).toHaveBeenCalledWith('/agent-login/approve',{userCode:'BCDF-GHJK',access:{name:'Cloud CLI',scope:'read',expiresInDays:null}});expect(dom.container.textContent).toContain('Approved.');
});
it('requires sign-in before looking up the code',async()=>{const account=vi.fn();await act(async()=>dom.root.render(createElement(DeviceApproval,{initialCode:'BCDF-GHJK',registered:false,onAccount:account})));expect(calls.api).not.toHaveBeenCalled();await act(async()=>dom.container.querySelector<HTMLAnchorElement>('a')!.click());expect(account).toHaveBeenCalledOnce();});
it('denies without sending permissions or token fields',async()=>{await act(async()=>dom.root.render(createElement(DeviceApproval,{initialCode:'BCDF-GHJK',registered:true,onAccount:vi.fn()})));const deny=[...dom.container.querySelectorAll('button')].find(node=>node.textContent==='Deny')!;await act(async()=>deny.click());expect(calls.post).toHaveBeenCalledWith('/agent-login/deny',{userCode:'BCDF-GHJK'});});
it('leaves PAT setup visible by default and keeps browser approval collapsed',async()=>{calls.api.mockResolvedValue({tokens:[]});await act(async()=>dom.root.render(createElement(Connections,{registered:true,onAccount:vi.fn()})));expect(dom.container.textContent).toContain('Create a token');expect(dom.container.querySelector('details')?.open).toBe(false);expect(dom.container.querySelector('form [name=scope]')).not.toBeNull();});
