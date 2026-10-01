// @vitest-environment jsdom
import { act, createElement } from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { setupDOM } from './dom';
import { MessagesPanel } from '../src/NativePanels';
const transport = vi.hoisted(() => ({ operation: vi.fn() }));
vi.mock('../src/api', async original => ({ ...await original<typeof import('../src/api')>(), operation: transport.operation, api: vi.fn(async()=>({items:[],active:null})) }));
let dom: ReturnType<typeof setupDOM>;
const connection = { id: 'connection', status: 'accepted', fromId: 'friend', toId: 'me', members: ['friend','me'], note: 'hey want to go for a walk?', createdAt: '2026-09-24T12:00:00.000Z' };
const message = { id: 'message', connectionId: 'connection', fromId: 'me', text: 'yeah saturday?', createdAt: '2026-09-25T12:00:00.000Z' };
beforeEach(() => {
  dom = setupDOM(); transport.operation.mockReset();
  transport.operation.mockImplementation(async (name: string) => name === 'connections.get' ? { connection, people: [] } : name === 'messages.list' ? { items: [message], nextCursor: null } : { read: true });
});
afterEach(() => dom.cleanup());
it('renders the existing invitation before DMs with the original sender and date, without inserting a message', async () => {
  await act(async () => dom.root.render(createElement(MessagesPanel, { userId: 'me', connectionId: 'connection', navigate() {} })));
  const items = [...dom.container.querySelectorAll('.direct-message-content > article')];
  expect(items).toHaveLength(2); expect(items[0].textContent).toContain(connection.note); expect(items[0].classList.contains('peer')).toBe(true);
  expect(items[0].querySelector('time')?.dateTime).toBe(connection.createdAt);
  expect(items[1].textContent).toContain(message.text);
  expect(transport.operation.mock.calls.some(call => call[0] === 'messages.send')).toBe(false);
  expect(transport.operation).toHaveBeenCalledWith('messages.mark_read', { connectionId: 'connection', throughMessageId: 'message' });
});
it('reveals the invitation only after loading the oldest page, keeping chronological order', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
  transport.operation.mockImplementation(async (name: string, input: any) => name === 'connections.get' ? { connection, people: [] } : name === 'messages.list' ? { items: input.before ? [] : [message], nextCursor: input.before ? null : 'cursor' } : { read: true });
  await act(async () => dom.root.render(createElement(MessagesPanel, { userId: 'friend', connectionId: 'connection', navigate() {} })));
  expect(dom.container.querySelector('.invitation-message')).toBeNull();
  const scroller = dom.container.querySelector<HTMLElement>('.direct-messages')!;
  await act(async () => { scroller.scrollTop = 0; scroller.dispatchEvent(new Event('scroll')); });
  expect(dom.container.querySelector('.direct-message-content > article')?.textContent).toContain(connection.note);
  expect(dom.container.querySelector('.invitation-message')?.classList.contains('user')).toBe(true);
});
it('only offers per-message reporting after choosing it in conversation actions',async()=>{
  transport.operation.mockImplementation(async(name:string)=>name==='connections.get'?{connection,people:[{id:'friend',handle:'friend',name:'Friend',discoverable:true}]}:name==='messages.list'?{items:[{...message,fromId:'friend'},{...message,id:'mine',fromId:'me'}],nextCursor:null}:{read:true});
  await act(async()=>dom.root.render(createElement(MessagesPanel,{userId:'me',connectionId:'connection',navigate(){}})));
  expect(dom.container.querySelector('.report-message')).toBeNull();
  expect(dom.container.querySelector('.direct-message-content')?.textContent).not.toContain('Report');
  await act(async()=>dom.container.querySelector<HTMLButtonElement>('.conversation-menu button')!.click());
  const choose=dom.container.querySelector<HTMLElement>('.message.peer .report-target')!;
  expect(choose.getAttribute('role')).toBe('button');expect(dom.container.querySelector('.message.user .report-target')).toBeNull();expect(dom.container.textContent).not.toContain('Report this message');
  await act(async()=>choose.click());expect(dom.container.querySelector('.content-report')).not.toBeNull();expect(dom.container.querySelector('.report-target')).toBeNull();
  expect(transport.operation.mock.calls.some(call=>call[0]==='people.report')).toBe(false);
});

it('groups rapid messages and inserts sparse date-time separators',async()=>{
 const start=Date.parse('2026-09-25T12:00:00.000Z'),items=[
  {...message,id:'later',fromId:'friend',text:'later',createdAt:new Date(start+2*60*60_000).toISOString()},
  {...message,id:'second',text:'second',createdAt:new Date(start+30_000).toISOString()},
  {...message,id:'first',text:'first',createdAt:new Date(start).toISOString()},
 ];
 transport.operation.mockImplementation(async(name:string)=>name==='connections.get'?{connection,people:[]}:name==='messages.list'?{items,nextCursor:null}:{read:true});
 await act(async()=>dom.root.render(createElement(MessagesPanel,{userId:'me',connectionId:'connection',navigate(){}})));
 const rendered=[...dom.container.querySelectorAll<HTMLElement>('.direct-message-content .message:not(.invitation-message)')];
 expect(rendered).toHaveLength(3);expect(rendered[0].classList.contains('dm-group-with-next')).toBe(true);expect(rendered[0].classList.contains('dm-group-with-previous')).toBe(false);expect(rendered[1].classList.contains('dm-group-with-previous')).toBe(true);expect(rendered[2].classList.contains('dm-group-with-previous')).toBe(false);
 expect([...dom.container.querySelectorAll<HTMLTimeElement>('.message-time-separator')].map(time=>time.dateTime)).toEqual([items[2].createdAt,items[0].createdAt]);
});

it('shows the chat down arrow while reading older DMs and returns to latest without sending the draft',async()=>{
  vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype,'scrollHeight','get').mockReturnValue(1000);
  await act(async()=>dom.root.render(createElement(MessagesPanel,{userId:'me',connectionId:'connection',navigate(){}})));
  const scroller=dom.container.querySelector<HTMLElement>('.direct-messages')!;
  expect(dom.container.querySelector('.latest-dm')).toBeNull();
  const input=dom.container.querySelector<HTMLTextAreaElement>('#direct-message')!;
  act(()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'unsent draft');input.dispatchEvent(new Event('input',{bubbles:true}));});
  act(()=>{scroller.scrollTop=250;scroller.dispatchEvent(new Event('scroll'));});
  const button=dom.container.querySelector<HTMLButtonElement>('.latest-dm')!;
  expect(button.getAttribute('aria-label')).toBe('Latest messages');expect(button.classList.contains('latest-chat')).toBe(true);
  dom.resize(scroller);expect(scroller.scrollTop).toBe(250);
  act(()=>button.click());expect(scroller.scrollTop).toBe(scroller.scrollHeight);expect(dom.container.querySelector('.latest-dm')).toBeNull();expect(input.value).toBe('unsent draft');
  expect(transport.operation.mock.calls.some(call=>call[0]==='messages.send')).toBe(false);
  act(()=>{scroller.scrollTop=400;scroller.dispatchEvent(new Event('scroll'));});expect(dom.container.querySelector('.latest-dm')).not.toBeNull();
  act(()=>{scroller.scrollTop=800;scroller.dispatchEvent(new Event('scroll'));});expect(dom.container.querySelector('.latest-dm')).toBeNull();
});
it('keeps following latest if the down arrow is clicked while an older page is loading',async()=>{
  vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(200);
  vi.spyOn(HTMLElement.prototype,'scrollHeight','get').mockReturnValue(1000);
  let resolveOlder!:(value:unknown)=>void;const older=new Promise(resolve=>{resolveOlder=resolve;});
  transport.operation.mockImplementation(async(name:string,input:any)=>name==='connections.get'?{connection,people:[]}:name==='messages.list'?input.before?older:{items:[message],nextCursor:'cursor'}:{read:true});
  await act(async()=>dom.root.render(createElement(MessagesPanel,{userId:'me',connectionId:'connection',navigate(){}})));
  const scroller=dom.container.querySelector<HTMLElement>('.direct-messages')!;
  await act(async()=>{scroller.scrollTop=0;scroller.dispatchEvent(new Event('scroll'));});
  expect(dom.container.querySelector('[aria-label="Loading earlier messages"]')).not.toBeNull();
  act(()=>dom.container.querySelector<HTMLButtonElement>('.latest-dm')!.click());
  await act(async()=>resolveOlder({items:[{...message,id:'older',createdAt:connection.createdAt}],nextCursor:null}));
  expect(scroller.scrollTop).toBe(scroller.scrollHeight);expect(dom.container.querySelector('.latest-dm')).toBeNull();
});
