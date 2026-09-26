// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Users} from '../admin/Users';
import {setupDOM} from './dom';
const api=vi.hoisted(()=>({adminRequest:vi.fn()}));vi.mock('../admin/api',()=>api);
let dom:ReturnType<typeof setupDOM>;
const user=(id:string)=>({id,name:id==='a'?'Alice':'Bob',handle:id==='a'?'alice':'bob',createdAt:'2026-09-26T12:00:00.000Z',balanceNanos:855690460,reservedNanos:0,suspended:false});
beforeEach(()=>{dom=setupDOM();api.adminRequest.mockReset();api.adminRequest.mockImplementation(async(path:string)=>{const params=new URL(path,'https://example.test').searchParams;return {items:[user(params.get('cursor')||params.get('query')?'b':'a')],total:params.get('query')?1:2,stage:'staging',nextCursor:params.get('cursor')||params.get('query')?null:'next'};});});afterEach(()=>dom.cleanup());
it('lists account details, appends pages, and starts a fresh filtered search',async()=>{
 await act(async()=>dom.root.render(createElement(Users)));
 expect(dom.container.textContent).toContain('2 registered');expect(dom.container.textContent).toContain('Dev');expect(dom.container.textContent).toContain('$0.86');
 await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='More users')!.click());
 expect([...dom.container.querySelectorAll('tbody strong')].map(node=>node.textContent)).toEqual(['Alice','Bob']);
 const input=dom.container.querySelector('input')!;act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'bob');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>dom.container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect([...dom.container.querySelectorAll('tbody strong')].map(node=>node.textContent)).toEqual(['Bob']);expect(api.adminRequest).toHaveBeenLastCalledWith('/users?query=bob&limit=25');
});
