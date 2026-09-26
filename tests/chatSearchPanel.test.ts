// @vitest-environment jsdom
import { act, createElement } from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { setupDOM } from './dom';
import { ChatSearchPanel } from '../src/ChatSearchPanel';
import { NavigationContext } from '../src/NavigationContext';
const transport = vi.hoisted(() => ({ operation: vi.fn() }));
vi.mock('../src/api', async original => ({ ...await original<typeof import('../src/api')>(), operation: transport.operation }));
let dom: ReturnType<typeof setupDOM>;
beforeEach(() => { dom = setupDOM(); transport.operation.mockReset().mockResolvedValue({ items: [{ id: 'message', role: 'assistant', text: '**Try these**\n\n- [Nearby people](/nearby)\n- [Website](https://example.com)\n\n`code`', createdAt: '2026-09-25T12:00:00Z', score: .9 }], nextCursor: 'next-page', mode: 'hybrid', indexing: false, notices: [] }); });
afterEach(() => dom.cleanup());
it('renders markdown and sends internal links directly to the app destination without jumping to chat', async () => {
  const navigate = vi.fn(), openMessage = vi.fn().mockResolvedValue(undefined);
  await act(async () => dom.root.render(createElement(NavigationContext.Provider, { value: navigate }, createElement(ChatSearchPanel, { initialQuery: 'places', openMessage }))));
  const card = dom.container.querySelector('.chat-search-result')!;
  expect(card.querySelector('.chat-search-excerpt strong')?.textContent).toBe('Try these');
  expect(card.querySelectorAll('li')).toHaveLength(2); expect(card.querySelector('code')?.textContent).toBe('code');
  expect(card.querySelector('button a')).toBeNull();
  await act(async () => card.querySelector<HTMLAnchorElement>('a[href="/nearby"]')!.click());
  expect(navigate).toHaveBeenCalledWith({ view: 'people' }); expect(openMessage).not.toHaveBeenCalled();
  await act(async () => card.querySelector<HTMLParagraphElement>('p')!.click());
  expect(openMessage).toHaveBeenCalledWith('message');
});
it('preserves external and modified-click links, and leaves an accessible message jump button', async () => {
  const navigate = vi.fn(), openMessage = vi.fn().mockResolvedValue(undefined);
  await act(async () => dom.root.render(createElement(NavigationContext.Provider, { value: navigate }, createElement(ChatSearchPanel, { initialQuery: 'places', openMessage }))));
  const external = dom.container.querySelector<HTMLAnchorElement>('a[href="https://example.com"]')!;
  expect(external.target).toBe('_blank'); expect(external.rel).toContain('noopener');
  await act(async () => external.click()); expect(openMessage).not.toHaveBeenCalled();
  await act(async () => dom.container.querySelector('a[href="/nearby"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })));
  expect(navigate).not.toHaveBeenCalled(); expect(openMessage).not.toHaveBeenCalled();
  await act(async () => dom.container.querySelector<HTMLButtonElement>('.chat-search-meta')!.click()); expect(openMessage).toHaveBeenCalledTimes(1);
  await act(async () => dom.container.querySelector<HTMLButtonElement>('.chat-search-more')!.click());
  expect(transport.operation).toHaveBeenLastCalledWith('conversation.search', expect.objectContaining({ cursor: 'next-page' }));
});
