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
    dom = setupDOM(); history.replaceState(null,'','/'); vi.stubGlobal('innerWidth', 390); vi.stubGlobal('innerHeight', 844); bootstrap = deferred(); chat = deferred(); localStorage.clear(); sessionStorage.clear();
    document.documentElement.style.cssText = '--chat-width:480;--chat-gutter:12;--orb-radius:36';
    transport.api.mockReset(); transport.post.mockReset(); transport.operation.mockReset();
    transport.api.mockImplementation((path: string) => path === '/tokens' ? Promise.resolve({ tokens: [] }) : path === '/checkout/quotes' ? Promise.resolve({ quotes: [] }) : bootstrap.promise);
    transport.operation.mockImplementation((name: string) => Promise.resolve(name === 'inbox.get' ? { id: 'resource', title: 'An update', body: 'Useful info', links: [], producer: { kind: 'external', name: 'Test agent' }, createdAt: new Date().toISOString(), read: false, archived: false, unavailable: false } : name === 'automations.get' ? { id: 'resource', name: 'Morning update', instruction: 'Find something useful', schedule: { kind: 'weekly', timeZone: 'UTC', hour: 7, minute: 0, weekdays: [1] }, maxRunNanos: 50000000, dailyBudgetNanos: 200000000, privateChat: false, webSearch: false, status: 'paused', revision: 1, nextRunAt: null, createdAt: new Date().toISOString() } : name === 'people.get' ? { ...initial.user, id: 'friend', handle: 'friend', name: 'Friend', discoverable: true } : name === 'posts.get' ? { id: 'post', userId: 'friend', text: 'A real post', createdAt: new Date().toISOString(), city: '' } : { items: [], nextCursor: null, people: [] }));
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

  it('covers the mobile content panel while preserving the underlying social screen', async () => {
    vi.stubGlobal('matchMedia', (query:string) => ({matches:query.includes('760'),media:query,addEventListener(){},removeEventListener(){}}));
    await mount(); await load();
    expect(dom.container.querySelector('.mode-switch')?.getAttribute('data-collapsed')).toBe('true');
    await act(async()=>dom.container.querySelector<HTMLButtonElement>('.mode-switch button[aria-label="Posts"]')!.click());
    const social=dom.container.querySelector('.social-posts');
    await act(async()=>dom.container.querySelector<HTMLButtonElement>('.agent-dock-toggle')!.click());
    const dock=dom.container.querySelector<HTMLElement>('.workspace')!;
    const bounds=dom.container.querySelector('.social-posts .mode-main')!.getBoundingClientRect();
    expect(dock.hidden).toBe(false);expect(dock.style.left).toBe(`${bounds.left}px`);expect(dock.style.top).toBe(`${bounds.top}px`);expect(dock.style.width).toBe(`${bounds.width}px`);expect(dock.style.height).toBe(`${bounds.height}px`);
    expect(dom.container.querySelector('.conversation')?.hasAttribute('data-fade-top')).toBe(false);
    await act(async()=>dom.container.querySelector<HTMLButtonElement>('[aria-label="Close agent"]')!.click());
    expect(dock.hidden).toBe(true);expect(dom.container.querySelector('.social-posts')).toBe(social);
  });
  it.each(['Friends','Posts'])('opens location and subsequent profile editing visibly in %s mode',async(mode)=>{
    await mount();await act(async()=>bootstrap.resolve({...initial,user:{...initial.user,area:{cell:'852a3313fffffff',label:'East Providence area, Rhode Island, US',point:{type:'Point',coordinates:[-71.3,41.8]}}}}));
    await act(async()=>dom.container.querySelector<HTMLButtonElement>(`.mode-switch button[aria-label="${mode}"]`)!.click());
    const page=dom.container.querySelector<HTMLElement>('.social-experience:not([hidden])')!;
    const clickText=async(selector:string,text:string)=>act(async()=>[...page.querySelectorAll<HTMLButtonElement>(selector)].find(button=>button.textContent===text)!.click());
    await clickText('.view-tabs button','Nearby');
    await act(async()=>page.querySelector<HTMLButtonElement>('.composer-view:not([hidden]) .search-area-controls button')!.click());
    expect(dom.container.querySelector('dialog[open] .location-picker')).not.toBeNull();
    expect(dom.container.querySelector<HTMLElement>('.workspace')!.hidden).toBe(true);
    await act(async()=>dom.container.querySelector<HTMLButtonElement>('dialog [aria-label="Close"]')!.click());
    await clickText('.mode-sidebar nav button','Your profile');
    await clickText('.profile-contact button','Edit profile');
    expect(dom.container.querySelector('dialog[open] .profile-editor-actions')).not.toBeNull();
    expect(dom.container.querySelector<HTMLElement>('.workspace')!.hidden).toBe(true);
    expect(page.querySelector('.mode-content-header h1')?.textContent).toBe('Profile');
  });
  it('keeps profile titles consistent and exposes composition in Posts mode',async()=>{
    await mount();await load();
    for(const mode of ['Posts','Friends']){
      await act(async()=>dom.container.querySelector<HTMLButtonElement>(`.mode-switch button[aria-label="${mode}"]`)!.click());
      const page=dom.container.querySelector<HTMLElement>('.social-experience:not([hidden])')!;
      await act(async()=>[...page.querySelectorAll<HTMLButtonElement>('.mode-sidebar nav button')].find(button=>button.textContent==='Your profile')!.click());
      expect(page.querySelector('.mode-content-header h1')?.textContent).toBe('Profile');
      expect(Boolean(page.querySelector('.mode-content-header [aria-label="New post"]'))).toBe(mode==='Posts');
    }
  });
  it('returns the active mode to its base without resetting another mode on selection',async()=>{
    await mount();await load();
    const select=async(mode:string)=>act(async()=>dom.container.querySelector<HTMLButtonElement>(`.mode-switch button[aria-label="${mode}"]`)!.click());
    await select('Posts');
    const posts=dom.container.querySelector('.social-posts')!;
    await act(async()=>[...posts.querySelectorAll<HTMLButtonElement>('.mode-sidebar nav button')].find(button=>button.textContent==='Your profile')!.click());
    expect(posts.querySelector('h1')?.textContent).toBe('Profile');
    await select('Friends');await select('Posts');expect(posts.querySelector('h1')?.textContent).toBe('Profile');
    await select('Posts');expect(posts.querySelector('h1')?.textContent).toBe('Posts');
  });
  it('restores independent agent panel, draft and tool state for each tab',async()=>{
    await mount();await load();
    const select=async(mode:string)=>act(async()=>dom.container.querySelector<HTMLButtonElement>(`.mode-switch button[aria-label="${mode}"]`)!.click());
    const write=(text:string)=>act(()=>{const input=dom.container.querySelector<HTMLTextAreaElement>('#thought')!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));});
    const workspace=dom.container.querySelector<HTMLElement>('.workspace')!;
    write('Agent draft');await select('Posts');expect(workspace.hidden).toBe(true);
    await act(async()=>dom.container.querySelector<HTMLButtonElement>('.agent-dock-toggle')!.click());write('Posts draft');
    expect(dom.container.querySelector('.agent-dock-actions .dictation-slot + .agent-dock-close')).not.toBeNull();
    expect(dom.container.querySelectorAll('[aria-label="Start dictation"]')).toHaveLength(1);
    await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('.social-posts .mode-sidebar nav button')].find(button=>button.textContent==='People')!.click());
    const search=dom.container.querySelector<HTMLInputElement>('.social-posts .composer-view:not([hidden]) input[type="search"]')!;
    act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(search,'saved search');search.dispatchEvent(new Event('input',{bubbles:true}));});
    await select('Friends');expect(workspace.hidden).toBe(true);
    await act(async()=>dom.container.querySelector<HTMLButtonElement>('.agent-dock-toggle')!.click());write('Friends draft');
    expect(dom.container.querySelector('[aria-label="Close launcher"]')).toBeNull();
    await act(async()=>dom.container.querySelector<HTMLButtonElement>('[aria-label="Close agent"]')!.click());
    await select('Posts');expect(workspace.hidden).toBe(false);expect(dom.container.querySelector<HTMLTextAreaElement>('#thought')!.value).toBe('Posts draft');
    expect(dom.container.querySelector('[aria-label="Close launcher"]')).toBeNull();
    expect(dom.container.querySelector('.social-posts .composer-view:not([hidden]) input[type="search"]')).toBe(search);expect(search.value).toBe('saved search');
    await select('Friends');expect(workspace.hidden).toBe(true);expect(dom.container.querySelector<HTMLTextAreaElement>('#thought')!.value).toBe('Friends draft');
    await select('Agent');expect(workspace.hidden).toBe(false);expect(dom.container.querySelector<HTMLTextAreaElement>('#thought')!.value).toBe('Agent draft');
  });
  it('loads the saved draft belonging to the initially selected mode',async()=>{
    history.replaceState(null,'','/feed');localStorage.setItem('nd-mode:user','posts');localStorage.setItem('nd-draft:user','Agent draft');localStorage.setItem('nd-draft:user:posts','Posts draft');
    await mount();await load();expect(dom.container.querySelector<HTMLTextAreaElement>('#thought')!.value).toBe('Posts draft');
  });
  it('hides Stop with the thinking row immediately when output completes, before run cleanup', async () => {
    const sources: EventTarget[] = [];
    vi.stubGlobal('EventSource', class extends EventTarget { constructor() { super(); sources.push(this); } close() {} });
    await mount(); await act(async () => bootstrap.resolve({ ...initial, run: active }));
    expect(dom.container.querySelector('.agent-status')).not.toBeNull();
    expect(dom.container.querySelector('.stop-run')).not.toBeNull();
    act(() => sources[0].dispatchEvent(new MessageEvent('state', { data: JSON.stringify({ userId: 'user', epoch: 'one', sequence: 1, change: { run: { ...active, draft: 'All done.', outputComplete: true, revision: 2 } } }) })));
    expect(dom.container.querySelector('.agent-status')).toBeNull();
    expect(dom.container.querySelector('.stop-run')).toBeNull();
    expect(dom.container.querySelector('.agent-live')?.textContent).toContain('All done.');
  });

  it('auto-sends an automation example while preserving the existing composer draft', async () => {
    await mount(); await load(); type('my unsent thought');
    act(() => dom.container.querySelector<HTMLButtonElement>('[aria-label="Open New Drugs"]')!.click());
    const button = [...dom.container.querySelectorAll<HTMLButtonElement>('.launcher-menu button')].find(button => button.textContent === 'Automations')!;
    await act(async () => button.click());
    await act(async () => dom.container.querySelector<HTMLButtonElement>('.automation-examples button')!.click());
    expect(transport.post).toHaveBeenCalledWith('/chat', expect.objectContaining({ text: expect.stringContaining('Every morning at 7am'), fileIds: [] }));
    expect(dom.container.querySelector<HTMLTextAreaElement>('#thought')!.value).toBe('my unsent thought');
  });
  it('attaches an inbox update without sending, preserves the draft and sends the owned reference on submit', async () => {
    await mount(); await load(); type('what do you think?');
    act(() => dom.container.querySelector<HTMLButtonElement>('[aria-label="Open New Drugs"]')!.click());
    const button = [...dom.container.querySelectorAll<HTMLButtonElement>('.launcher-menu button')].find(button => button.textContent === 'Agent inbox')!;
    transport.operation.mockImplementation(async (name: string) => name === 'inbox.list' ? {items:[{id:'update',title:'A useful update',producer:{name:'Connected agent'},createdAt:new Date().toISOString(),read:false}],nextCursor:null} : name === 'inbox.get' ? {id:'update',title:'A useful update',body:'Source text',producer:{name:'Connected agent'},createdAt:new Date().toISOString(),links:[],read:false,archived:false,unavailable:false} : {items:[],nextCursor:null});
    await act(async () => button.click()); await act(async () => dom.container.querySelector<HTMLButtonElement>('.inbox-row')!.click());
    const discuss = [...dom.container.querySelectorAll<HTMLButtonElement>('.panel-actions button')].find(button => button.textContent === 'Bring into chat')!;
    await act(async () => discuss.click());
    expect(transport.post.mock.calls.some(call => call[0] === '/chat')).toBe(false);
    expect(dom.container.querySelector<HTMLTextAreaElement>('#thought')!.value).toBe('what do you think?');
    act(() => dom.container.querySelector<HTMLFormElement>('.composer')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(transport.post).toHaveBeenCalledWith('/chat',expect.objectContaining({text:'what do you think?',inboxIds:['update']}));
  });
  it('sends a typed correction during review with the exact revision, clearing the composer immediately', async () => {
    await mount();
    const waiting: RunView = { ...active, status: 'waiting_for_approval', revision: 7, approvals: [{ id: 'action', operation: 'posts.create', input: { text: 'Old caption' }, title: 'Publish', detail: 'Publish this post', version: 'v1', digest: 'digest', human: true, kind: 'write', expiresAt: Date.now() + 60000, status: 'pending' }] };
    await act(async () => bootstrap.resolve({ ...initial, run: waiting }));
    type('no use tomorrow');
    expect(dom.container.querySelector<HTMLButtonElement>('.send')!.disabled).toBe(false);
    act(() => dom.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(transport.post).toHaveBeenCalledWith('/chat', expect.objectContaining({ text: 'no use tomorrow', review: { runId: 'run', revision: 7 } }));
    expect((dom.container.querySelector('#thought') as HTMLTextAreaElement).value).toBe('');
    expect(dom.container.querySelector('.message.user')?.textContent).toContain('no use tomorrow');
    expect(transport.post.mock.calls.some(call => String(call[0]).endsWith('/decisions'))).toBe(false);
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
    await act(async () => { bootstrap.resolve({ ...initial, user: { ...initial.user, handle: 'test' }, run: { ...active, status: 'waiting_for_input', surface: { id: `surface-${view}`, view, resourceId: view === 'chat_history' ? undefined : 'resource', waiting: true } } }); });
    expect(dom.container.querySelector('dialog h2, .composer-surface h2')?.textContent).toBe(surfaceTitles[view]);
    expect(Boolean(dom.container.querySelector('.connection-setup'))).toBe(view === 'agents');
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
  it.each(['Posts','Friends'])('opens agent update notifications in the current %s browser panel',async(mode)=>{
    localStorage.setItem('nd-draft:user','Agent draft');localStorage.setItem(`nd-draft:user:${mode.toLowerCase()}`,`${mode} draft`);
    const notice={id:'agent-notice',read:false,kind:'agent_update' as const,title:'Agent update',text:'An update',createdAt:new Date().toISOString(),link:{rel:'open_in_newdrugs' as const,targetKind:'exact' as const,resourceType:'inbox',title:'Open update',url:'https://dev.druggie.org/inbox/resource'}};
    await mount();await act(async()=>bootstrap.resolve({...initial,notifications:{unread:1,items:[notice]}}));
    const select=async(value:string)=>act(async()=>dom.container.querySelector<HTMLButtonElement>(`.mode-switch button[aria-label="${value}"]`)!.click());
    await select(mode);const page=dom.container.querySelector('.social-experience:not([hidden])')!;
    await act(async()=>[...page.querySelectorAll<HTMLButtonElement>('.mode-sidebar nav button')].find(x=>x.textContent==='Your profile')!.click());
    await act(async()=>dom.container.querySelector<HTMLButtonElement>('.settings-button')!.click());
    await act(async()=>dom.container.querySelector<HTMLButtonElement>('.notification-list button')!.click());
    expect(dom.container.querySelector('.app')?.getAttribute('data-mode')).toBe(mode.toLowerCase());
    expect(dom.container.querySelector<HTMLElement>('.workspace')?.hidden).toBe(true);
    expect(page.querySelector('.agent-update')?.textContent).toContain('An update');
    expect(dom.container.querySelector('dialog')).toBeNull();
    await act(async()=>page.querySelector<HTMLButtonElement>('.mode-content-header [aria-label="Back"]')!.click());
    expect(page.querySelector('h1')?.textContent).toBe('Profile');
    expect(dom.container.querySelector<HTMLTextAreaElement>('#thought')?.value).toBe(`${mode} draft`);
  });
  it.each(['/inbox/resource','/automations/resource','/chat-history'])('opens a mode-prefixed destination %s in Friends',async(path)=>{
    localStorage.setItem('nd-mode:user','friends');localStorage.setItem('nd-draft:user','Agent draft');localStorage.setItem('nd-draft:user:friends','Friends draft');
    history.replaceState(null,'',`/friends${path}`);
    await mount();await load();
    expect(dom.container.querySelector('.app')?.getAttribute('data-mode')).toBe('friends');
    expect(dom.container.querySelector<HTMLElement>('.workspace')?.hidden).toBe(true);
    expect(dom.container.querySelector('.social-friends .mode-content-header h1')?.textContent).toBe(path.startsWith('/inbox')?'Agent inbox':path.startsWith('/automations')?'Automations':'Chat search');
    expect(dom.container.querySelector<HTMLTextAreaElement>('#thought')?.value).toBe('Friends draft');
    dom.frame();expect(location.pathname).toBe(`/friends${path}`);
  });
  it.each([false,true])('brings a browser inbox update into chat, with mobile=%s',async(mobile)=>{
    vi.stubGlobal('matchMedia',(query:string)=>({matches:mobile&&query.includes('760'),addEventListener(){},removeEventListener(){}}));
    localStorage.setItem('nd-mode:user','posts');localStorage.setItem('nd-draft:user','Agent draft');localStorage.setItem('nd-draft:user:posts','Posts draft');history.replaceState(null,'','/posts/inbox/resource');
    await mount();await load();const update=dom.container.querySelector('.social-posts .agent-update');
    await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('.social-posts .panel-actions button')].find(x=>x.textContent==='Bring into chat')!.click());
    expect(dom.container.querySelector('.app')?.getAttribute('data-mode')).toBe(mobile?'agent':'posts');
    expect(dom.container.querySelector<HTMLElement>('.workspace')?.hidden).toBe(false);
    expect(dom.container.querySelector('.inbox-attachments')?.textContent).toContain('An update');
    expect(dom.container.querySelector<HTMLTextAreaElement>('#thought')?.value).toBe(mobile?'Agent draft':'Posts draft');
    expect(transport.post.mock.calls.filter(([path])=>path==='/chat')).toHaveLength(0);
    if(mobile)await act(async()=>dom.container.querySelector<HTMLButtonElement>('.mode-switch button[aria-label="Posts"]')!.click());
    else await act(async()=>dom.container.querySelector<HTMLButtonElement>('[aria-label="Close agent"]')!.click());
    expect(dom.container.querySelector('.social-posts .agent-update')).toBe(update);
    expect(dom.container.querySelector<HTMLTextAreaElement>('#thought')?.value).toBe('Posts draft');
  });
  it.each([false,true])('sends automation examples in the correct chat, with mobile=%s',async(mobile)=>{
    vi.stubGlobal('matchMedia',(query:string)=>({matches:mobile&&query.includes('760'),addEventListener(){},removeEventListener(){}}));
    localStorage.setItem('nd-mode:user','posts');localStorage.setItem('nd-draft:user','Agent draft');localStorage.setItem('nd-draft:user:posts','Posts draft');history.replaceState(null,'','/posts/automations');
    await mount();await load();const example=dom.container.querySelector<HTMLButtonElement>('.social-posts .automation-examples button')!;const text=example.querySelector('span')!.textContent;
    await act(async()=>example.click());await act(async()=>dom.frame());
    expect(dom.container.querySelector('.app')?.getAttribute('data-mode')).toBe(mobile?'agent':'posts');
    expect(transport.post).toHaveBeenCalledWith('/chat',expect.objectContaining({text}));
    expect(transport.post.mock.calls.filter(([path])=>path==='/chat')).toHaveLength(1);
    expect(dom.container.querySelector<HTMLTextAreaElement>('#thought')?.value).toBe(mobile?'Agent draft':'Posts draft');
  });
  it.each([false,true])('opens a browser chat-history result in the correct chat, with mobile=%s',async(mobile)=>{
    vi.stubGlobal('matchMedia',(query:string)=>({matches:mobile&&query.includes('760'),addEventListener(){},removeEventListener(){}}));
    const original=transport.operation.getMockImplementation()!;const message={id:'history-message',role:'user' as const,text:'Historical tennis message',createdAt:new Date().toISOString(),source:'app' as const};
    transport.operation.mockImplementation((name:string,...args:unknown[])=>name==='conversation.search'?Promise.resolve({items:[{...message,score:1}],nextCursor:null,mode:'hybrid',indexing:false,notices:[]}):name==='conversation.window'?Promise.resolve({items:[message],targetId:message.id,olderCursor:null,newerCursor:null}):original(name,...args));
    localStorage.setItem('nd-mode:user','posts');history.replaceState(null,'','/posts/chat-history?q=tennis');await mount();await load();
    await act(async()=>dom.container.querySelector<HTMLElement>('.social-posts .chat-search-result')!.click());
    expect(dom.container.querySelector('.app')?.getAttribute('data-mode')).toBe(mobile?'agent':'posts');
    expect(transport.operation).toHaveBeenCalledWith('conversation.window',{messageId:message.id});
    expect(dom.container.querySelector<HTMLElement>('.workspace')?.hidden).toBe(false);
    expect(dom.container.querySelector('.workspace .conversation')?.textContent).toContain(message.text);
  });
  const travel=async(direction:'back'|'forward')=>{
    await act(async()=>{await new Promise<void>(resolve=>{window.addEventListener('popstate',()=>resolve(),{once:true});history[direction]();});});
    dom.frame();
  };
  it('routes bare inbox links to Agent regardless of the previously selected mode',async()=>{
    localStorage.setItem('nd-mode:user','posts');history.replaceState(null,'','/inbox/resource');
    await mount();await load();dom.frame();
    expect(dom.container.querySelector('.app')?.getAttribute('data-mode')).toBe('agent');
    expect(dom.container.querySelector('.workspace .agent-update')?.textContent).toContain('An update');
    expect(location.pathname).toBe('/inbox/resource');
  });
  it('writes mode-aware routes and restores composition and browser history without losing its draft',async()=>{
    await mount();await load();dom.frame();
    await act(async()=>dom.container.querySelector<HTMLButtonElement>('.mode-switch [aria-label="Posts"]')!.click());dom.frame();
    expect(location.pathname).toBe('/feed');
    await act(async()=>dom.container.querySelector<HTMLButtonElement>('.social-posts [aria-label="New post"]')!.click());dom.frame();
    expect(location.pathname).toBe('/compose');
    const input=dom.container.querySelector<HTMLTextAreaElement>('.social-posts .composer-view:not([hidden]) textarea')!;
    act(()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'A preserved post draft');input.dispatchEvent(new Event('input',{bubbles:true}));});
    await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('.social-posts .mode-sidebar nav button')].find(x=>x.textContent==='Your profile')!.click());dom.frame();
    expect(location.pathname).toBe('/posts/people/user');
    await travel('back');expect(location.pathname).toBe('/compose');expect(input.value).toBe('A preserved post draft');expect(input.closest<HTMLElement>('.composer-view')!.hidden).toBe(false);
    await travel('back');expect(location.pathname).toBe('/feed');
    await travel('forward');expect(location.pathname).toBe('/compose');expect(input.value).toBe('A preserved post draft');
    await travel('forward');expect(location.pathname).toBe('/posts/people/user');
    await act(async()=>dom.container.querySelector<HTMLButtonElement>('.mode-switch [aria-label="Friends"]')!.click());dom.frame();expect(location.pathname).toBe('/nearby');
    await travel('back');expect(dom.container.querySelector('.app')?.getAttribute('data-mode')).toBe('posts');expect(location.pathname).toBe('/posts/people/user');
  });
  it('serializes feed filters and restores them through Back without resetting the scroll node',async()=>{
    history.replaceState(null,'','/feed');await mount();await load();dom.frame();
    const page=dom.container.querySelector('.social-posts')!,scroller=page.querySelector<HTMLElement>('.composer-view:not([hidden])')!;scroller.scrollTop=175;
    await act(async()=>[...page.querySelectorAll<HTMLButtonElement>('.view-tabs button')].find(x=>x.textContent==='Saved')!.click());dom.frame();
    expect(new URLSearchParams(location.search).get('scope')).toBe('saved');
    const search=page.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(search,'garden');search.dispatchEvent(new Event('input',{bubbles:true}));});
    await act(async()=>search.closest('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));dom.frame();
    expect(new URLSearchParams(location.search).get('q')).toBe('garden');
    await travel('back');expect(search.value).toBe('');expect(new URLSearchParams(location.search).get('scope')).toBe('saved');
    expect(page.querySelector('.composer-view:not([hidden])')).toBe(scroller);expect(scroller.scrollTop).toBe(175);
    await travel('back');expect(page.querySelector('.view-tabs [aria-pressed="true"]')?.textContent).toBe('All');
  });
  it('applies a linked search to an already open People panel and scrolls that panel from the title',async()=>{
    await mount();await act(async()=>bootstrap.resolve({...initial,messages:[{id:'search-link',role:'assistant',text:'[Find gardens](/nearby?q=gardening&scope=all)',createdAt:new Date().toISOString(),source:'app'}]}));dom.frame();
    await act(async()=>dom.container.querySelector<HTMLButtonElement>('.mode-switch [aria-label="Posts"]')!.click());
    const page=dom.container.querySelector('.social-posts')!;
    await act(async()=>[...page.querySelectorAll<HTMLButtonElement>('.mode-sidebar nav button')].find(x=>x.textContent==='People')!.click());
    await act(async()=>dom.container.querySelector<HTMLButtonElement>('.agent-dock-toggle')!.click());
    const link=dom.container.querySelector<HTMLAnchorElement>('.conversation a')!;expect(link.getAttribute('href')).toBe('/posts/nearby?q=gardening&scope=all');
    await act(async()=>link.click());dom.frame();
    expect(page.querySelector<HTMLInputElement>('.composer-view:not([hidden]) input[type="search"]')!.value).toBe('gardening');
    expect(location.pathname+location.search).toBe('/posts/nearby?q=gardening&scope=all');
    const scroller=page.querySelector<HTMLElement>('.composer-view:not([hidden])')!,scrollTo=vi.fn();scroller.scrollTo=scrollTo;
    act(()=>page.querySelector<HTMLElement>('.mode-content-header h1')!.click());expect(scrollTo).toHaveBeenCalledWith({top:0,behavior:'smooth'});
  });
  it('returns All posts to the feed after opening a DM URL directly',async()=>{
    history.replaceState(null,'','/posts/messages/person-one%3Aperson-two');
    await mount();await load();dom.frame();
    const page=dom.container.querySelector('.social-posts')!;
    expect(page.querySelector('h1')?.textContent).toBe('Messages');
    expect(page.querySelector('.mode-sidebar [aria-current="page"]')?.textContent).toBe('Messages');
    await act(async()=>[...page.querySelectorAll<HTMLButtonElement>('.mode-sidebar nav button')].find(x=>x.textContent==='All posts')!.click());dom.frame();
    expect(location.pathname).toBe('/feed');expect(page.querySelector('h1')?.textContent).toBe('Posts');
    await act(async()=>[...page.querySelectorAll<HTMLButtonElement>('.mode-sidebar nav button')].find(x=>x.textContent==='Messages')!.click());dom.frame();
    expect(location.pathname).toBe('/posts/messages');
    await travel('back');expect(location.pathname).toBe('/feed');
    await travel('back');expect(location.pathname).toBe('/posts/messages/person-one%3Aperson-two');
  });
  it('resets a sidebar section to its root rather than restoring a record from its stack',async()=>{
    history.replaceState(null,'','/posts/example');await mount();await load();dom.frame();
    const page=dom.container.querySelector('.social-posts')!;
    expect(page.querySelector('h1')?.textContent).toBe('Post');
    const select=async(label:string)=>{await act(async()=>[...page.querySelectorAll<HTMLButtonElement>('.mode-sidebar nav button')].find(x=>x.textContent===label)!.click());dom.frame();};
    await select('People');expect(location.pathname).toBe('/posts/nearby');
    await select('All posts');expect(location.pathname).toBe('/feed');expect(page.querySelector('h1')?.textContent).toBe('Posts');
  });
  it.each(['Posts','Friends'])('opens a curated selection from the Agent sidepanel in the %s main panel',async(mode)=>{
    vi.stubGlobal('innerWidth',1600);vi.stubGlobal('innerHeight',900);
    const base=transport.operation.getMockImplementation()!;
    transport.operation.mockImplementation((name:string,input:any)=>name==='posts.list'&&input?.scope==='selected'?Promise.resolve({items:input.postIds.map((id:string)=>({id,userId:'friend',text:`Selected ${id}`,createdAt:new Date().toISOString(),city:'',likeCount:0,replyCount:0,liked:false})),nextCursor:null}):base(name,input));
    await mount();await act(async()=>bootstrap.resolve({...initial,messages:[{id:'side-link',role:'assistant',text:'[Your selected posts](/selected-posts?ids=post-b,post-a)',createdAt:new Date().toISOString(),source:'app'}]}));
    await act(async()=>dom.container.querySelector<HTMLButtonElement>(`.mode-switch [aria-label="${mode}"]`)!.click());
    await act(async()=>dom.container.querySelector<HTMLButtonElement>('.agent-dock-toggle')!.click());
    const input=dom.container.querySelector<HTMLTextAreaElement>('#thought')!;act(()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'Keep this draft');input.dispatchEvent(new Event('input',{bubbles:true}));});
    const link=dom.container.querySelector<HTMLAnchorElement>('.workspace .conversation a')!;
    await act(async()=>link.click());dom.frame();
    expect(dom.container.querySelector('.app')?.getAttribute('data-mode')).toBe(mode.toLowerCase());
    const page=dom.container.querySelector(`.social-${mode.toLowerCase()} .composer-view:not([hidden])`)!;
    expect([...page.querySelectorAll('.post-card')].map(card=>card.getAttribute('data-post-id'))).toEqual(['post-b','post-a']);
    expect(transport.operation).toHaveBeenCalledWith('posts.list',{scope:'selected',postIds:['post-b','post-a']});
    expect(dom.container.querySelector<HTMLElement>('.workspace')!.hidden).toBe(false);expect(input.value).toBe('Keep this draft');
    expect(location.pathname).toBe(mode==='Posts'?'/selected-posts':'/friends/selected-posts');
  });
  it('puts Notifications first in Settings',async()=>{
    await mount();await load();await act(async()=>dom.container.querySelector<HTMLButtonElement>('.settings-button')!.click());
    expect(dom.container.querySelector('.settings-menu button')?.textContent).toBe('Notifications');
  });
  it('opens a message notification in the launcher and preserves the underlying view', async () => {
    await mount();
    const notification = { id: 'notice', read: false, kind: 'message' as const, title: 'Message from Friend', text: 'hello', createdAt: new Date().toISOString(), link: { rel: 'open_in_newdrugs' as const, targetKind: 'exact' as const, resourceType: 'conversation', title: 'Open conversation', url: 'https://dev.druggie.org/messages/connection' } };
    await act(async () => bootstrap.resolve({ ...initial, notifications: { unread: 1, items: [notification] } }));
    transport.operation.mockImplementation(async (name: string) => name === 'connections.get' ? { connection: { id: 'connection', fromId: 'friend', toId: 'user', members: ['friend','user'], status: 'accepted', note: 'an invitation', createdAt: new Date().toISOString() }, people: [] } : { items: [], nextCursor: null, people: [] });
    act(() => dom.container.querySelector<HTMLButtonElement>('.launcher-button')!.click());
    await act(async () => [...dom.container.querySelectorAll<HTMLButtonElement>('.launcher-menu button')].find(button => button.textContent === 'Posts')!.click());
    const original = dom.container.querySelector('.post-composer');
    act(() => dom.container.querySelector<HTMLButtonElement>('.settings-button')!.click());
    await act(async () => dom.container.querySelector<HTMLButtonElement>('.notification-list button')!.click());
    expect(dom.container.querySelector('dialog')).toBeNull();
    expect(dom.container.querySelector('.composer-switcher')?.classList.contains('launcher-open')).toBe(true);
    expect(dom.container.querySelector('.composer-view:not([hidden]) .message-view')).not.toBeNull();
    act(() => dom.container.querySelector<HTMLButtonElement>('.composer-view:not([hidden]) .composer-surface-footer button')!.click());
    expect(dom.container.querySelector('.composer-view:not([hidden]) .post-composer')).toBe(original);
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
