// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {MessagesPanel} from '../src/NativePanels';
import {SocialExperience} from '../src/SocialExperience';
import {setupDOM} from './dom';
const transport=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:transport.operation,api:vi.fn(async()=>({items:[],active:null}))}));
const person={id:'friend',name:'Friend Name',handle:'friend',photos:['photo'],discoverable:true};
const connection={id:'conversation',members:['me','friend'],fromId:'me',toId:'friend',note:'Want to go for a walk?',status:'accepted',createdAt:'2026-10-01T12:00:00Z',unread:true,lastMessage:{fromId:'friend',text:'Saturday works!',createdAt:'2026-10-01T13:00:00Z'}};
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();transport.operation.mockReset().mockImplementation(async(name:string)=>name==='connections.list'?{items:[connection],people:[person],nextCursor:null}:name==='connections.get'?{connection,people:[person]}:name==='messages.list'?{items:[],nextCursor:null}:{read:true});});
afterEach(()=>dom.cleanup());
it('opens a conversation directly from its photo and preview row using a real link',async()=>{
 const navigate=vi.fn();await act(async()=>dom.root.render(createElement(MessagesPanel,{userId:'me',navigate})));
 const row=dom.container.querySelector<HTMLAnchorElement>('.dm-inbox-open')!;
 expect(row.getAttribute('href')).toBe('/messages/conversation');expect(row.querySelector('img')?.getAttribute('src')).toBe('/api/files/photo');
 expect(row.textContent).toContain('Friend Name');expect(row.textContent).toContain('Saturday works!');expect(row.textContent).toContain('Unread');
 expect(dom.container.textContent).not.toContain('Open conversation');expect(row.querySelector('button,a')).toBeNull();
 await act(async()=>row.click());expect(navigate).toHaveBeenCalledWith({view:'messages',resourceId:'conversation'});
});
it('preserves outgoing invitation text and withdraws independently of conversation navigation',async()=>{
 transport.operation.mockImplementation(async(name:string)=>name==='connections.list'?{items:[{...connection,status:'pending',lastMessage:undefined}],people:[person],nextCursor:null}:{});
 const navigate=vi.fn();await act(async()=>dom.root.render(createElement(MessagesPanel,{userId:'me',navigate})));
 expect(dom.container.querySelector('.dm-inbox-preview')?.textContent).toBe(`You: ${connection.note}`);
 const withdraw=dom.container.querySelector<HTMLButtonElement>('.dm-inbox-footer button')!;expect(withdraw.textContent).toBe('Withdraw invitation');
 await act(async()=>withdraw.click());expect(transport.operation).toHaveBeenCalledWith('connections.withdraw',{connectionId:'conversation'});expect(navigate).not.toHaveBeenCalled();
});
it('accepts an incoming invitation independently and links the conversation header to the profile',async()=>{
 transport.operation.mockImplementation(async(name:string)=>name==='connections.list'?{items:[{...connection,status:'pending',fromId:'friend',toId:'me',lastMessage:undefined}],people:[person],nextCursor:null}:name==='connections.get'?{connection,people:[person]}:name==='messages.list'?{items:[],nextCursor:null}:{});
 const navigate=vi.fn();await act(async()=>dom.root.render(createElement(MessagesPanel,{userId:'me',navigate})));
 const accept=[...dom.container.querySelectorAll<HTMLButtonElement>('.dm-inbox-footer button')].find(button=>button.textContent==='Accept invitation')!;
 await act(async()=>accept.click());expect(transport.operation).toHaveBeenCalledWith('connections.respond',{connectionId:'conversation',accept:true},{confirmed:true});expect(navigate).not.toHaveBeenCalled();
 await act(async()=>dom.root.render(createElement(MessagesPanel,{userId:'me',connectionId:'conversation',navigate})));
 const profile=dom.container.querySelector<HTMLAnchorElement>('.message-person')!;expect(profile.querySelector('img')?.getAttribute('src')).toBe('/api/files/photo');
 await act(async()=>profile.click());expect(navigate).toHaveBeenCalledWith({view:'person',resourceId:'friend'});
});
it('moves only the active DM controls into the top header and restores the inbox title on Back',async()=>{
 const data={user:{id:'me',handle:'me',name:'Me',discoverable:true,interests:[],bio:'',city:''},messages:[]} as any;
 transport.operation.mockImplementation(async(name:string)=>name==='connections.list'?{items:[connection],people:[person],nextCursor:null}:name==='connections.get'?{connection,people:[person]}:{items:[],people:[],nextCursor:null});
 await act(async()=>dom.root.render(createElement(SocialExperience,{mode:'friends',active:true,data,request:{id:1,destination:{view:'messages'},restore:true},reset:0,dockOpen:false,chatBusy:false,globalNavigate:vi.fn(),openAgent:vi.fn(),signup:vi.fn(),discuss:vi.fn(),example:vi.fn(),openMessage:vi.fn(),onRoute:vi.fn()})));
 const inbox=dom.container.querySelector('.dm-inbox-list');
 await act(async()=>dom.container.querySelector<HTMLAnchorElement>('.dm-inbox-open')!.click());
 const header=dom.container.querySelector('.mode-content-header')!;
 expect(header.querySelector('.message-person')?.textContent).toContain('Friend Name');expect(header.querySelector('h1')).toBeNull();
 expect(dom.container.querySelectorAll('.message-view-actions')).toHaveLength(1);expect(dom.container.querySelector('.message-view .message-view-actions')).toBeNull();
 await act(async()=>header.querySelector<HTMLAnchorElement>('[aria-label="Back"]')!.click());
 expect(header.querySelector('h1')?.textContent).toBe('Messages');expect(header.querySelector('.message-person')).toBeNull();
 expect(dom.container.querySelector('.dm-inbox-list')).toBe(inbox);
});
