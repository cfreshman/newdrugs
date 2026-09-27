// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindPageChatScroll } from '../src/usePageChatScroll';
import { setupDOM } from './dom';

describe('base-page chat scrolling', () => {
  let dom: ReturnType<typeof setupDOM>, page: HTMLDivElement, chat: HTMLDivElement, background: HTMLDivElement, input: HTMLTextAreaElement;
  let blocked: boolean, cleanup: () => void;
  const wheel = (target: Element, init: WheelEventInit = {}) => { const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80, ...init }); target.dispatchEvent(event); return event; };
  const touch = (target: Element, type: string, points: { clientX: number; clientY: number }[]) => {
    const event = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(event, 'touches', { value: points }); target.dispatchEvent(event); return event;
  };
  beforeEach(() => {
    dom = setupDOM(); blocked = false;
    page = document.createElement('div'); chat = document.createElement('div'); background = document.createElement('div'); input = document.createElement('textarea');
    page.append(background, chat, input); document.body.append(page);
    Object.defineProperties(chat, { clientHeight: { value: 200 }, scrollHeight: { value: 2000 } });
    chat.scrollTop = 500;
    cleanup = bindPageChatScroll(page, chat, { blocked: () => blocked, onScroll: vi.fn() });
  });
  afterEach(() => { cleanup(); dom.cleanup(); });
  it('routes background wheels once and leaves native chat scrolling alone', () => {
    expect(wheel(background).defaultPrevented).toBe(true); expect(chat.scrollTop).toBe(580);
    expect(wheel(chat).defaultPrevented).toBe(false); expect(chat.scrollTop).toBe(580);
    wheel(background, { deltaMode: 1, deltaY: 2 }); expect(chat.scrollTop).toBe(628);
    wheel(background, { deltaMode: 2, deltaY: 1 }); expect(chat.scrollTop).toBe(828);
  });
  it('never redirects while a modal or another focused control owns the interaction', () => {
    input.focus(); expect(wheel(background).defaultPrevented).toBe(false); expect(chat.scrollTop).toBe(500);
    input.blur(); blocked = true; wheel(background); expect(chat.scrollTop).toBe(500);
    blocked = false;
    const dialog = document.createElement('dialog'); dialog.setAttribute('open', ''); page.append(dialog);
    wheel(background); expect(chat.scrollTop).toBe(500);
    dialog.remove(); wheel(background); expect(chat.scrollTop).toBe(580);
  });
  it('keeps background scrolling after autofocus without stealing typing keys or textarea scrolling', () => {
    const composer = document.createElement('div'); composer.className = 'composer-input-layer'; page.append(composer); composer.append(input);
    input.focus(); expect(wheel(background).defaultPrevented).toBe(true); expect(chat.scrollTop).toBe(580);
    const arrow = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }); input.dispatchEvent(arrow);
    expect(arrow.defaultPrevented).toBe(false); expect(chat.scrollTop).toBe(580);
    expect(wheel(input).defaultPrevented).toBe(false); expect(chat.scrollTop).toBe(580);
    const launcher = document.createElement('div'); launcher.className = 'launcher-controls'; const button = document.createElement('button'); launcher.append(button); page.append(launcher);
    button.focus(); wheel(background); expect(chat.scrollTop).toBe(660);
  });
  it('preserves input scrolling, nested scroll surfaces, horizontal gestures and pinch zoom', () => {
    wheel(input); expect(chat.scrollTop).toBe(500);
    background.style.overflowY = 'auto'; Object.defineProperties(background, { clientHeight: { value: 50 }, scrollHeight: { value: 500 } });
    expect(wheel(background).defaultPrevented).toBe(false);
    background.style.overflowY = '';
    expect(wheel(background, { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(wheel(background, { deltaX: 100 }).defaultPrevented).toBe(false);
    expect(wheel(background, { shiftKey: true }).defaultPrevented).toBe(false);
    expect(chat.scrollTop).toBe(500);
  });
  it('supports mobile background swipes and cancels momentum as soon as a modal opens', () => {
    touch(background, 'touchstart', [{ clientX: 20, clientY: 200 }]);
    dom.frame(20);
    expect(touch(background, 'touchmove', [{ clientX: 20, clientY: 150 }]).defaultPrevented).toBe(true);
    expect(chat.scrollTop).toBe(550);
    touch(background, 'touchend', []);
    dom.frame(16); expect(chat.scrollTop).toBeGreaterThan(550);
    const top = chat.scrollTop; blocked = true; dom.frame(16);
    expect(chat.scrollTop).toBe(top); expect(dom.frames.size).toBe(0);
  });
  it('leaves orb drags, native transcript swipes and two-finger gestures alone', () => {
    const orb = document.createElement('button'); page.append(orb);
    for (const target of [orb, chat, input]) {
      touch(target, 'touchstart', [{ clientX: 20, clientY: 200 }]);
      expect(touch(target, 'touchmove', [{ clientX: 20, clientY: 100 }]).defaultPrevented).toBe(false);
    }
    touch(background, 'touchstart', [{ clientX: 20, clientY: 200 }]);
    expect(touch(background, 'touchmove', [{ clientX: 20, clientY: 100 }, { clientX: 50, clientY: 120 }]).defaultPrevented).toBe(false);
    expect(chat.scrollTop).toBe(500);
  });
  it('supports page keys only while the base page has focus, and removes listeners on teardown', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', cancelable: true })); expect(chat.scrollTop).toBe(330);
    input.focus(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', cancelable: true })); expect(chat.scrollTop).toBe(330);
    input.blur(); cleanup(); wheel(background); expect(chat.scrollTop).toBe(330);
  });
});

describe('social-mode background scrolling',()=>{
 let dom:ReturnType<typeof setupDOM>,page:HTMLDivElement,content:HTMLDivElement,background:HTMLDivElement,cleanup:()=>void;
 beforeEach(()=>{dom=setupDOM();page=document.createElement('div');content=document.createElement('div');background=document.createElement('div');page.append(background,content);document.body.append(page);Object.defineProperties(content,{clientHeight:{value:200},scrollHeight:{value:2000}});content.scrollTop=100;cleanup=bindPageChatScroll(page,content,{surface:'content',blocked:()=>false,onScroll:vi.fn()});});
 afterEach(()=>{cleanup();dom.cleanup();});
 const wheel=(target:Element)=>{const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:80});target.dispatchEvent(event);return event;};
 it('scrolls the main content after using a navigation button',()=>{
  const tab=document.createElement('button');page.append(tab);tab.focus();expect(wheel(background).defaultPrevented).toBe(true);expect(content.scrollTop).toBe(180);
 });
 it('leaves the native content, agent subpanel, inputs and dialogs alone',()=>{
  expect(wheel(content).defaultPrevented).toBe(false);
  const dock=document.createElement('div');dock.className='workspace';page.append(dock);expect(wheel(dock).defaultPrevented).toBe(false);
  const input=document.createElement('input');content.append(input);input.focus();expect(wheel(background).defaultPrevented).toBe(false);input.blur();
  const modal=document.createElement('div');modal.setAttribute('aria-modal','true');page.append(modal);expect(wheel(background).defaultPrevented).toBe(false);expect(content.scrollTop).toBe(100);
 });
});
