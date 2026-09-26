// @vitest-environment jsdom
import React,{act} from 'react';import {beforeEach,afterEach,it,expect,vi} from 'vitest';import {setupDOM} from './dom';import {ProfilePosts} from '../src/PostPanels';import {MessagesPanel} from '../src/NativePanels';
const api=vi.hoisted(()=>({operation:vi.fn(),refresh:undefined as (()=>unknown)|undefined}));vi.mock('../src/api',()=>({...api,errorText:(e:Error)=>e.message}));vi.mock('../src/useRecordRefresh',()=>({useRecordRefresh:(_keys:string[],refresh:()=>unknown)=>{api.refresh=refresh;}}));vi.mock('../src/LinkPreview',()=>({LinkPreviews:()=>null}));
let dom:ReturnType<typeof setupDOM>;
const me={id:'me',handle:'me',name:'Me',bio:'',city:'',interests:[],discoverable:true};
beforeEach(()=>{dom=setupDOM();api.operation.mockReset();api.refresh=undefined;});afterEach(()=>{dom.cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('loads and paginates an author timeline, then changes to replies without a semantic query',async()=>{
 api.operation.mockImplementation(async(_name,input)=>({items:[{id:input.before?'older':input.kind==='replies'?'reply':'post',userId:'friend',text:input.kind==='replies'?'A reply':'A post',createdAt:new Date().toISOString(),city:''}],nextCursor:input.kind==='posts'&&!input.before?'cursor':null}));
 await act(async()=>dom.root.render(React.createElement(ProfilePosts,{personId:'friend',user:me,navigate:vi.fn()})));expect(api.operation).toHaveBeenCalledWith('posts.list',{scope:'public',authorId:'friend',kind:'posts'});expect(dom.container.querySelectorAll('.post-card')).toHaveLength(1);
 const more=[...dom.container.querySelectorAll('button')].find(button=>button.textContent==='More posts')!;await act(async()=>more.click());expect(dom.container.querySelectorAll('.post-card')).toHaveLength(2);
 await act(async()=>dom.container.querySelectorAll<HTMLButtonElement>('[aria-label="Profile activity"] button')[1].click());expect(api.operation).toHaveBeenLastCalledWith('posts.list',{scope:'public',authorId:'friend',kind:'replies'});expect(dom.container.querySelectorAll('.post-card')).toHaveLength(1);expect(dom.container.textContent).toContain('A reply');
});
it('shows ended conversation history and its original invitation without a send form',async()=>{
 api.operation.mockImplementation(async(name)=>name==='connections.get'?{connection:{id:'connection',members:['me','friend'],fromId:'friend',toId:'me',status:'disconnected',disconnectedBy:'friend',note:'A later invitation',createdAt:'2026-09-25T00:00:00.000Z',initialInvitation:{fromId:'me',note:'Original invitation',createdAt:'2026-09-01T00:00:00.000Z'}},people:[]}:{items:[{id:'message',fromId:'me',text:'Old message',createdAt:'2026-09-02T00:00:00.000Z'}],nextCursor:null});
 await act(async()=>dom.root.render(React.createElement(MessagesPanel,{userId:'me',connectionId:'connection',navigate:vi.fn()})));expect(dom.container.textContent).toContain('Original invitation');expect(dom.container.textContent).toContain('Old message');expect(dom.container.querySelector('.message-compose')).toBeNull();expect(dom.container.textContent).toContain('read-only');
});
it('keeps ended conversations reachable from the inbox instead of labeling them declined',async()=>{
 const navigate=vi.fn();api.operation.mockResolvedValue({items:[{id:'old',members:['me','friend'],fromId:'me',toId:'friend',status:'disconnected',disconnectedBy:'friend',note:'Original invitation',initialInvitation:{fromId:'me',note:'Original invitation',createdAt:'2026-09-01T00:00:00.000Z'},createdAt:'2026-09-01T00:00:00.000Z'}],people:[{...me,id:'friend',handle:'friend',discoverable:false}],nextCursor:null});
 await act(async()=>dom.root.render(React.createElement(MessagesPanel,{userId:'me',navigate})));expect(dom.container.textContent).toContain('Connection ended');const history=[...dom.container.querySelectorAll('button')].find(button=>button.textContent==='View conversation history')!;await act(async()=>history.click());expect(navigate).toHaveBeenCalledWith({view:'messages',resourceId:'old'});
});

it('removes moderated posts from an already-open profile without resetting its tab',async()=>{
 let hidden=false;api.operation.mockImplementation(async()=>({items:hidden?[]:[{id:'post',userId:'friend',text:'Visible before moderation',createdAt:new Date().toISOString(),city:''}],nextCursor:null}));
 await act(async()=>dom.root.render(React.createElement(ProfilePosts,{personId:'friend',user:me,navigate:vi.fn()})));expect(dom.container.textContent).toContain('Visible before moderation');hidden=true;await act(async()=>{await api.refresh?.();});expect(dom.container.textContent).not.toContain('Visible before moderation');expect(dom.container.querySelector('[aria-label="Profile activity"] button[aria-pressed="true"]')?.textContent).toBe('Posts');
});
