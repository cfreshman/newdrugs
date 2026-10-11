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
  const bounds = root.getBoundingClientRect();
  const top = bounds.top + 12, bottom = bounds.bottom - 12;
  for (let parent = field.parentElement; parent && parent !== root; parent = parent.parentElement) {
    if (parent.scrollHeight <= parent.clientHeight || !/auto|scroll/.test(getComputedStyle(parent).overflowY)) continue;
    const box = parent.getBoundingClientRect(), input = field.getBoundingClientRect();
    const min = Math.max(box.top, top), max = Math.min(box.bottom, bottom);
    if (max <= min) continue;
    const delta = input.top < min ? input.top - min : input.bottom > max ? Math.min(input.bottom - max, input.top - min) : 0;
    if (delta) parent.scrollTop = Math.max(0, Math.min(parent.scrollHeight - parent.clientHeight, parent.scrollTop + delta));
  }
}

/** Native taps own focus and caret placement; only reveal the resulting field. */
export function bindMobileInputFocus(root: HTMLElement) {
  let frame = 0;
  const reveal = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { const active = textField(document.activeElement); if (active && root.contains(active)) revealField(active, root); });
  };
  root.addEventListener('focusin', reveal);
  window.addEventListener('resize', reveal);
  const visual=window.visualViewport;
  const revealKeyboard=()=>{if(!visual||Math.abs(visual.scale-1)<.01)reveal();};
  visual?.addEventListener('resize',revealKeyboard);
  return () => {
    cancelAnimationFrame(frame);
    root.removeEventListener('focusin', reveal); window.removeEventListener('resize', reveal);
    visual?.removeEventListener('resize',revealKeyboard);
  };
}

export function useMobileInputFocus(root: RefObject<HTMLElement | null>, ready: boolean) {
  useLayoutEffect(() => {
    if (ready && root.current) return bindMobileInputFocus(root.current);
  }, [root, ready]);
}
