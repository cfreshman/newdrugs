// @vitest-environment jsdom
import { act, createElement, useRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setupDOM } from './dom';
import { useChatPosition } from '../src/useChatPosition';

let dom: ReturnType<typeof setupDOM>;
let controls: ReturnType<typeof useChatPosition>;
function Probe({expanded=false}:{expanded?:boolean}) {
  const ref = useRef<HTMLDivElement>(null);
  const position = useChatPosition(ref,true,expanded,expanded);
  controls=position;
  return createElement('div', { ref, style: position.style, 'data-draggable': position.draggable }, createElement('textarea'));
}
beforeEach(() => {
  dom = setupDOM(); localStorage.clear();
  vi.stubGlobal('innerWidth', 390); vi.stubGlobal('innerHeight', 844);
  document.documentElement.style.cssText = '--chat-width:480px;--chat-gutter:12px;--orb-radius:36px';
});
afterEach(() => dom.cleanup());

it('anchors mobile chat with CSS dynamic viewport units without measuring a visual viewport', () => {
  act(() => dom.root.render(createElement(Probe)));
  const node = dom.container.firstElementChild as HTMLElement;
  expect(node.style.getPropertyValue('--chat-x')).toBe('50vw');
  expect(node.style.getPropertyValue('--chat-y')).toBe('calc(100dvh - var(--chat-gutter) - var(--safe-area-bottom) - var(--orb-radius))');
  expect(node.dataset.draggable).toBe('false');
  expect(localStorage.getItem('nd-chat-position')).toBeNull();
  act(() => { vi.stubGlobal('innerHeight', 500); window.dispatchEvent(new Event('resize')); });
  expect(node.style.getPropertyValue('--chat-y')).toContain('100dvh');
});
it('uses ordinary window resize and focused input to toggle keyboard spacing', () => {
  document.documentElement.style.setProperty('--safe-area-bottom', '34px');
  act(() => dom.root.render(createElement(Probe)));
  const node = dom.container.firstElementChild as HTMLElement;
  act(() => { dom.container.querySelector('textarea')!.focus(); vi.stubGlobal('innerHeight', 500); window.dispatchEvent(new Event('resize')); });
  expect(controls.keyboardOpen).toBe(true);
  expect(node.style.getPropertyValue('--safe-area-bottom')).toBe('0px');
  expect(node.style.getPropertyValue('--orb-size')).toBe('var(--launcher-size)');
  act(() => dom.container.querySelector('textarea')!.blur());
  expect(controls.keyboardOpen).toBe(false);
  expect(node.style.getPropertyValue('--safe-area-bottom')).toBe('');
  expect(node.style.getPropertyValue('--orb-size')).toBe('');
});
it('keeps touch tablets centered without desktop dragging', () => {
  vi.stubGlobal('innerWidth', 1024); vi.stubGlobal('innerHeight', 500);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' }));
  act(() => dom.root.render(createElement(Probe)));
  const node = dom.container.firstElementChild as HTMLElement;
  expect(node.style.getPropertyValue('--chat-x')).toBe('50vw');
  expect(node.style.getPropertyValue('--chat-y')).toContain('100dvh');
  expect(node.dataset.draggable).toBe('false');
});
it('preserves desktop horizontal drag and bottom anchoring',()=>{
  vi.stubGlobal('innerWidth',1600);vi.stubGlobal('innerHeight',900);
  localStorage.setItem('nd-chat-position',JSON.stringify({x:.4,y:.3}));
  act(()=>dom.root.render(createElement(Probe)));
  const node=dom.container.firstElementChild as HTMLElement;
  expect(node.dataset.draggable).toBe('true');
  expect(node.style.getPropertyValue('--chat-x')).toBe('640px');
  expect(node.style.getPropertyValue('--chat-y')).toBe('852px');
  act(()=>{controls.onDragStart();controls.onDrag(120,-500);});
  expect(node.style.getPropertyValue('--chat-x')).toBe('760px');
  expect(node.style.getPropertyValue('--chat-y')).toBe('852px');
  act(()=>controls.onDragEnd());
  expect(JSON.parse(localStorage.getItem('nd-chat-position')!)).toEqual({x:760/1600,y:1});
  act(()=>{vi.stubGlobal('innerHeight',650);window.dispatchEvent(new Event('resize'));});
  expect(node.style.getPropertyValue('--chat-y')).toBe('602px');
});
