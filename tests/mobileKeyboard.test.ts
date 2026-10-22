// @vitest-environment jsdom
import { act, createElement, useRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { rect, setupDOM } from './dom';
import { useChatPosition } from '../src/useChatPosition';
import { artifactEditableFocused, clearArtifactEditableFocus, setArtifactEditableFocus } from '../src/embeddedArtifactFocus';

let dom: ReturnType<typeof setupDOM>;
let controls: ReturnType<typeof useChatPosition>;
function Probe({expanded=false}:{expanded?:boolean}) {
  const ref = useRef<HTMLDivElement>(null);
  const position = useChatPosition(ref,true,expanded,expanded);
  controls=position;
  return createElement('div', { ref, className:'app', style: position.style, 'data-draggable': position.draggable }, createElement('textarea'));
}
beforeEach(() => {
  dom = setupDOM(); localStorage.clear();
  vi.stubGlobal('innerWidth', 390); vi.stubGlobal('innerHeight', 844);
  document.documentElement.style.cssText = '--chat-width:480px;--chat-gutter:12px;--orb-radius:36px';
});
afterEach(() => { document.querySelectorAll('iframe').forEach(clearArtifactEditableFocus); dom.cleanup(); artifactEditableFocused(); });

it('anchors mobile chat with CSS dynamic viewport units without measuring a visual viewport', () => {
  act(() => dom.root.render(createElement(Probe)));
  const node = dom.container.firstElementChild as HTMLElement;
  expect(node.style.getPropertyValue('--chat-x')).toBe('50vw');
  expect(node.style.getPropertyValue('--chat-y')).toBe('calc(var(--app-viewport-bottom, 100dvh) - var(--chat-gutter) - var(--safe-area-bottom) - var(--orb-radius))');
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
  act(()=>{vi.stubGlobal('innerHeight',844);window.dispatchEvent(new Event('resize'));});
  expect(controls.keyboardOpen).toBe(false);
  expect(node.style.getPropertyValue('--safe-area-bottom')).toBe('');
  expect(node.style.getPropertyValue('--orb-size')).toBe('');
});
function visualViewport(){const visual=Object.assign(new EventTarget(),{height:844,width:390,offsetTop:0,offsetLeft:0,scale:1});vi.stubGlobal('visualViewport',visual);return visual;}
it('avoids a keyboard when only the visual viewport shrinks, then follows its vertical pan',()=>{
 const visual=visualViewport();act(()=>dom.root.render(createElement(Probe)));
 const node=dom.container.firstElementChild as HTMLElement;
 act(()=>{dom.container.querySelector('textarea')!.focus();visual.height=500;visual.dispatchEvent(new Event('resize'));});
 expect(innerHeight).toBe(844);expect(controls.keyboardOpen).toBe(true);expect(node.style.getPropertyValue('--app-viewport-height')).toBe('500px');expect(node.style.getPropertyValue('--keyboard-top')).toBe('0px');
 act(()=>{visual.offsetTop=100;visual.dispatchEvent(new Event('scroll'));});
 expect(node.style.getPropertyValue('--app-viewport-height')).toBe('500px');expect(node.style.getPropertyValue('--keyboard-top')).toBe('100px');
 act(()=>{visual.height=844;visual.offsetTop=0;visual.dispatchEvent(new Event('resize'));});
 expect(controls.keyboardOpen).toBe(false);expect(node.style.getPropertyValue('--app-viewport-height')).toBe('');expect(node.style.getPropertyValue('--orb-size')).toBe('');
});
it('does not double-subtract a keyboard when the layout also resizes',()=>{
 const visual=visualViewport();act(()=>dom.root.render(createElement(Probe)));
 const node=dom.container.firstElementChild as HTMLElement;
 act(()=>{dom.container.querySelector('textarea')!.focus();vi.stubGlobal('innerHeight',500);visual.height=500;visual.dispatchEvent(new Event('resize'));});
 expect(controls.keyboardOpen).toBe(true);expect(node.style.getPropertyValue('--app-viewport-height')).toBe('500px');
 act(()=>{vi.stubGlobal('innerHeight',360);visual.height=360;visual.offsetTop=240;visual.dispatchEvent(new Event('resize'));});
 expect(node.style.getPropertyValue('--keyboard-top')).toBe('240px');expect(node.style.getPropertyValue('--app-viewport-height')).toBe('360px');
});
it('keeps pinch zoom separate from keyboard sizing and preserves the existing inset while zoomed',()=>{
 const visual=visualViewport();act(()=>dom.root.render(createElement(Probe)));
 const node=dom.container.firstElementChild as HTMLElement;
 act(()=>{dom.container.querySelector('textarea')!.focus();visual.height=422;visual.scale=2;visual.dispatchEvent(new Event('resize'));});
 expect(controls.keyboardOpen).toBe(false);expect(node.style.getPropertyValue('--chat-x')).toBe('50vw');
 act(()=>{visual.scale=1;visual.height=500;visual.dispatchEvent(new Event('resize'));});
 expect(node.style.getPropertyValue('--app-viewport-height')).toBe('500px');
 act(()=>{visual.height=250;visual.scale=2;visual.offsetTop=120;visual.dispatchEvent(new Event('resize'));});
 expect(node.style.getPropertyValue('--app-viewport-height')).toBe('500px');expect(node.style.getPropertyValue('--keyboard-top')).toBe('0px');
 act(()=>{visual.height=422;visual.dispatchEvent(new Event('resize'));});expect(controls.keyboardOpen).toBe(false);
});
it('restores normal height on blur even without a final keyboard resize',()=>{
  const visual=visualViewport();act(()=>dom.root.render(createElement(Probe)));
  act(()=>{dom.container.querySelector('textarea')!.focus();visual.height=500;visual.dispatchEvent(new Event('resize'));});expect(controls.keyboardOpen).toBe(true);
  act(()=>dom.container.querySelector('textarea')!.blur());expect(controls.keyboardOpen).toBe(false);
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

function artifactFrame() {
  const frame = document.createElement('iframe');
  frame.tabIndex = 0;
  document.body.append(frame);
  vi.spyOn(frame, 'getClientRects').mockReturnValue([rect(0, 0, 300, 180)] as unknown as DOMRectList);
  return frame;
}

it('uses a validated editable relay from the focused artifact before another viewport event', async () => {
  const visual = visualViewport();
  document.documentElement.style.setProperty('--safe-area-bottom', '34px');
  act(() => dom.root.render(createElement(Probe)));
  const node = dom.container.firstElementChild as HTMLElement, frame = artifactFrame();
  await act(async () => { frame.focus(); visual.height = 500; setArtifactEditableFocus(frame, true); });
  expect(document.activeElement).toBe(frame);
  expect(controls.keyboardOpen).toBe(true);
  expect(node.style.getPropertyValue('--app-viewport-height')).toBe('500px');
  expect(node.style.getPropertyValue('--safe-area-bottom')).toBe('0px');
  expect(node.style.getPropertyValue('--orb-size')).toBe('var(--launcher-size)');
  await act(async () => clearArtifactEditableFocus(frame));
  expect(controls.keyboardOpen).toBe(false);
  expect(node.style.getPropertyValue('--app-viewport-height')).toBe('');
  expect(node.style.getPropertyValue('--safe-area-bottom')).toBe('');
  expect(node.style.getPropertyValue('--orb-size')).toBe('');
});

it('does not treat an iframe or an unfocused editable relay as a keyboard', async () => {
  const visual = visualViewport();
  act(() => dom.root.render(createElement(Probe)));
  const frame = artifactFrame();
  await act(async () => { visual.height = 500; setArtifactEditableFocus(frame, true); });
  expect(artifactEditableFocused()).toBe(false);
  expect(controls.keyboardOpen).toBe(false);
  act(() => { frame.focus(); visual.dispatchEvent(new Event('resize')); });
  expect(controls.keyboardOpen).toBe(false);
});

it('expires an artifact relay when browser focus moves and does not revive it on refocus', async () => {
  const visual = visualViewport();
  act(() => dom.root.render(createElement(Probe)));
  const frame = artifactFrame(), button = document.createElement('button');
  document.body.append(button);
  await act(async () => { frame.focus(); visual.height = 500; setArtifactEditableFocus(frame, true); });
  expect(controls.keyboardOpen).toBe(true);
  act(() => button.focus());
  expect(artifactEditableFocused()).toBe(false);
  expect(controls.keyboardOpen).toBe(false);
  act(() => frame.focus());
  expect(controls.keyboardOpen).toBe(false);
  await act(async () => setArtifactEditableFocus(frame, true));
  expect(controls.keyboardOpen).toBe(true);
});

it('requires a connected visible frame even when its last relay said editable', () => {
  const frame = artifactFrame(), wrapper = document.createElement('div');
  document.body.append(wrapper); wrapper.append(frame);
  for (const [property, value] of [['display', 'none'], ['visibility', 'hidden'], ['opacity', '0'], ['content-visibility', 'hidden']]) {
    frame.focus(); setArtifactEditableFocus(frame, true); expect(artifactEditableFocused()).toBe(true);
    wrapper.style.setProperty(property, value); expect(artifactEditableFocused()).toBe(false);
    wrapper.style.removeProperty(property); expect(artifactEditableFocused()).toBe(false);
  }
  for (const attribute of ['hidden', 'inert']) {
    frame.focus(); setArtifactEditableFocus(frame, true); expect(artifactEditableFocused()).toBe(true);
    wrapper.setAttribute(attribute, ''); expect(artifactEditableFocused()).toBe(false);
    wrapper.removeAttribute(attribute);
  }
  frame.focus(); setArtifactEditableFocus(frame, true); frame.remove();
  expect(artifactEditableFocused()).toBe(false);
  wrapper.append(frame); frame.focus(); expect(artifactEditableFocused()).toBe(false);
  vi.mocked(frame.getClientRects).mockReturnValue([] as unknown as DOMRectList);
  setArtifactEditableFocus(frame, true); expect(artifactEditableFocused()).toBe(false);
});

it('clears artifact keyboard state on removal without requiring a final browser resize', async () => {
  const visual = visualViewport();
  act(() => dom.root.render(createElement(Probe)));
  const frame = artifactFrame();
  await act(async () => { frame.focus(); visual.height = 500; setArtifactEditableFocus(frame, true); });
  expect(controls.keyboardOpen).toBe(true);
  await act(async () => { frame.remove(); clearArtifactEditableFocus(frame); });
  expect(controls.keyboardOpen).toBe(false);
  expect(artifactEditableFocused()).toBe(false);
});

it('ignores a stale clear from another artifact and preserves zoom gating', async () => {
  const visual = visualViewport();
  act(() => dom.root.render(createElement(Probe)));
  const node = dom.container.firstElementChild as HTMLElement, first = artifactFrame(), second = artifactFrame();
  await act(async () => { first.focus(); visual.height = 500; setArtifactEditableFocus(first, true); });
  await act(async () => { second.focus(); setArtifactEditableFocus(second, true); clearArtifactEditableFocus(first); });
  expect(artifactEditableFocused()).toBe(true);
  expect(controls.keyboardOpen).toBe(true);
  await act(async () => { visual.height = 250; visual.scale = 2; visual.offsetTop = 120; setArtifactEditableFocus(second, true); });
  expect(node.style.getPropertyValue('--app-viewport-height')).toBe('500px');
  expect(node.style.getPropertyValue('--keyboard-top')).toBe('0px');
  expect(node.style.getPropertyValue('--chat-x')).toBe('50vw');
  await act(async () => clearArtifactEditableFocus(second));
  expect(controls.keyboardOpen).toBe(false);
  expect(node.style.getPropertyValue('--app-viewport-height')).toBe('');
});
