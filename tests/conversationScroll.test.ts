// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdConversationScroll, shouldFadeConversationTop, useConversationScroll } from '../src/useConversationScroll';
import { rect, setupDOM } from './dom';

describe('conversation position and top fade', () => {
  let dom: ReturnType<typeof setupDOM>, viewportHeight: number, top: number;
  let scroll: ReturnType<typeof useConversationScroll>;
  type Signals = Parameters<typeof useConversationScroll>[0];
  function Chat({ height, signals, ready,anchor=false }: { height: number; signals: Signals; ready: boolean;anchor?:boolean }) {
    scroll = useConversationScroll(signals);
    return ready ? createElement('div', { className: 'conversation', ref: scroll.transcript, onScroll: scroll.onScroll, 'data-fade-top': scroll.fadedTop },
      createElement('div', { ref: scroll.content, 'data-height': height }, anchor?createElement('div',{'data-message-id':'anchor'},'Message'):'Messages')) : null;
  }
  const render = (height = 1000, signals: Signals = { viewId: 'one' }, ready = true,anchor=false) => act(() => dom.root.render(createElement(Chat, { height, signals, ready,anchor })));
  const readAt = (offset: number) => act(() => { const el = scroll.transcript.current!; el.scrollTop = offset; el.dispatchEvent(new Event('scroll')); });
  beforeEach(() => {
    dom = setupDOM(); viewportHeight = 200; top = 80;
    const offsets = new WeakMap<HTMLElement, number>();
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => viewportHeight);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) { return Number(this.querySelector('[data-height]')?.getAttribute('data-height') || this.getAttribute('data-height') || 0); });
    vi.spyOn(HTMLElement.prototype, 'scrollTop', 'get').mockImplementation(function (this: HTMLElement) { return Math.min(offsets.get(this) || 0, Math.max(0, this.scrollHeight - this.clientHeight)); });
    vi.spyOn(HTMLElement.prototype, 'scrollTop', 'set').mockImplementation(function (this: HTMLElement, value: number) { offsets.set(this, Math.max(0, Math.min(value, this.scrollHeight - this.clientHeight))); });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => rect(0, top, 360, viewportHeight));
  });
  afterEach(() => dom.cleanup());
  it('attaches after background-only loading and pins a newly submitted message after commit', () => {
    render(1000, {}, false); dom.frame();
    render(); dom.frame(); expect(scroll.transcript.current?.scrollTop).toBe(800);
    expect(dom.observers.some(observer => observer.targets.has(scroll.transcript.current!))).toBe(true);
    readAt(250);
    render(1400, { viewId: 'one', submittedId: 'sent' }); dom.frame();
    expect(scroll.transcript.current?.scrollTop).toBe(1200);
    readAt(300); render(1400, { viewId: 'one', submittedId: 'sent' }); dom.frame();
    expect(scroll.transcript.current?.scrollTop).toBe(300);
  });
  it('does not pull a reader down during streaming, but follows a new final answer once', () => {
    render(); dom.frame(); readAt(250);
    render(1200); dom.frame(); dom.resize(); expect(scroll.transcript.current?.scrollTop).toBe(250);
    render(1300, { viewId: 'one', completedId: 'answer' }); dom.frame(); expect(scroll.transcript.current?.scrollTop).toBe(1100);
    readAt(350); render(1300, { viewId: 'one', completedId: 'answer' }); dom.frame(); expect(scroll.transcript.current?.scrollTop).toBe(350);
  });
  it('keeps the visible history in place when an older page is prepended', () => {
    render(); dom.frame(); readAt(0);
    scroll.preparePrepend(); render(1600);
    expect(scroll.transcript.current?.scrollTop).toBe(600);
    dom.resize(); dom.frame(); expect(scroll.transcript.current?.scrollTop).toBe(600);
    scroll.preparePrepend(); render(1800, { viewId: 'one', submittedId: 'new-request' });
    dom.frame(); expect(scroll.transcript.current?.scrollTop).toBe(1600);
  });
  it('keeps the bottom edge anchored when dragging/keyboard resizes the viewport, even if layout scroll fires first', () => {
    render(); dom.frame(); readAt(300);
    viewportHeight = 100;
    act(() => scroll.transcript.current!.dispatchEvent(new Event('scroll')));
    dom.resize(); expect(scroll.transcript.current?.scrollTop).toBe(400);
    viewportHeight = 300; dom.resize(); expect(scroll.transcript.current?.scrollTop).toBe(200);
  });
  it('holds the reading position while Show more changes message height', () => {
    render(); dom.frame();
    holdConversationScroll(scroll.transcript.current!);
    render(1600); dom.resize(); dom.frame();
    expect(scroll.transcript.current?.scrollTop).toBe(800);
    dom.frame(350); render(1650); dom.frame(); expect(scroll.transcript.current?.scrollTop).toBe(800);
  });
  it('follows newly arriving approvals, not removal of an existing one', () => {
    render(1000, { viewId: 'one', approvalIds: 'a,b' }); dom.frame(); readAt(200);
    render(900, { viewId: 'one', approvalIds: 'b' }); dom.frame(); expect(scroll.transcript.current?.scrollTop).toBe(200);
    render(1000, { viewId: 'one', approvalIds: 'b,c' }); dom.frame(); expect(scroll.transcript.current?.scrollTop).toBe(800);
  });
  it('restores independent tab scroll positions instead of following the other tab',()=>{
    render();dom.frame();readAt(200);const first=scroll.capture();
    readAt(500);const second=scroll.capture();
    act(()=>scroll.restore(first));render();dom.frame();expect(scroll.transcript.current?.scrollTop).toBe(200);
    act(()=>scroll.restore(second));render();dom.frame();expect(scroll.transcript.current?.scrollTop).toBe(500);
  });
  it('fades a chat touching the window top even at scrollTop zero, and removes the fade below it', () => {
    top = 0; render(200); dom.frame();
    expect(scroll.transcript.current?.scrollTop).toBe(0);
    expect(scroll.fadedTop).toBe(true);
    top = 50; render(200); dom.frame(); expect(scroll.fadedTop).toBe(false);
    render(500); dom.frame(); expect(scroll.fadedTop).toBe(true);
    viewportHeight = 0; readAt(0); expect(shouldFadeConversationTop(scroll.transcript.current!)).toBe(false);
  });
  it('freezes a message anchor through new output, prepend and viewport changes until the overlay closes',()=>{
    render(1000,{viewId:'one'},true,true);dom.frame();readAt(300);
    const message=scroll.content.current!.querySelector<HTMLElement>('[data-message-id]')!;
    let messageTop=350;
    Object.defineProperty(message,'getBoundingClientRect',{configurable:true,value:()=>rect(0,top+messageTop-scroll.transcript.current!.scrollTop,360,40)});
    act(()=>scroll.suspend(true));
    render(1600,{viewId:'one',completedId:'new-answer',submittedId:'new-question',approvalIds:'review'},true,true);
    viewportHeight=100;act(()=>scroll.follow());dom.resize();dom.frame();
    expect(scroll.transcript.current?.scrollTop).toBe(300);
    messageTop+=600;render(2200,{viewId:'one',completedId:'new-answer',submittedId:'new-question',approvalIds:'review'},true,true);dom.resize();dom.frame();
    act(()=>scroll.suspend(true));
    act(()=>scroll.suspend(false));
    expect(scroll.transcript.current?.scrollTop).toBe(900);
    expect(message.getBoundingClientRect().top-scroll.transcript.current!.getBoundingClientRect().top).toBe(50);
    expect(scroll.awayFromBottom).toBe(true);
    dom.resize();dom.frame();expect(scroll.transcript.current?.scrollTop).toBe(900);
  });
  it('returns to the old bottom position rather than newer messages that arrived while expanded',()=>{
    render();dom.frame();expect(scroll.transcript.current?.scrollTop).toBe(800);
    act(()=>scroll.suspend(true));
    render(1600,{viewId:'one',completedId:'answer'});dom.resize();dom.frame();expect(scroll.transcript.current?.scrollTop).toBe(800);
    act(()=>scroll.suspend(false));expect(scroll.transcript.current?.scrollTop).toBe(800);expect(scroll.awayFromBottom).toBe(true);
    render(1600,{viewId:'one',completedId:'answer'});dom.frame();expect(scroll.transcript.current?.scrollTop).toBe(800);
  });
  it('captures immediately before an already queued completion frame can follow',()=>{
    render();dom.frame();readAt(250);
    render(1400,{viewId:'one',completedId:'answer'});
    act(()=>scroll.suspend(true));dom.frame();dom.resize();expect(scroll.transcript.current?.scrollTop).toBe(250);
    act(()=>scroll.suspend(false));dom.frame();expect(scroll.transcript.current?.scrollTop).toBe(250);
  });
});
