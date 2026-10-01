// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {setupDOM} from './dom';
import {PeoplePanel} from '../src/NativePanels';

const api=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:api.operation}));
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();api.operation.mockReset().mockResolvedValue({items:[{id:'person',handle:'person',name:'Person',city:'',bio:'',interests:[],discoverable:true,mutualCount:2,mutualFriends:[{id:'one',name:'@one',photoId:'photo-one'},{id:'two',name:'@two'}]}],nextCursor:null});});
afterEach(()=>dom.cleanup());
it('shows mutual friends and their photos on the person card in every Explore scope',async()=>{
 const user={id:'viewer',handle:'viewer',name:'Viewer',city:'',bio:'',interests:[],discoverable:true};
 await act(async()=>dom.root.render(createElement(PeoplePanel,{user,initialScope:'all',navigate:vi.fn()})));
 const card=dom.container.querySelector('.person-result-main')!;
 expect(card.textContent).toContain('2 mutual friends: @one, @two');
 expect(card.querySelector<HTMLImageElement>('.person-mutual-avatars img')?.getAttribute('src')).toBe('/api/files/photo-one');
 expect(card.querySelectorAll('.person-mutual-avatars>span')).toHaveLength(2);
 expect([...dom.container.querySelectorAll('.view-tabs button')].map(button=>button.textContent)).toEqual(['Nearby','All people','Circle']);
});
it('shows Friends as disabled and omits Hide on an accepted friend card',async()=>{
 api.operation.mockResolvedValue({items:[{id:'person',handle:'person',name:'Person',city:'',bio:'',interests:[],discoverable:true,friendAction:'friend'}],nextCursor:null});
 const user={id:'viewer',handle:'viewer',name:'Viewer',city:'',bio:'',interests:[],discoverable:true};
 await act(async()=>dom.root.render(createElement(PeoplePanel,{user,initialScope:'all',navigate:vi.fn()})));
 const actions=dom.container.querySelector('.person-card-actions')!;
 expect(actions.querySelector<HTMLButtonElement>('button.solid')?.textContent).toBe('Friends');
 expect(actions.querySelector<HTMLButtonElement>('button.solid')?.classList.contains('solid')).toBe(true);
 expect(actions.querySelector<HTMLButtonElement>('button.solid')?.disabled).toBe(true);
 expect(actions.textContent).not.toContain('Hide');
});
it('opens a human-written invitation note from the card and offers Hide for a non-friend',async()=>{
 api.operation.mockImplementation(async(name:string)=>name==='people.search'?{items:[{id:'person',handle:'person',name:'Person',city:'',bio:'',interests:[],discoverable:true,friendAction:'invite'}],nextCursor:null}:{id:'connection',status:'pending'});
 const user={id:'viewer',handle:'viewer',name:'Viewer',city:'',bio:'',interests:[],discoverable:true};
 await act(async()=>dom.root.render(createElement(PeoplePanel,{user,initialScope:'all',navigate:vi.fn()})));
 const actions=dom.container.querySelector('.person-card-actions')!;
 expect(actions.textContent).toContain('Add friend');expect(actions.textContent).toContain('Hide');
 expect(actions.querySelector<HTMLButtonElement>('button.solid')?.classList.contains('solid')).toBe(true);
 await act(async()=>actions.querySelector<HTMLButtonElement>('button.solid')!.click());
 expect(dom.container.querySelector('.person-card-invite.fields textarea')).not.toBeNull();
 expect(dom.container.querySelector('.person-card-invite>.solid')?.textContent).toBe('Send invitation');
});
it('replaces a hidden card with Undo and retains it through a same-filter refresh',async()=>{
 let hidden=false;
 api.operation.mockImplementation(async(name:string,input:{hidden?:boolean})=>{if(name==='people.hide'){hidden=Boolean(input.hidden);return {personId:'person',hidden};}return {items:hidden?[]:[{id:'person',handle:'person',name:'Person',city:'',bio:'',interests:[],discoverable:true,friendAction:'invite'}],nextCursor:null};});
 const user={id:'viewer',handle:'viewer',name:'Viewer',city:'',bio:'',interests:[],discoverable:true};
 await act(async()=>dom.root.render(createElement(PeoplePanel,{user,initialScope:'all',navigate:vi.fn()})));
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('.person-card-actions .text-link')!.click());
 expect(dom.container.querySelector('.person-hide-undo')?.textContent).toBe('HiddenUndo');
 await act(async()=>{dom.container.querySelector<HTMLFormElement>('.discovery-search')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 expect(dom.container.querySelector('.person-hide-undo')?.textContent).toBe('HiddenUndo');
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('.person-hide-undo button')!.click());
 expect(hidden).toBe(false);
 expect(dom.container.querySelector('.person-hide-undo')).toBeNull();
 expect(dom.container.querySelector('.person-result-main')?.textContent).toContain('Person');
});
