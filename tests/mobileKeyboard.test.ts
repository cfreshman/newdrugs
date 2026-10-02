// @vitest-environment jsdom
import { act, createElement, useRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setupDOM } from './dom';
import { useChatPosition } from '../src/useChatPosition';
let dom: ReturnType<typeof setupDOM>;
let viewport: EventTarget & { width: number; height: number; offsetTop: number; offsetLeft: number; scale: number };
let controls:ReturnType<typeof useChatPosition>;
function Probe({expanded=false}:{expanded?:boolean}) { const ref = useRef<HTMLDivElement>(null); const position = useChatPosition(ref,true,expanded,expanded);controls=position; return createElement('div', { ref, style: position.style, 'data-draggable': position.draggable }, createElement('textarea')); }
beforeEach(() => {
  dom = setupDOM(); localStorage.clear();
  vi.stubGlobal('innerWidth', 390); vi.stubGlobal('innerHeight', 844);
  viewport = Object.assign(new EventTarget(), { width: 390, height: 844, offsetTop: 0, offsetLeft: 0, scale: 1 }); vi.stubGlobal('visualViewport', viewport);
  document.documentElement.style.cssText = '--chat-width:480px;--chat-gutter:12px;--orb-radius:36px';
});
afterEach(() => dom.cleanup());
it('stays at the visible bottom as an iPhone PWA keyboard resizes and pans, then closes', () => {
  act(() => dom.root.render(createElement(Probe)));
  for (const state of [{ height: 360, top: 240 }, { height: 360, top: 280 }, { height: 844, top: 0 }]) {
    act(() => { vi.stubGlobal('innerHeight', state.height); viewport.height = state.height; viewport.offsetTop = state.top; viewport.dispatchEvent(new Event('resize')); viewport.dispatchEvent(new Event('scroll')); });
    const node = dom.container.firstElementChild as HTMLElement;
    expect(parseFloat(node.style.getPropertyValue('--chat-y'))).toBe(state.top + state.height - 12 - 36);
    expect(node.dataset.draggable).toBe('false');
    expect(localStorage.getItem('nd-chat-position')).toBeNull();
  }
});
it('centers mobile chat in a panned visible viewport instead of the layout viewport', () => {
  viewport.width = 300; viewport.offsetLeft = 40;
  act(() => dom.root.render(createElement(Probe)));
  expect((dom.container.firstElementChild as HTMLElement).style.getPropertyValue('--chat-x')).toBe('190px');
});
it('keeps a touch tablet at the visible bottom without enabling desktop dragging', () => {
  vi.stubGlobal('innerWidth', 1024); vi.stubGlobal('innerHeight', 500);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' }));
  viewport.width = 1024; viewport.height = 500; viewport.offsetTop = 200;
  act(() => dom.root.render(createElement(Probe)));
  const node = dom.container.firstElementChild as HTMLElement;
  expect(node.style.getPropertyValue('--chat-y')).toBe('652px');
  expect(node.dataset.draggable).toBe('false');
});
it('removes only the safe-area inset when iOS shrinks both heights, and restores it after dismissal', () => {
  document.documentElement.style.setProperty('--safe-area-bottom', '34px');
  act(() => dom.root.render(createElement(Probe)));
  const node = dom.container.firstElementChild as HTMLElement;
  expect(node.style.getPropertyValue('--chat-y')).toBe('762px');
  act(() => { dom.container.querySelector('textarea')!.focus(); vi.stubGlobal('innerHeight', 500); viewport.height = 500; viewport.offsetTop = 100; viewport.dispatchEvent(new Event('resize')); });
  expect(node.style.getPropertyValue('--chat-y')).toBe('564px');
  expect(node.style.getPropertyValue('--safe-area-bottom')).toBe('0px');
  expect(node.style.getPropertyValue('--orb-size')).toBe('var(--launcher-size)');
  expect(node.style.getPropertyValue('--orb-radius')).toBe('calc(var(--launcher-size) / 2)');
  act(() => dom.container.querySelector('textarea')!.blur());
  expect(node.style.getPropertyValue('--safe-area-bottom')).toBe('0px');
  act(() => { vi.stubGlobal('innerHeight', 844); viewport.height = 844; viewport.offsetTop = 0; viewport.dispatchEvent(new Event('resize')); });
  expect(node.style.getPropertyValue('--chat-y')).toBe('762px');
  expect(node.style.getPropertyValue('--safe-area-bottom')).toBe('');
  expect(node.style.getPropertyValue('--orb-size')).toBe('');
  expect(node.style.getPropertyValue('--orb-radius')).toBe('');
});
it('restores the mobile viewport when the closing keyboard sends no final resize', () => {
  vi.useFakeTimers();
  try {
    document.documentElement.style.setProperty('--safe-area-bottom', '34px');
    act(() => dom.root.render(createElement(Probe)));
    const node = dom.container.firstElementChild as HTMLElement;
    act(() => { dom.container.querySelector('textarea')!.focus(); vi.stubGlobal('innerHeight', 360); viewport.height = 360; viewport.offsetTop = 240; viewport.dispatchEvent(new Event('resize')); });
    expect(node.style.getPropertyValue('--viewport-height')).toBe('360px');
    act(() => dom.container.querySelector('textarea')!.blur());
    act(() => vi.advanceTimersByTime(500));
    expect(controls.keyboardOpen).toBe(false);
    expect(node.style.getPropertyValue('--viewport-height')).toBe('844px');
    expect(node.style.getPropertyValue('--viewport-top')).toBe('0px');
    expect(node.style.getPropertyValue('--safe-area-bottom')).toBe('');
    act(() => viewport.dispatchEvent(new Event('resize')));
    expect(node.style.getPropertyValue('--viewport-height')).toBe('844px');
  } finally { vi.useRealTimers(); }
});
it('reads recovered viewport values after blur even without a resize event', () => {
  vi.useFakeTimers();
  try {
    act(() => dom.root.render(createElement(Probe)));
    const node = dom.container.firstElementChild as HTMLElement;
    act(() => { dom.container.querySelector('textarea')!.focus(); viewport.height = 360; viewport.offsetTop = 240; viewport.dispatchEvent(new Event('resize')); });
    act(() => dom.container.querySelector('textarea')!.blur());
    viewport.height = 844;viewport.offsetTop = 0;
    act(() => vi.advanceTimersByTime(500));
    expect(controls.keyboardOpen).toBe(false);
    expect(node.style.getPropertyValue('--viewport-height')).toBe('844px');
    expect(node.style.getPropertyValue('--viewport-top')).toBe('0px');
  } finally { vi.useRealTimers(); }
});
it('does not mistake pinch zoom or browser chrome for the keyboard', () => {
  document.documentElement.style.setProperty('--safe-area-bottom', '34px');
  act(() => dom.root.render(createElement(Probe)));
  const node = dom.container.firstElementChild as HTMLElement;
  act(() => { dom.container.querySelector('textarea')!.focus(); viewport.scale = 2; viewport.height = 422; viewport.dispatchEvent(new Event('resize')); });
  expect(node.style.getPropertyValue('--safe-area-bottom')).toBe('');
  act(() => { viewport.scale = 1; viewport.height = 780; viewport.dispatchEvent(new Event('resize')); });
  expect(node.style.getPropertyValue('--safe-area-bottom')).toBe('');
});
it('commits the viewport position before a resize event returns', () => {
  act(() => dom.root.render(createElement(Probe)));
  const node = dom.container.firstElementChild as HTMLElement;
  act(() => {
    dom.container.querySelector('textarea')!.focus(); viewport.height = 500; viewport.offsetTop = 100;
    viewport.dispatchEvent(new Event('resize'));
    expect(node.style.getPropertyValue('--chat-y')).toBe('564px');
  });
});

it('ignores a saved elevated desktop position and only drags horizontally',()=>{
  vi.stubGlobal('innerWidth',1600);vi.stubGlobal('innerHeight',900);viewport.width=1600;viewport.height=900;
  localStorage.setItem('nd-chat-position',JSON.stringify({x:.4,y:.3}));
  act(()=>dom.root.render(createElement(Probe)));
  const node=dom.container.firstElementChild as HTMLElement;
  expect(node.dataset.draggable).toBe('true');expect(node.style.getPropertyValue('--chat-x')).toBe('640px');expect(node.style.getPropertyValue('--chat-y')).toBe('852px');
  act(()=>{controls.onDragStart();controls.onDrag(120,-500);});
  expect(node.style.getPropertyValue('--chat-x')).toBe('760px');expect(node.style.getPropertyValue('--chat-y')).toBe('852px');
  act(()=>controls.onDragEnd());expect(JSON.parse(localStorage.getItem('nd-chat-position')!)).toEqual({x:760/1600,y:1});
  act(()=>controls.onNudge(0,-30));expect(node.style.getPropertyValue('--chat-y')).toBe('852px');
  act(()=>controls.onNudge(-30,0));expect(node.style.getPropertyValue('--chat-x')).toBe('730px');
});
it('keeps expanded desktop panels pinned while the viewport changes and horizontal bounds clamp',()=>{
  vi.stubGlobal('innerWidth',1600);vi.stubGlobal('innerHeight',900);viewport.width=1600;viewport.height=900;
  act(()=>dom.root.render(createElement(Probe,{expanded:true})));
  const node=dom.container.firstElementChild as HTMLElement;
  expect(controls.sideBySide).toBe(true);
  act(()=>{controls.onDragStart();controls.onDrag(10000,-10000);});
  expect(node.style.getPropertyValue('--chat-x')).toBe('1348px');expect(node.style.getPropertyValue('--chat-y')).toBe('852px');
  act(()=>{viewport.height=650;viewport.offsetTop=20;viewport.dispatchEvent(new Event('resize'));});
  expect(node.style.getPropertyValue('--chat-y')).toBe('622px');
});
