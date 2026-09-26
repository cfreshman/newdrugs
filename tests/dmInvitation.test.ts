// @vitest-environment jsdom
import { act, createElement } from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { setupDOM } from './dom';
import { MessagesPanel } from '../src/NativePanels';
const transport = vi.hoisted(() => ({ operation: vi.fn() }));
vi.mock('../src/api', async original => ({ ...await original<typeof import('../src/api')>(), operation: transport.operation }));
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
