// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {setupDOM} from './dom';
const api=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:api.operation}));
import {IousPanel} from '../src/IousPanel';

let dom:ReturnType<typeof setupDOM>|undefined;
afterEach(()=>{dom?.cleanup();api.operation.mockReset();});
it('records an exact-cent IOU from the People panel with the entered reason',async()=>{
 dom=setupDOM();
 const ledger={person:{id:'other',name:'Laura',handle:'laura'},balanceCents:0,revision:0,updatedAt:'',lastEntry:null,entries:[],nextCursor:null};
 api.operation.mockImplementation(async(name:string)=>name==='ious.get'?ledger:name==='ious.record'?{ledger,entry:{id:'entry'}}:{items:[],nextCursor:null});
 await act(async()=>dom!.root.render(createElement(IousPanel,{user:{id:'me',name:'Me',city:'',bio:'',interests:[],discoverable:false},personId:'other',choosing:false,setChoosing:vi.fn(),navigate:vi.fn()})));
 const amount=dom.container.querySelector<HTMLInputElement>('.ious-form input[placeholder="$0.00"]')!,reason=dom.container.querySelector<HTMLInputElement>('.ious-form input[maxlength="240"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(amount,'42.53');amount.dispatchEvent(new Event('input',{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(reason,'Dinner');reason.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>dom!.container.querySelector<HTMLFormElement>('.ious-form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(api.operation).toHaveBeenCalledWith('ious.record',{personId:'other',kind:'owe',direction:'them_to_me',amountCents:4253,reason:'Dinner'},expect.objectContaining({confirmed:true,key:expect.any(String)}));
});
it('keeps the same form rows for Settled up and Paid down',async()=>{
 dom=setupDOM();
 const ledger={person:{id:'other',name:'Laura',handle:'laura'},balanceCents:5234,revision:3,updatedAt:'',lastEntry:null,entries:[],nextCursor:null};
 api.operation.mockImplementation(async(name:string)=>name==='ious.get'?ledger:name==='ious.record'?{ledger,entry:{id:'entry'}}:{items:[],nextCursor:null});
 await act(async()=>dom!.root.render(createElement(IousPanel,{user:{id:'me',name:'Me',city:'',bio:'',interests:[],discoverable:false},personId:'other',choosing:false,setChoosing:vi.fn(),navigate:vi.fn()})));
 const tabs=()=>[...dom!.container.querySelectorAll<HTMLButtonElement>('.ious-form>[aria-label="IOU change"] button')];
 expect(tabs().map(button=>button.textContent)).toEqual(['Add owed','Settled up','Paid down']);
 await act(async()=>tabs()[1].click());
 expect(dom.container.querySelectorAll('.ious-form > *')).toHaveLength(5);
 expect(dom.container.querySelectorAll('.ious-direction-tabs button')).toHaveLength(1);
 expect(dom.container.querySelector<HTMLInputElement>('.ious-form input[placeholder="$0.00"]')).toMatchObject({value:'52.34',readOnly:true});
 await act(async()=>dom!.container.querySelector<HTMLFormElement>('.ious-form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(api.operation).toHaveBeenCalledWith('ious.record',{personId:'other',kind:'settle',revision:3,reason:''},expect.objectContaining({confirmed:true}));
 await act(async()=>tabs()[2].click());
 expect(dom.container.querySelectorAll('.ious-form > *')).toHaveLength(5);
 expect(dom.container.querySelectorAll('.ious-direction-tabs button')).toHaveLength(1);
 expect(dom.container.querySelector<HTMLInputElement>('.ious-form input[placeholder="$0.00"]')?.readOnly).toBe(false);
});
