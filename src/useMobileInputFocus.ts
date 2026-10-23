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

/** Preserve native field editing and keep action taps stable while typing. */
export function bindMobileInputFocus(root: HTMLElement) {
  let frame = 0;
  const keepActionFocus = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || root.dataset.keyboardOpen !== 'true') return;
    const field = textField(document.activeElement);
    if (!field || !root.contains(field) || !(event.target instanceof Element)) return;
    if (event.target.closest('textarea, select, input:not([type="button"]):not([type="submit"]):not([type="reset"]), [contenteditable]:not([contenteditable="false"])')) return;
    const control = event.target.closest('button, a[href], summary, input[type="button"], input[type="submit"], input[type="reset"], [role="button"]');
    if (!control || !root.contains(control) || control.matches(':disabled, [aria-disabled="true"]') || control.closest('[inert]')) return;
    // Blur restores headers and panel height before mouseup, moving the target
    // away from the finger. Keep focus here; the native click still owns the action.
    event.preventDefault();
  };
  const reveal = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { const active = textField(document.activeElement); if (active && root.contains(active)) revealField(active, root); });
  };
  root.addEventListener('focusin', reveal);
  root.addEventListener('mousedown', keepActionFocus, true);
  window.addEventListener('resize', reveal);
  const visual=window.visualViewport;
  const revealKeyboard=()=>{if(!visual||Math.abs(visual.scale-1)<.01)reveal();};
  visual?.addEventListener('resize',revealKeyboard);
  return () => {
    cancelAnimationFrame(frame);
    root.removeEventListener('focusin', reveal); window.removeEventListener('resize', reveal);
    root.removeEventListener('mousedown', keepActionFocus, true);
    visual?.removeEventListener('resize',revealKeyboard);
  };
}

export function useMobileInputFocus(root: RefObject<HTMLElement | null>, ready: boolean) {
  useLayoutEffect(() => {
    if (ready && root.current) return bindMobileInputFocus(root.current);
  }, [root, ready]);
}
