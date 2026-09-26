// @vitest-environment jsdom
import { act, createElement } from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { setupDOM } from './dom';
import { PushSettings } from '../src/PushSettings';
import { PeoplePanel } from '../src/NativePanels';
import { FeedPanel } from '../src/PostPanels';
const transport = vi.hoisted(() => ({ api: vi.fn(), post: vi.fn(), operation: vi.fn() }));
vi.mock('../src/api', async original => ({ ...await original<typeof import('../src/api')>(), ...transport }));
let dom: ReturnType<typeof setupDOM>;
beforeEach(() => { dom = setupDOM(); localStorage.clear(); transport.api.mockReset(); transport.post.mockReset().mockResolvedValue({ enabled: true }); transport.operation.mockReset().mockResolvedValue({ items: [], nextCursor: null }); });
afterEach(() => { dom.cleanup(); });
it('normalizes old null search fields in people and posts, preserving real searches', async () => {
  const user = { id: 'user', handle: 'user', name: '', city: '', bio: '', interests: [], discoverable: true, area: { cell: '852a3313fffffff', label: 'Lincoln area', point: { type: 'Point' as const, coordinates: [-71, 41] as [number, number] } } };
  for (const Component of [PeoplePanel, FeedPanel]) {
    await act(async () => dom.root.render(createElement(Component, { user, radiusMiles: null, initialQuery: null, initialScope: 'nearby', navigate: vi.fn() } as never)));
    expect(dom.container.querySelector('input')?.value).toBe('');
    expect(dom.container.querySelector('select')?.value).toBe('25');
    expect(transport.operation.mock.calls.at(-1)?.[1]).toMatchObject({ radiusMiles: 25 });
  }
});
it('waits for an explicit gesture before requesting permission and saves only after subscribing', async () => {
  const requestPermission = vi.fn().mockResolvedValue('granted');
  vi.stubGlobal('Notification', { permission: 'default', requestPermission }); vi.stubGlobal('PushManager', class {});
  const subscribe = vi.fn().mockResolvedValue({ endpoint: 'https://web.push.apple.com/device', toJSON: () => ({ keys: { p256dh: 'public', auth: 'private' } }) });
  const registration = { pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe } };
  const register = vi.fn().mockResolvedValue(registration);
  vi.stubGlobal('navigator', { platform: '', userAgent: 'Test', maxTouchPoints: 0, serviceWorker: { register, ready: Promise.resolve(registration) } });
  transport.api.mockResolvedValue({ publicKey: btoa('test-public-key'), devices: [] });
  await act(async () => dom.root.render(createElement(PushSettings, { userId: 'user' })));
  expect(requestPermission).not.toHaveBeenCalled(); expect(subscribe).not.toHaveBeenCalled();
  await act(async () => {
    dom.container.querySelector('button')!.click();
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(transport.post).not.toHaveBeenCalled();
  });
  expect(subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
  expect(transport.post).toHaveBeenCalledWith('/push/subscribe', expect.objectContaining({ endpoint: 'https://web.push.apple.com/device', deviceId: expect.any(String) }));
});
it('shows Home Screen guidance on iPhone tabs without asking permission', async () => {
  vi.stubGlobal('navigator', { platform: 'iPhone', userAgent: 'iPhone', maxTouchPoints: 5 });
  await act(async () => dom.root.render(createElement(PushSettings, { userId: 'user' })));
  expect(dom.container.textContent).toContain('Home Screen'); expect(dom.container.querySelector('button')).toBeNull(); expect(transport.api).not.toHaveBeenCalled();
});
