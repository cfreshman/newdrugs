// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgressiveText } from '../src/useProgressiveText';
import { AgentLiveMessage } from '../src/AgentLiveMessage';
import type { RunView } from '../shared/types';
import { setupDOM } from './dom';

describe('progressive thinking text', () => {
  let dom: ReturnType<typeof setupDOM>;
  beforeEach(() => { dom = setupDOM(); });
  afterEach(() => dom.cleanup());
  function Text({ text, enabled = true, run = 'one' }: { text: string; enabled?: boolean; run?: string }) {
    return createElement('span', null, useProgressiveText(text, enabled, run));
  }
  const render = (text: string, enabled = true, run = 'one') => act(() => dom.root.render(createElement(Text, { text, enabled, run })));

  it('reveals even the first preamble at a steady 90 characters per second', () => {
    const text = 'Looking for people nearby'; render(text);
    expect(dom.container.textContent).toBe('');
    dom.frame(100);
    expect(dom.container.textContent!.length).toBe(9);
    expect(text.startsWith(dom.container.textContent!)).toBe(true);
    dom.frame(100);
    expect(dom.container.textContent!.length).toBe(18);
    dom.frame(100);
    expect(dom.container.textContent).toBe(text);
    expect(dom.frames.size).toBe(0);
  });
  it('keeps the visible prefix when chunks arrive and never replays a finished line', () => {
    render('Looking nearby'); dom.frame(25);
    const prefix = dom.container.textContent!;
    render('Looking nearby for friends');
    expect(dom.container.textContent).toBe(prefix);
    dom.frame(300);
    render('Looking nearby for friends');
    expect(dom.container.textContent).toBe('Looking nearby for friends');
    expect(dom.frames.size).toBe(0);
  });
  it('drops stale animation on a new phrase/run and does not split graphemes', () => {
    render('Checking people'); dom.frame(20);
    const text = '👩🏽‍💻 Finding cafés'; render(text, true, 'two');
    expect(dom.container.textContent).toBe('');
    dom.frame(12);
    expect(dom.container.textContent).toBe('👩🏽‍💻');
    dom.frame(300);
    expect(dom.container.textContent).toBe(text);
  });
  it('keeps progressive appearance enabled regardless of matching media queries', () => {
    vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener(){},removeEventListener(){}})); render('Checking people nearby'); dom.frame(100);
    expect(dom.container.textContent!.length).toBe(9);
    dom.frame(300); expect(dom.container.textContent).toBe('Checking people nearby');
  });
  it('shows the full answer and consequential status immediately, canceling commentary frames', () => {
    const run: RunView = { id: 'one', status: 'running', phase: 'reading', preamble: 'Checking people nearby', draft: '', progress: [], approvals: [], revision: 1, clientId: 'client' };
    act(() => dom.root.render(createElement(AgentLiveMessage, { run })));
    dom.frame(20);
    expect(dom.container.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe(run.preamble);
    act(() => dom.root.render(createElement(AgentLiveMessage, { run: { ...run, status: 'completed', preamble: '', draft: 'Here is the **complete** answer.' } })));
    expect(dom.container.querySelector('p')?.textContent).toBe('Here is the complete answer.');
    expect(dom.frames.size).toBe(0);
    act(() => dom.root.render(createElement(AgentLiveMessage, { run: { ...run, status: 'waiting_for_approval' } })));
    expect(dom.container.textContent).toBe('Waiting for your approval');
  });
  it('progressively reveals the live message body too, not only the small status line', () => {
    const run: RunView = { id: 'body', status: 'running', draft: 'Here are some nearby people you might like to meet.', progress: [], approvals: [], revision: 1, clientId: 'client' };
    act(() => dom.root.render(createElement(AgentLiveMessage, { run })));
    dom.frame(100);
    expect(dom.container.querySelector('p')?.textContent).toBe(run.draft.slice(0, 9).trimEnd());
    act(() => dom.root.render(createElement(AgentLiveMessage, { run: { ...run, status: 'completed' } })));
    expect(dom.container.querySelector('p')?.textContent).toBe(run.draft);
    expect(dom.frames.size).toBe(0);
  });
});
