// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setupDOM } from './dom';
import { NotificationsPanel } from '../src/NotificationsPanel';
import type { Notification } from '../shared/notifications';
const transport = vi.hoisted(() => ({ operation: vi.fn() }));
vi.mock('../src/api', async original => ({ ...await original<typeof import('../src/api')>(), operation: transport.operation }));
let dom: ReturnType<typeof setupDOM>;
const item: Notification = { id: 'notice', kind: 'message', title: 'Message from Friend', text: 'Saturday works', createdAt: '2026-09-25T12:00:00.000Z', read: false, link: { rel: 'open_in_newdrugs', targetKind: 'exact', resourceType: 'conversation', resourceId: 'connection', title: 'Open conversation', url: 'https://dev.druggie.org/messages/connection' } };
beforeEach(() => { dom = setupDOM(); transport.operation.mockReset().mockResolvedValue({ read: true }); });
afterEach(() => dom.cleanup());
it('retains a notification as read and lets it reopen the exact destination', async () => {
  const navigate = vi.fn();
  await act(async () => dom.root.render(createElement(NotificationsPanel, { state: { unread: 1, items: [item] }, navigate })));
  const button = dom.container.querySelector('button')!;
  expect(button.textContent).toContain('Unread');
  await act(async () => button.click());
  expect(transport.operation).toHaveBeenCalledWith('notifications.read', { notificationId: item.id });
  await act(async () => dom.root.render(createElement(NotificationsPanel, { state: { unread: 0, items: [{ ...item, read: true }] }, navigate })));
  expect(dom.container.querySelector('button')).toBe(button); expect(button.dataset.read).toBe('true'); expect(button.textContent).toContain('Read');
  expect(button.querySelector('time')?.dateTime).toBe(item.createdAt);
  transport.operation.mockClear();
  await act(async () => button.click());
  expect(navigate).toHaveBeenLastCalledWith(expect.objectContaining({ view: 'messages', resourceId: 'connection' }));
  expect(transport.operation).not.toHaveBeenCalled();
});
