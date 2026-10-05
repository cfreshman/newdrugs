// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {QuizzesPanel} from '../src/QuizzesPanel';
import {setupDOM} from './dom';

const api=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',()=>({...api,errorText:(error:Error)=>error.message}));
vi.mock('../src/useRecordRefresh',()=>({useRecordRefresh:()=>{}}));
let dom:ReturnType<typeof setupDOM>;
const me={id:'me',handle:'me',name:'Me',bio:'',city:'',interests:[],discoverable:true};
const friend={id:'friend',handle:'friend',name:'Friend'};
beforeEach(()=>{dom=setupDOM();api.operation.mockReset();});
afterEach(()=>dom.cleanup());

it('starts a pairwise quiz with a friend using the Logcal prompts',async()=>{
 api.operation.mockImplementation(async(name:string)=>name==='quizzes.get'?{person:friend,quiz:null}:{id:'friend:me',members:['friend','me'],people:[friend,me],answers:{me:{animal:'Fox'}},myAnswered:true,otherAnswered:false,revision:1,createdAt:'2026-10-05T00:00:00Z',updatedAt:'2026-10-05T00:00:00Z'});
 await act(async()=>dom.root.render(createElement(QuizzesPanel,{user:me,personId:'friend',choosing:false,setChoosing:vi.fn(),navigate:vi.fn(),cancel:vi.fn()})));
 expect(dom.container.textContent).toContain('What ___ reminds you of them?');
 const animal=[...dom.container.querySelectorAll<HTMLLabelElement>('.quiz-form label')].find(label=>label.textContent==='Animal')!.querySelector('input')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(animal,'Fox');animal.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('.quiz-form .solid')!.click());
 expect(api.operation.mock.calls.some(([name,input])=>name==='quizzes.create'&&input.personId==='friend')).toBe(true);
 expect(dom.container.querySelector('.quiz-answer-head')?.textContent).toContain('Me said');
 expect(dom.container.querySelector('.quiz-answer-head')?.textContent).toContain('Friend said');
});
it('keeps pending quiz status separate and omits it once both answered',async()=>{
 const base={members:['friend','me'],people:[friend,me],answers:{},revision:1,createdAt:'2026-10-05T00:00:00Z',updatedAt:'2026-10-05T00:00:00Z'};
 api.operation.mockResolvedValue({items:[{...base,id:'first',myAnswered:true,otherAnswered:false,pinned:true,bff:false},{...base,id:'second',myAnswered:false,otherAnswered:true,pinned:false,bff:false},{...base,id:'third',myAnswered:true,otherAnswered:true,pinned:false,bff:true}],nextCursor:null});
 await act(async()=>dom.root.render(createElement(QuizzesPanel,{user:me,choosing:false,setChoosing:vi.fn(),navigate:vi.fn(),cancel:vi.fn()})));
 const cards=dom.container.querySelectorAll('.quiz-list-row');
 expect(cards[0].querySelector('.quiz-list-status')).toBeNull();
 expect(cards[0].querySelector('.quiz-list-star')).not.toBeNull();
 expect(cards[0].querySelector('button')).toBeNull();
 expect(cards[1].querySelector('.quiz-list-status')?.textContent).toBe('Waiting for them');
 expect(cards[1].querySelector('.quiz-list-pin')).not.toBeNull();
 expect(cards[2].querySelector('.quiz-list-status')?.textContent).toBe('Your turn');
});
it('moves a pin immediately and restores its old place if saving fails',async()=>{
 const first={id:'first',members:['friend','me'],people:[friend,me],answers:{},myAnswered:false,otherAnswered:false,pinned:false,bff:false,revision:1,createdAt:'2026-10-05T00:00:00Z',updatedAt:'2026-10-05T00:00:00Z'};
 const other={id:'other',name:'Other',handle:'other'};
 const second={...first,id:'second',members:['me','other'],people:[me,other],createdAt:'2026-10-01T00:00:00Z'};
 let rejectPin:(error:Error)=>void=()=>{};
 api.operation.mockImplementation(async(name:string)=>name==='quizzes.pin'?new Promise((_resolve,reject)=>{rejectPin=reject;}):{items:[first,second],nextCursor:null});
 await act(async()=>dom.root.render(createElement(QuizzesPanel,{user:me,choosing:false,setChoosing:vi.fn(),navigate:vi.fn(),cancel:vi.fn()})));
 const order=()=>[...dom.container.querySelectorAll<HTMLElement>('.quiz-list-row')].map(row=>row.querySelector('.message-person-name strong')?.textContent);
 expect(order()).toEqual(['Friend','Other']);
 await act(async()=>dom.container.querySelectorAll<HTMLButtonElement>('.quiz-list-pin')[1].click());
 expect(order()).toEqual(['Other','Friend']);
 expect(dom.container.querySelector('.quiz-list-row .quiz-list-pin')?.getAttribute('aria-pressed')).toBe('true');
 await act(async()=>rejectPin(Error('Could not pin')));
 expect(order()).toEqual(['Friend','Other']);
 expect(dom.container.textContent).toContain('Could not pin');
});
