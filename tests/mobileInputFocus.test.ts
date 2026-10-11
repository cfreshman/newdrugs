// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setupDOM } from './dom';
import { bindMobileInputFocus } from '../src/useMobileInputFocus';
let dom: ReturnType<typeof setupDOM>, cleanup: () => void, input: HTMLTextAreaElement;
function touch(type: string, points: { clientX: number; clientY: number }[], target: HTMLElement = input) {
  const event = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(event, 'touches', { value: points }); target.dispatchEvent(event); return event;
}
beforeEach(() => { dom = setupDOM(); input = document.createElement('textarea'); dom.container.append(input); cleanup = bindMobileInputFocus(dom.container); });
afterEach(() => { cleanup(); dom.cleanup(); });
it('leaves the first tap to native focus and caret placement', () => {
  const focus = vi.spyOn(input, 'focus');
  touch('touchstart', [{ clientX: 10, clientY: 20 }]);
  expect(touch('touchend', []).defaultPrevented).toBe(false);
  expect(focus).not.toHaveBeenCalled();
});
it('does not blur or refocus an autofocused field when tapping to open its keyboard', () => {
  input.focus(); const focus = vi.spyOn(input, 'focus'), blur = vi.spyOn(input, 'blur');
  input.value='Keep this draft';input.setSelectionRange(7,7);
  touch('touchstart', [{ clientX: 10, clientY: 20 }]);
  expect(touch('touchend', []).defaultPrevented).toBe(false);
  expect(blur).not.toHaveBeenCalled();expect(focus).not.toHaveBeenCalled();expect(input.selectionStart).toBe(7);
});
it('leaves editing taps, scrolling, pinch zoom and long-press alone', () => {
  input.focus(); dom.container.setAttribute('data-keyboard-open', 'true'); input.value = 'keep selection'; input.setSelectionRange(1, 4);
  touch('touchstart', [{ clientX: 10, clientY: 20 }]); expect(touch('touchend', []).defaultPrevented).toBe(false); expect(input.selectionStart).toBe(1); expect(input.selectionEnd).toBe(4);
  input.blur();
  touch('touchstart', [{ clientX: 10, clientY: 20 }]); touch('touchmove', [{ clientX: 10, clientY: 45 }]); expect(touch('touchend', []).defaultPrevented).toBe(false);
  touch('touchstart', [{ clientX: 10, clientY: 20 }, { clientX: 30, clientY: 20 }]); expect(touch('touchend', []).defaultPrevented).toBe(false);
  touch('touchstart', [{ clientX: 10, clientY: 20 }]); dom.frame(600); expect(touch('touchend', []).defaultPrevented).toBe(false);
});
it('does not intercept readonly fields or native pickers', () => {
  input.readOnly = true; touch('touchstart', [{ clientX: 10, clientY: 20 }]); expect(touch('touchend', []).defaultPrevented).toBe(false);
  const select = document.createElement('select'); dom.container.append(select); touch('touchstart', [{ clientX: 10, clientY: 20 }], select); expect(touch('touchend', [], select).defaultPrevented).toBe(false);
});
it('removes its listeners when the app unmounts', () => {
  cleanup(); touch('touchstart', [{ clientX: 10, clientY: 20 }]); expect(touch('touchend', []).defaultPrevented).toBe(false);
});
