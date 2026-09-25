import { useEffect, useRef, type RefObject } from 'react';

const scrollOwner = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="listbox"], [role="menu"], [data-scroll-owner]';
const touchControl = `${scrollOwner}, a, button, [role="button"], [role="slider"]`;

export function bindPageChatScroll(page: HTMLElement, chat: HTMLElement, options: { blocked(): boolean; onScroll(): void }) {
  let momentum = 0;
  let gesture: { x: number; y: number; lastY: number; lastTime: number; speed: number; scrolling: boolean } | null = null;
  const stop = () => { cancelAnimationFrame(momentum); momentum = 0; gesture = null; };
  const blocked = () => {
    const focused = document.activeElement;
    const chatControl = focused instanceof Element && Boolean(focused.closest('.composer-input-layer, .dictation-slot, .launcher-controls'));
    return options.blocked() || Boolean(document.querySelector('dialog[open], [aria-modal="true"], [data-page-scroll-lock]')) ||
      Boolean(focused && focused !== document.body && focused !== page && !chat.contains(focused) && !chatControl);
  };
  const eligible = (target: EventTarget | null, touch = false) => {
    if (blocked() || !(target instanceof Element) || !page.contains(target) || chat.contains(target)) return false;
    if (target.closest(touch ? touchControl : scrollOwner)) return false;
    // Future native surfaces own their scrolling, even before they get focus.
    for (let node: Element | null = target; node && node !== page; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight && /auto|scroll/.test(getComputedStyle(node).overflowY)) return false;
    }
    return chat.scrollHeight > chat.clientHeight;
  };
  const move = (delta: number) => {
    const before = chat.scrollTop;
    chat.scrollTop = Math.max(0, Math.min(chat.scrollHeight - chat.clientHeight, before + delta));
    // Record intent synchronously so a queued stream-follow frame can't undo it.
    options.onScroll();
    return chat.scrollTop !== before;
  };
  const wheel = (event: WheelEvent) => {
    stop();
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY) || !eligible(event.target)) return;
    const line = parseFloat(getComputedStyle(chat).lineHeight) || 24;
    const unit = event.deltaMode === 1 ? line : event.deltaMode === 2 ? chat.clientHeight : 1;
    event.preventDefault();
    move(event.deltaY * unit);
  };
  const touchStart = (event: TouchEvent) => {
    stop();
    if (event.touches.length !== 1 || !eligible(event.target, true)) return;
    const touch = event.touches[0];
    gesture = { x: touch.clientX, y: touch.clientY, lastY: touch.clientY, lastTime: performance.now(), speed: 0, scrolling: false };
  };
  const touchMove = (event: TouchEvent) => {
    const current = gesture;
    if (!current) return;
    if (event.touches.length !== 1 || blocked() || !event.cancelable) { stop(); return; }
    const touch = event.touches[0];
    const dx = touch.clientX - current.x, dy = touch.clientY - current.y;
    if (!current.scrolling) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return;
      if (Math.abs(dx) > Math.abs(dy)) { stop(); return; }
      current.scrolling = true;
    }
    event.preventDefault();
    const now = performance.now(), delta = current.lastY - touch.clientY;
    current.speed = Math.max(-2.5, Math.min(2.5, delta / Math.max(8, now - current.lastTime)));
    current.lastY = touch.clientY; current.lastTime = now;
    move(delta);
  };
  const touchEnd = () => {
    const current = gesture;
    gesture = null;
    if (!current?.scrolling || performance.now() - current.lastTime > 100) return;
    let speed = current.speed, last = performance.now();
    const coast = (now: number) => {
      const elapsed = Math.min(32, now - last); last = now;
      speed *= Math.exp(-elapsed / 160);
      if (blocked() || Math.abs(speed) < .02 || !move(speed * elapsed)) { stop(); return; }
      momentum = requestAnimationFrame(coast);
    };
    momentum = requestAnimationFrame(coast);
  };
  const keydown = (event: KeyboardEvent) => {
    if (document.activeElement instanceof Element && document.activeElement.closest(touchControl)) return;
    if (blocked() || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || document.activeElement && chat.contains(document.activeElement)) return;
    const amount = event.key === 'PageDown' || event.key === ' ' && !event.shiftKey ? chat.clientHeight * .85
      : event.key === 'PageUp' || event.key === ' ' && event.shiftKey ? -chat.clientHeight * .85
        : event.key === 'ArrowDown' ? 40 : event.key === 'ArrowUp' ? -40 : 0;
    if (!amount || chat.scrollHeight <= chat.clientHeight) return;
    event.preventDefault(); stop(); move(amount);
  };
  page.addEventListener('wheel', wheel, { passive: false });
  page.addEventListener('touchstart', touchStart, { passive: true });
  page.addEventListener('touchmove', touchMove, { passive: false });
  page.addEventListener('touchend', touchEnd);
  page.addEventListener('touchcancel', stop);
  window.addEventListener('keydown', keydown);
  window.addEventListener('focusin', stop);
  return () => {
    stop();
    page.removeEventListener('wheel', wheel);
    page.removeEventListener('touchstart', touchStart);
    page.removeEventListener('touchmove', touchMove);
    page.removeEventListener('touchend', touchEnd);
    page.removeEventListener('touchcancel', stop);
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('focusin', stop);
  };
}

export function usePageChatScroll(page: RefObject<HTMLDivElement | null>, chat: RefObject<HTMLDivElement | null>, ready: boolean, blocked: boolean, onScroll: () => void) {
  const latest = useRef({ blocked, onScroll }); latest.current = { blocked, onScroll };
  useEffect(() => {
    if (!ready || !page.current || !chat.current) return;
    return bindPageChatScroll(page.current, chat.current, { blocked: () => latest.current.blocked, onScroll: () => latest.current.onScroll() });
  }, [page, chat, ready]);
}
