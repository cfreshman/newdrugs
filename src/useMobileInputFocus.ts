import { useLayoutEffect, type RefObject } from 'react';

function textField(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const candidate = target.closest('input, textarea, [contenteditable="true"]');
  if (candidate instanceof HTMLTextAreaElement) return !candidate.disabled && !candidate.readOnly ? candidate : null;
  if (candidate instanceof HTMLInputElement) return !candidate.disabled && !candidate.readOnly && ['text', 'search', 'email', 'password', 'url', 'tel', 'number'].includes(candidate.type) ? candidate : null;
  return candidate instanceof HTMLElement && candidate.isContentEditable ? candidate : null;
}

/** Reveal within app scrollers only. Native scrollIntoView can pan the whole iOS page. */
function revealField(field: HTMLElement, root: HTMLElement) {
  const viewport = window.visualViewport, top = (viewport?.offsetTop || 0) + 12, bottom = (viewport?.offsetTop || 0) + (viewport?.height || innerHeight) - 12;
  for (let parent = field.parentElement; parent && parent !== root; parent = parent.parentElement) {
    if (parent.scrollHeight <= parent.clientHeight || !/auto|scroll/.test(getComputedStyle(parent).overflowY)) continue;
    const box = parent.getBoundingClientRect(), input = field.getBoundingClientRect();
    const min = Math.max(box.top, top), max = Math.min(box.bottom, bottom);
    if (max <= min) continue;
    const delta = input.top < min ? input.top - min : input.bottom > max ? Math.min(input.bottom - max, input.top - min) : 0;
    if (delta) parent.scrollTop = Math.max(0, Math.min(parent.scrollHeight - parent.clientHeight, parent.scrollTop + delta));
  }
}

// WebKit focus/scroll behavior also documented by React Aria:
// https://github.com/adobe/react-spectrum/blob/main/packages/react-aria/src/overlays/usePreventScroll.ts
export function bindMobileInputFocus(root: HTMLElement, preventNativeFocus = true) {
  let touch: { target: HTMLElement; x: number; y: number; time: number; moved: boolean } | null = null;
  let frame = 0;
  const reveal = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { const active = textField(document.activeElement); if (active && root.contains(active)) revealField(active, root); });
  };
  const start = (event: TouchEvent) => {
    const target = textField(event.target);
    touch = target && event.touches.length === 1 ? { target, x: event.touches[0].clientX, y: event.touches[0].clientY, time: performance.now(), moved: false } : null;
  };
  const move = (event: TouchEvent) => {
    if (!touch) return;
    if (event.touches.length !== 1 || Math.hypot(event.touches[0].clientX - touch.x, event.touches[0].clientY - touch.y) > 8) touch.moved = true;
  };
  const end = (event: TouchEvent) => {
    const tap = touch; touch = null;
    // Keep normal scrolling, pinch zoom, long-press, and editing/selection in an
    // already-focused field. Only replace the first tap's native scroll-and-focus.
    if (!tap || tap.moved || event.touches.length || event.defaultPrevented || !event.cancelable || performance.now() - tap.time > 500 || !tap.target.isConnected) return;
    const alreadyFocused = document.activeElement === tap.target;
    if (alreadyFocused && root.hasAttribute('data-keyboard-open')) return;
    event.preventDefault();
    // Autofocus may leave a field active without opening the keyboard. Refresh
    // focus within this trusted tap instead of letting Safari center the page.
    if (alreadyFocused) tap.target.blur();
    tap.target.focus({ preventScroll: true }); reveal();
  };
  const cancel = () => { touch = null; };
  if (preventNativeFocus) {
    root.addEventListener('touchstart', start, { passive: true, capture: true });
    root.addEventListener('touchmove', move, { passive: true, capture: true });
    root.addEventListener('touchend', end, { passive: false, capture: true });
    root.addEventListener('touchcancel', cancel, true);
  }
  root.addEventListener('focusin', reveal);
  window.visualViewport?.addEventListener('resize', reveal);
  return () => {
    cancelAnimationFrame(frame);
    root.removeEventListener('touchstart', start, true); root.removeEventListener('touchmove', move, true); root.removeEventListener('touchend', end, true); root.removeEventListener('touchcancel', cancel, true);
    root.removeEventListener('focusin', reveal); window.visualViewport?.removeEventListener('resize', reveal);
  };
}

export function useMobileInputFocus(root: RefObject<HTMLElement | null>, ready: boolean) {
  useLayoutEffect(() => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    // Browser tabs and installed PWAs need the same WebKit focus handling.
    if (ready && root.current) return bindMobileInputFocus(root.current, ios && /AppleWebKit/.test(navigator.userAgent));
  }, [root, ready]);
}
