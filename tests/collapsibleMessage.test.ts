// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollapsibleMessage } from '../src/CollapsibleMessage';
import { rect, setupDOM } from './dom';

describe('long messages', () => {
  let dom: ReturnType<typeof setupDOM>, height: number, scroller: HTMLDivElement;
  beforeEach(() => {
    dom = setupDOM(); height = 600;
    scroller = document.createElement('div'); document.body.append(scroller);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('message-text') ? height : 3000; });
  });
  afterEach(() => dom.cleanup());
  const render = (assistant = false, text = 'Start\n\n[Open profile](/profile)\n\nEnd') => act(() => dom.root.render(createElement(CollapsibleMessage, { text, assistant, scrollRef: { current: scroller } })));
  const button = () => dom.container.querySelector<HTMLButtonElement>('button[aria-controls]');
  const preview = () => dom.container.querySelector<HTMLElement>('.message-preview')!;
  it('uses Wayfinder mobile/user thresholds and doubles desktop assistant previews', () => {
    height = 400; render(true);
    expect(preview().style.maxHeight).toBe('256px');
    dom.desktop(true);
    expect(button()).toBeNull();
    height = 800; dom.resize();
    expect(preview().style.maxHeight).toBe('512px');
    render(false);
    expect(preview().style.maxHeight).toBe('256px');
    height = 280; dom.resize();
    expect(button()).toBeNull();
  });
  it('expands without following the toggle down, keeping full text and links mounted', () => {
    render(true); scroller.scrollTop = 150;
    const link = dom.container.querySelector('a');
    expect(button()?.textContent).toContain('Show more');
    act(() => button()!.click());
    expect(preview().style.maxHeight).toBe('');
    expect(scroller.scrollTop).toBe(150);
    expect(button()?.getAttribute('aria-expanded')).toBe('true');
    expect(button()?.textContent).toContain('Show less');
    expect(dom.container.querySelector('a')).toBe(link);
    expect(dom.container.textContent).toContain('End');
  });
  it('anchors the bottom edge on collapse and clamps to the start of the conversation', () => {
    render(); act(() => button()!.click()); scroller.scrollTop = 900;
    vi.spyOn(dom.container.firstElementChild!, 'getBoundingClientRect').mockReturnValueOnce(rect(0, 0, 300, 400)).mockReturnValueOnce(rect(0, 0, 300, 56));
    act(() => button()!.click());
    expect(scroller.scrollTop).toBe(556);
    act(() => button()!.click()); scroller.scrollTop = 50;
    vi.spyOn(dom.container.firstElementChild!, 'getBoundingClientRect').mockReturnValueOnce(rect(0, 0, 300, 760)).mockReturnValueOnce(rect(0, 0, 300, 416));
    act(() => button()!.click());
    expect(scroller.scrollTop).toBe(0);
  });
  it('keeps a visible pointer-activated link stable but exposes keyboard-focused links', () => {
    render(true);
    const link = dom.container.querySelector('a')!;
    const click = vi.fn((event: Event) => event.preventDefault()); link.addEventListener('click', click);
    act(() => {
      link.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      link.focus(); link.click();
      link.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    });
    expect(click).toHaveBeenCalledOnce();
    expect(button()?.getAttribute('aria-expanded')).toBe('false');
    act(() => { link.blur(); link.focus(); });
    expect(button()?.getAttribute('aria-expanded')).toBe('true');
  });
});
