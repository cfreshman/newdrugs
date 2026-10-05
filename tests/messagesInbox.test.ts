// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MessagesPanel} from '../src/NativePanels';
import {SocialExperience} from '../src/SocialExperience';
import {setupDOM} from './dom';
const transport=vi.hoisted(()=>({operation:vi.fn(),api:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:transport.operation,api:transport.api}));
const person={id:'friend',name:'Friend Name',handle:'friend',photos:['photo'],discoverable:true};
const connection={id:'conversation',members:['me','friend'],fromId:'me',toId:'friend',note:'Want to go for a walk?',status:'accepted',createdAt:'2026-10-01T12:00:00Z',unread:true,lastMessage:{fromId:'friend',text:'Saturday works!',createdAt:'2026-10-01T13:00:00Z'}};
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();transport.api.mockReset().mockResolvedValue({items:[],active:null});transport.operation.mockReset().mockImplementation(async(name:string)=>name==='people.bffs'?{items:[],nextCursor:null}:name==='connections.list'?{items:[connection],people:[person],nextCursor:null}:name==='connections.get'?{connection,people:[person]}:name==='messages.list'?{items:[],nextCursor:null}:{read:true});});
afterEach(()=>dom.cleanup());
it('opens a conversation directly from its photo and preview row using a real link',async()=>{
 const navigate=vi.fn();await act(async()=>dom.root.render(createElement(MessagesPanel,{userId:'me',navigate})));
 const row=dom.container.querySelector<HTMLAnchorElement>('.dm-inbox-open')!;
 expect(row.getAttribute('href')).toBe('/messages/conversation');expect(row.querySelector('img')?.getAttribute('src')).toBe('/api/files/photo?avatar=1');
 expect(row.textContent).toContain('Friend Name');expect(row.textContent).toContain('Saturday works!');expect(row.textContent).toContain('Unread');
 expect(dom.container.textContent).not.toContain('Open conversation');expect(row.querySelector('button,a')).toBeNull();
 await act(async()=>row.click());expect(navigate).toHaveBeenCalledWith({view:'messages',resourceId:'conversation'});
});
it('shows up to six BFF conversations as circles above ordinary messages',async()=>{
 transport.operation.mockImplementation(async(name:string)=>name==='people.bffs'?{items:[{id:'friend',name:'Friend Name',handle:'friend',photoId:'photo',connectionId:'conversation'},{id:'other',name:'Other Friend',connectionId:'other-conversation'}],nextCursor:null}:name==='connections.list'?{items:[connection],people:[person],nextCursor:null}:{read:true});
 const navigate=vi.fn();await act(async()=>dom.root.render(createElement(MessagesPanel,{userId:'me',navigate})));
 const circles=dom.container.querySelectorAll<HTMLAnchorElement>('.dm-bff-grid .dm-bff');
 expect(circles).toHaveLength(2);
 expect(circles[0].getAttribute('href')).toBe('/messages/conversation');
 expect(dom.container.querySelectorAll('.dm-inbox-list .dm-inbox-card')).toHaveLength(0);
 await act(async()=>circles[0].click());expect(navigate).toHaveBeenCalledWith({view:'messages',resourceId:'conversation'});
});
it('preserves outgoing invitation text and withdraws independently of conversation navigation',async()=>{
 transport.operation.mockImplementation(async(name:string)=>name==='people.bffs'?{items:[],nextCursor:null}:name==='connections.list'?{items:[{...connection,status:'pending',lastMessage:undefined}],people:[person],nextCursor:null}:{});
 const navigate=vi.fn();await act(async()=>dom.root.render(createElement(MessagesPanel,{userId:'me',navigate})));
 expect(dom.container.querySelector('.dm-inbox-preview')?.textContent).toBe(`You: ${connection.note}`);
 const withdraw=dom.container.querySelector<HTMLButtonElement>('.dm-inbox-footer button')!;expect(withdraw.textContent).toBe('Withdraw invitation');
 await act(async()=>withdraw.click());expect(transport.operation).toHaveBeenCalledWith('connections.withdraw',{connectionId:'conversation'});expect(navigate).not.toHaveBeenCalled();
});
it('accepts an incoming invitation independently and links the conversation header to the profile',async()=>{
 transport.operation.mockImplementation(async(name:string)=>name==='people.bffs'?{items:[],nextCursor:null}:name==='connections.list'?{items:[{...connection,status:'pending',fromId:'friend',toId:'me',lastMessage:undefined}],people:[person],nextCursor:null}:name==='connections.get'?{connection,people:[person]}:name==='messages.list'?{items:[],nextCursor:null}:{});
 const navigate=vi.fn();await act(async()=>dom.root.render(createElement(MessagesPanel,{userId:'me',navigate})));
 const accept=[...dom.container.querySelectorAll<HTMLButtonElement>('.dm-inbox-footer button')].find(button=>button.textContent==='Accept invitation')!;
 await act(async()=>accept.click());expect(transport.operation).toHaveBeenCalledWith('connections.respond',{connectionId:'conversation',accept:true},{confirmed:true});expect(navigate).not.toHaveBeenCalled();
 await act(async()=>dom.root.render(createElement(MessagesPanel,{userId:'me',connectionId:'conversation',navigate})));
 const profile=dom.container.querySelector<HTMLAnchorElement>('.message-person')!;expect(profile.querySelector('img')?.getAttribute('src')).toBe('/api/files/photo?avatar=1');
 await act(async()=>profile.click());expect(navigate).toHaveBeenCalledWith({view:'person',resourceId:'friend'});
});
it('moves only the active DM controls into the top header and restores the inbox title on Back',async()=>{
 const data={user:{id:'me',handle:'me',name:'Me',discoverable:true,interests:[],bio:'',city:''},messages:[]} as any;
 transport.operation.mockImplementation(async(name:string)=>name==='people.bffs'?{items:[],nextCursor:null}:name==='connections.list'?{items:[connection],people:[person],nextCursor:null}:name==='connections.get'?{connection,people:[person]}:{items:[],people:[],nextCursor:null});
 await act(async()=>dom.root.render(createElement(SocialExperience,{mode:'friends',active:true,data,request:{id:1,destination:{view:'messages'},restore:true},reset:0,dockOpen:false,chatBusy:false,globalNavigate:vi.fn(),openAgent:vi.fn(),signup:vi.fn(),discuss:vi.fn(),example:vi.fn(),openMessage:vi.fn(),onRoute:vi.fn()})));
 const inbox=dom.container.querySelector('.dm-inbox-list');
 await act(async()=>dom.container.querySelector<HTMLAnchorElement>('.dm-inbox-open')!.click());
 const header=dom.container.querySelector('.mode-content-header')!;
 expect(header.querySelector('.message-person')?.textContent).toContain('Friend Name');expect(header.querySelector('h1')).toBeNull();
 expect(dom.container.querySelectorAll('.message-view-actions')).toHaveLength(1);expect(dom.container.querySelector('.message-view .message-view-actions')).toBeNull();
 await act(async()=>header.querySelector<HTMLAnchorElement>('[aria-label="Back"]')!.click());
 expect(header.querySelector('h1')?.textContent).toBe('Messages');expect(header.querySelector('.message-person')).toBeNull();
 expect(dom.container.querySelector('.dm-inbox-list')).toBe(inbox);
 const reads=transport.operation.mock.calls.filter(([name])=>name==='messages.mark_read').length;
 await act(async()=>dom.container.querySelector<HTMLAnchorElement>('.dm-inbox-open')!.click());
 expect(transport.operation.mock.calls.filter(([name])=>name==='messages.mark_read')).toHaveLength(reads+1);
});

it('reads a new video-call notification while the same DM stays open with no new text message',async()=>{
 transport.operation.mockImplementation(async(name:string)=>name==='people.bffs'?{items:[],nextCursor:null}:name==='connections.get'?{connection,people:[person]}:name==='messages.list'?{items:[{id:'message',fromId:'friend',text:'Hello',createdAt:connection.createdAt}],nextCursor:null}:{});
 await act(async()=>dom.root.render(createElement(MessagesPanel,{userId:'me',connectionId:'conversation',navigate:vi.fn()})));
 expect(transport.operation).toHaveBeenCalledWith('messages.mark_read',{connectionId:'conversation',throughMessageId:'message'});transport.operation.mockClear();
 transport.api.mockResolvedValue({items:[{id:'new-call',connectionId:'conversation',callerId:'friend',calleeId:'me',status:'ended',createdAt:connection.createdAt}],active:null});
 await act(async()=>{window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:['calls']}));await new Promise(resolve=>setTimeout(resolve,150));});
 expect(transport.operation).toHaveBeenCalledWith('messages.mark_read',{connectionId:'conversation',throughMessageId:'message'});
 expect(transport.operation.mock.calls.some(([name])=>name==='connections.respond'||name==='messages.send')).toBe(false);
 transport.operation.mockClear();await act(async()=>document.dispatchEvent(new Event('visibilitychange')));
 expect(transport.operation).toHaveBeenCalledWith('messages.mark_read',{connectionId:'conversation',throughMessageId:'message'});
});
it('searches DMs and opens the matched message in its conversation',async()=>{
 transport.operation.mockImplementation(async(name:string)=>name==='people.bffs'?{items:[],nextCursor:null}:name==='connections.list'?{items:[connection],people:[person],nextCursor:null}:name==='messages.search'?{items:[{id:'message-42',connectionId:'conversation',fromId:'friend',text:'Here is the link',createdAt:connection.createdAt,score:1,person:{id:'friend',name:'Friend Name',handle:'friend',photoId:'photo'}}],nextCursor:null,mode:'keyword',indexing:false,notices:[]}:{read:true});
 const navigate=vi.fn();await act(async()=>dom.root.render(createElement(MessagesPanel,{userId:'me',initialQuery:'link',navigate})));
 expect(transport.operation).toHaveBeenCalledWith('messages.search',{query:'link',limit:20});
 const match=dom.container.querySelector<HTMLAnchorElement>('.dm-inbox-open')!;
 expect(match.getAttribute('href')).toBe('/messages/conversation?message=message-42');
 await act(async()=>match.click());expect(navigate).toHaveBeenCalledWith({view:'messages',resourceId:'conversation',messageId:'message-42'});
});
it('loads an exact DM window and marks only the target as viewed',async()=>{
 const messages=Array.from({length:8},(_,index)=>({id:`message-${index}`,fromId:index%2?'me':'friend',text:`Row ${index}`,createdAt:new Date(Date.parse(connection.createdAt)+index*1000).toISOString(),...(index===3?{clientId:'temporary-animation-id'}:{})}));
 transport.operation.mockImplementation(async(name:string)=>name==='people.bffs'?{items:[],nextCursor:null}:name==='messages.window'?{items:messages,targetId:'message-3',connection,people:[person],olderCursor:null,newerCursor:'message-7'}:{read:true});
 const navigate=vi.fn();await act(async()=>dom.root.render(createElement(MessagesPanel,{userId:'me',connectionId:'conversation',messageId:'message-3',navigate})));
 expect(transport.operation).toHaveBeenCalledWith('messages.window',{messageId:'message-3'});
 expect(dom.container.querySelector('[data-search-target="true"]')?.getAttribute('data-message-id')).toBe('message-3');
 expect(transport.operation).toHaveBeenCalledWith('messages.mark_read',{connectionId:'conversation',throughMessageId:'message-3'});
 const latest=dom.container.querySelector<HTMLButtonElement>('.latest-dm')!;await act(async()=>latest.click());
 expect(navigate).toHaveBeenCalledWith({view:'messages',resourceId:'conversation',messageId:undefined});
});
