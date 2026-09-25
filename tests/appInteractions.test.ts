// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import type { Bootstrap, RunView } from '../shared/types';
import { rect, setupDOM } from './dom';
import { surfaceViews, surfaceTitles } from '../shared/navigation';

const transport = vi.hoisted(() => ({ api: vi.fn(), post: vi.fn(), operation: vi.fn() }));
vi.mock('../src/api', async original => ({ ...await original<typeof import('../src/api')>(), ...transport }));
const initial: Bootstrap = { user: { id: 'user', handle: 'test', name: 'Me', city: '', bio: '', interests: [], discoverable: false }, wallet: { balanceNanos: 1e9, reservedNanos: 0, availableNanos: 1e9, entries: [] }, messages: [], config: { aiEnabled: true, paymentsEnabled: false, development: true, model: 'test', version: '0.3.1' } };
const active: RunView = { id: 'run', status: 'running', draft: '', preamble: '', progress: [], approvals: [], clientId: 'browser', revision: 1 };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

describe('chat interaction integration', () => {
  let dom: ReturnType<typeof setupDOM>, bootstrap: ReturnType<typeof deferred<Bootstrap>>, chat: ReturnType<typeof deferred<{ run: RunView }>>;
  beforeEach(() => {
    dom = setupDOM(); vi.stubGlobal('innerWidth', 390); vi.stubGlobal('innerHeight', 844); bootstrap = deferred(); chat = deferred(); localStorage.clear(); sessionStorage.clear();
    document.documentElement.style.cssText = '--chat-width:480;--chat-gutter:12;--orb-radius:36';
    transport.api.mockReset(); transport.post.mockReset(); transport.operation.mockReset();
    transport.api.mockImplementation((path: string) => path === '/tokens' ? Promise.resolve({ tokens: [] }) : path === '/checkout/quotes' ? Promise.resolve({ quotes: [] }) : bootstrap.promise);
    transport.operation.mockImplementation((name: string) => Promise.resolve(name === 'people.get' ? { ...initial.user, id: 'friend', handle: 'friend', name: 'Friend', discoverable: true } : name === 'posts.get' ? { id: 'post', userId: 'friend', text: 'A real post', createdAt: new Date().toISOString(), city: '' } : { items: [], nextCursor: null, people: [] }));
    transport.post.mockImplementation((path: string) => path === '/chat' ? chat.promise : Promise.resolve({ ok: true }));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) { return this.classList.contains('composer') ? rect(12, 550, 366, 76) : rect(150, 350, 228, 80); });
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('conversation') ? 1000 : 76; });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open'); } });
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, writable: true, value: () => ({ finished: Promise.resolve(), cancel() {} }) });
  });
  afterEach(() => dom.cleanup());
  const mount = () => act(async () => { dom.root.render(createElement(App)); });
  const load = () => act(async () => { bootstrap.resolve(initial); });
  const type = (text: string) => act(() => {
    const input = dom.container.querySelector('textarea')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  it('routes a guest into account creation before chat or a blank self-profile', async () => {
    await mount();
    await act(async () => bootstrap.resolve({ ...initial, user: { ...initial.user, handle: undefined } }));
    type('who is around');
    act(() => dom.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(transport.post.mock.calls.some(call => call[0] === '/chat')).toBe(false);
    expect(dom.container.querySelector('dialog h2')?.textContent).toBe('Create an account');
    expect(dom.container.querySelector('input[name="handle"]')).not.toBeNull();
    expect(dom.container.querySelector('#thought')?.getAttribute('id')).toBe('thought');
    expect((dom.container.querySelector('#thought') as HTMLTextAreaElement).value).toBe('who is around');
    expect(dom.container.querySelector('.profile-card')).toBeNull();
  });
  it('opens profile editing after registration and resumes the held chat after setup', async () => {
    await mount(); await act(async()=>bootstrap.resolve({...initial,user:{...initial.user,handle:undefined}}));
    type('who is around');act(()=>dom.container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    transport.api.mockResolvedValue(initial);transport.post.mockImplementation(async(path:string)=>path==='/account/register'?{user:initial.user}:path==='/chat'?chat.promise:{});
    const form=dom.container.querySelector<HTMLFormElement>('dialog form')!;
    form.querySelector<HTMLInputElement>('[name="handle"]')!.value='test';form.querySelector<HTMLInputElement>('[name="password"]')!.value='password8';
    await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(dom.container.querySelector('.profile-editor-actions')).not.toBeNull();
    expect(transport.post.mock.calls.some(call=>call[0]==='/chat')).toBe(false);
    await act(async()=>dom.container.querySelector<HTMLButtonElement>('.profile-later')!.click());
    expect(transport.post).toHaveBeenCalledWith('/chat',expect.objectContaining({text:'who is around'}));
    expect(dom.container.querySelector('dialog')).toBeNull();
  });
  it('shows only the background until chat and settings data are ready', async () => {
    await mount();
    expect(dom.container.querySelector('.atmosphere')).not.toBeNull();
    expect(dom.container.querySelector('main')).toBeNull();
    expect(dom.container.querySelector('button')).toBeNull();
    expect(dom.container.textContent).toBe('');
    await load(); dom.frame();
    expect(dom.container.querySelector('textarea')).not.toBeNull();
    expect(dom.container.querySelector('.settings-button')?.textContent).toBe('$1.00');
    expect(dom.container.querySelector('.app-version')?.textContent).toBe('v0.3.1');
  });
  it('clears the draft and inserts its message immediately while the request is still pending', async () => {
    await mount(); await load(); dom.frame(); type('Meet at the park?');
    act(() => dom.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(dom.container.querySelector('textarea')!.value).toBe('');
    expect(dom.container.querySelector('.message.user .bubble')?.textContent).toBe('Meet at the park?');
    expect(transport.post).toHaveBeenCalledWith('/chat', expect.objectContaining({ text: 'Meet at the park?' }));
    expect(dom.container.querySelector('.agent-live')).not.toBeNull();
    expect(dom.container.querySelector('.retry-message')).toBeNull();
    dom.frame();
    expect(document.querySelector('.message-placement')?.children.length).toBe(2);
    await act(async () => {});
    expect(dom.container.querySelectorAll('.message.user').length).toBe(1);
  });
  it('does not mark an accepted send failed when only the following refresh fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount(); await load(); dom.frame(); type('Hello');
    act(() => dom.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    transport.api.mockRejectedValueOnce(new Error('Temporary refresh failure'));
    await act(async () => { chat.resolve({ run: active }); });
    expect(dom.container.querySelector('.retry-message')).toBeNull();
    expect(dom.container.querySelector('.agent-live')).not.toBeNull();
  });
  it('does not resurrect Thinking when the final live message arrives before a slow send acknowledgement', async () => {
    const sources: EventTarget[] = [];
    vi.stubGlobal('EventSource', class extends EventTarget { constructor() { super(); sources.push(this); } close() {} });
    await mount(); await load(); dom.frame(); type('Hello');
    act(() => dom.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    const requestId = transport.post.mock.calls.find(call => call[0] === '/chat')![1].requestId;
    const runId = `user:${requestId}`;
    const messages = [{ id: `${runId}:user`, role: 'user', text: 'Hello', createdAt: new Date().toISOString(), source: 'app' }, { id: `${runId}:assistant`, role: 'assistant', text: 'Done.', status: 'complete', createdAt: new Date().toISOString(), source: 'app' }];
    act(() => sources[0].dispatchEvent(new MessageEvent('state', { data: JSON.stringify({ userId: 'user', epoch: 'one', sequence: 1, change: { run: null, messages } }) })));
    expect(dom.container.querySelector('.agent-live')).toBeNull();
    transport.api.mockReturnValue(new Promise(() => {}));
    await act(async () => chat.resolve({ run: { ...active, id: runId } }));
    expect(dom.container.querySelector('.agent-live')).toBeNull();
    expect(dom.container.textContent).toContain('Done.');
  });
  it('opens settings without outside pointer-up closing the modal and keeps Back beside Close', async () => {
    await mount(); await load();
    act(() => dom.container.querySelector<HTMLButtonElement>('.settings-button')!.click());
    const dialog = dom.container.querySelector('dialog')!;
    act(() => dialog.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 0, clientY: 0 })));
    expect(dialog.hasAttribute('open')).toBe(true);
    act(() => dom.container.querySelector<HTMLButtonElement>('.settings-menu button')!.click());
    expect(Array.from(dom.container.querySelectorAll('.sheet-actions button')).map(button => button.getAttribute('aria-label'))).toEqual(['Back', 'Close']);
    act(() => dialog.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 0, clientY: 0 })));
    expect(dom.container.querySelector('dialog')).toBeNull();
  });
  it.each(surfaceViews)('opens the exact native destination requested by the agent: %s', async view => {
    sessionStorage.setItem('nd-client', 'browser');
    await mount();
    await act(async () => { bootstrap.resolve({ ...initial, user: { ...initial.user, handle: 'test' }, run: { ...active, status: 'waiting_for_input', surface: { id: `surface-${view}`, view, resourceId: 'resource', waiting: true } } }); });
    expect(dom.container.querySelector('dialog h2, .composer-surface h2')?.textContent).toBe(surfaceTitles[view]);
    expect(Boolean(dom.container.querySelector('.connection-setup'))).toBe(view === 'connections');
    if (view === 'location') {
      expect(dom.container.querySelector('.location-picker')).not.toBeNull();
      expect(dom.container.textContent).toContain('Save area');
      expect(dom.container.textContent).not.toContain('Create an access token');
    }
  });
  it('toggles an inline launcher, keeps every child inline, hides dictation, and restores the untouched chat draft', async () => {
    await mount(); await load(); type('Keep this draft');
    act(() => dom.container.querySelector<HTMLButtonElement>('.launcher-button')!.click());
    expect(dom.container.querySelector('dialog')).toBeNull();
    expect(dom.container.querySelector('.composer-switcher')?.classList.contains('launcher-open')).toBe(true);
    expect(dom.container.querySelector('.composer-input-layer')?.hasAttribute('inert')).toBe(true);
    expect(dom.container.querySelector('.orb-icon')?.classList.contains('icon-hidden')).toBe(true);
    expect(dom.container.querySelector('.launcher-menu')?.textContent).not.toContain('My profile');
    const messages = [...dom.container.querySelectorAll<HTMLButtonElement>('.launcher-menu button')].find(button => button.textContent?.includes('Messages'))!;
    await act(async () => messages.click());
    expect(dom.container.querySelector('dialog')).toBeNull();
    expect(dom.container.querySelector('.composer-surface h2')?.textContent).toBe('Messages');
    act(() => dom.container.querySelector<HTMLButtonElement>('.composer-surface-footer button')!.click());
    expect(dom.container.querySelector('.launcher-menu')).not.toBeNull();
    act(() => dom.container.querySelector<HTMLButtonElement>('.launcher-button')!.click());
    expect(dom.container.querySelector('.composer-input-layer')?.hasAttribute('inert')).toBe(false);
    expect(dom.container.querySelector('textarea')?.value).toBe('Keep this draft');
    expect(dom.container.querySelector('.dictation-slot')).not.toBeNull();
  });
  it('keeps a launcher screen mounted under settings and restores it without losing its state', async () => {
    await mount(); await load();
    act(() => dom.container.querySelector<HTMLButtonElement>('.launcher-button')!.click());
    await act(async () => [...dom.container.querySelectorAll<HTMLButtonElement>('.launcher-menu button')].find(button => button.textContent?.includes('Messages'))!.click());
    const inbox = dom.container.querySelector('.inbox-list');
    act(() => dom.container.querySelector<HTMLButtonElement>('.settings-button')!.click());
    expect(dom.container.querySelector('dialog h2')?.textContent).toBe('Settings');
    expect(dom.container.querySelector('.composer-surface-footer h2')?.textContent).toBe('Messages');
    expect(dom.container.querySelector('.inbox-list')).toBe(inbox);
    act(() => dom.container.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click());
    expect(dom.container.querySelector('dialog')).toBeNull();
    expect(dom.container.querySelector('.inbox-list')).toBe(inbox);
    expect(dom.container.querySelector('.composer-switcher')?.classList.contains('launcher-open')).toBe(true);
  });
  it('opens a returned profile link in-app and preserves the chat draft', async () => {
    await mount();
    await act(async () => { bootstrap.resolve({ ...initial, messages: [{ id: 'reply', role: 'assistant', text: '[View @friend](https://dev.druggie.org/people/friend)', createdAt: new Date().toISOString(), source: 'app' }] }); });
    type('Keep this draft');
    await act(async () => dom.container.querySelector<HTMLAnchorElement>('.message a')!.click());
    expect(transport.operation).toHaveBeenCalledWith('people.get', { personId: 'friend' });
    expect(dom.container.querySelector('.profile-card')?.textContent).toContain('@friend');
    expect(dom.container.querySelector('textarea')?.value).toBe('Keep this draft');
    expect(dom.container.querySelector('.connection-setup')).toBeNull();
  });
});
