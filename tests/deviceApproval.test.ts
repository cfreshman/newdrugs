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
it('waits to show the token setup prompt and styles the optional device copy action',async()=>{calls.api.mockResolvedValue({tokens:[]});await act(async()=>dom.root.render(createElement(Connections,{registered:true,onAccount:vi.fn()})));expect(dom.container.textContent).toContain('Create token and copy prompt');expect(dom.container.textContent).not.toContain('Copy setup prompt');expect(dom.container.querySelector('details')?.open).toBe(false);expect(dom.container.querySelector('form [name=scope]')).not.toBeNull();expect([...dom.container.querySelectorAll('details button')].find(button=>button.textContent==='Copy device setup prompt')?.classList.contains('solid')).toBe(true);});
it('starts clipboard copy during the create gesture and copies the complete prompt after creation',async()=>{
 calls.api.mockResolvedValue({tokens:[]});let resolvePost!:(value:{token:string})=>void;
 calls.post.mockReturnValue(new Promise(resolve=>{resolvePost=resolve;}));
 const priorClipboard=Object.getOwnPropertyDescriptor(navigator,'clipboard'),priorItem=Object.getOwnPropertyDescriptor(globalThis,'ClipboardItem');
 class PendingClipboardItem{constructor(readonly data:Record<string,Promise<Blob>>){} }
 const write=vi.fn(async(items:PendingClipboardItem[])=>{await items[0].data['text/plain'];});
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write,writeText:vi.fn()}});
 Object.defineProperty(globalThis,'ClipboardItem',{configurable:true,value:PendingClipboardItem});
 try{
  await act(async()=>dom.root.render(createElement(Connections,{registered:true,onAccount:vi.fn()})));
  await act(async()=>{dom.container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await Promise.resolve();});
  expect(calls.post).toHaveBeenCalledWith('/tokens',expect.any(Object));expect(write).toHaveBeenCalledOnce();
  await act(async()=>{resolvePost({token:'nd_test_secret'});await Promise.resolve();});
  expect(dom.container.textContent).toContain('Setup prompt copied.');
  expect(dom.container.textContent).not.toContain('Copy token');expect(dom.container.querySelector('[aria-label="Access token"]')).toBeNull();
 }finally{if(priorClipboard)Object.defineProperty(navigator,'clipboard',priorClipboard);else delete (navigator as {clipboard?:Clipboard}).clipboard;if(priorItem)Object.defineProperty(globalThis,'ClipboardItem',priorItem);else delete (globalThis as {ClipboardItem?:typeof ClipboardItem}).ClipboardItem;}
});
