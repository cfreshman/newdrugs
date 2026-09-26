// @vitest-environment jsdom
import {act,createElement} from 'react';import {beforeEach,afterEach,it,expect,vi} from 'vitest';import {setupDOM} from './dom';import {AutomationsPanel} from '../src/AutomationsPanel';
const api=vi.hoisted(()=>({operation:vi.fn()}));vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:api.operation}));
let dom:ReturnType<typeof setupDOM>;beforeEach(()=>{dom=setupDOM();api.operation.mockReset();});afterEach(()=>dom.cleanup());
it('creates active from the reviewed form and reuses the same key when retrying a lost response',async()=>{
 let calls=0;const navigate=vi.fn();api.operation.mockImplementation(async(name:string,input:unknown)=>{if(name==='automations.create'){if(++calls===1)throw Error('Lost response');return {...input as object,id:'created',revision:1,status:'active',nextRunAt:new Date(Date.now()+86400000).toISOString()};}return{items:[]};});
 await act(async()=>dom.root.render(createElement(AutomationsPanel,{navigate,example:()=>{},chatBusy:false})));
 await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('button')].find(x=>x.textContent==='Create manually')!.click());
 act(()=>{for(const [selector,text]of [['input[maxlength="80"]','My task'],['textarea','Read my account activity']]){const input=dom.container.querySelector<HTMLInputElement|HTMLTextAreaElement>(selector)!;Object.getOwnPropertyDescriptor(input.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));}});
 expect(dom.container.querySelector('button[type="submit"],button.solid')?.textContent).toBe('Create automation');
 expect(dom.container.textContent).not.toContain('Save paused');
 const submit=()=>act(async()=>dom.container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 await submit();expect(dom.container.textContent).toContain('Lost response');await submit();
 const writes=api.operation.mock.calls.filter(([name])=>name==='automations.create');expect(writes).toHaveLength(2);expect(writes[0][2]).toMatchObject({confirmed:true,key:expect.any(String)});expect(writes[1][2]).toEqual(writes[0][2]);
 expect(navigate).toHaveBeenCalledWith({view:'automations',resourceId:'created'});expect(api.operation.mock.calls.some(([name])=>name==='automations.enable')).toBe(false);
});
