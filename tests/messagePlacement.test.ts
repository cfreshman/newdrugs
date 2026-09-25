// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animateMessagePlacement, captureMessagePlacement } from '../src/messagePlacementMotion';
import { rect, setupDOM } from './dom';

describe('input to sent-message handoff', () => {
  let dom: ReturnType<typeof setupDOM>;
  let form: HTMLFormElement, textarea: HTMLTextAreaElement, target: HTMLElement;
  let animations: { node: HTMLElement; frames: Keyframe[]; options: KeyframeAnimationOptions; finish(): void; cancel: ReturnType<typeof vi.fn> }[];
  beforeEach(() => {
    dom = setupDOM(); animations = [];
    form = document.createElement('form'); form.className = 'composer';
    form.innerHTML = '<label for="thought">Message</label><textarea id="thought"></textarea><button>Send</button>';
    textarea = form.querySelector('textarea')!; textarea.value = 'Meet at the park?';
    form.getBoundingClientRect = () => rect(12, 550, 366, 76);
    target = document.createElement('article'); target.className = 'message user'; target.dataset.messageId = 'one';
    target.innerHTML = '<div class="bubble">Meet at the park?</div>';
    target.getBoundingClientRect = () => rect(210, 470, 168, 32);
    document.body.append(form, target);
    vi.stubGlobal('Animation', class {});
    Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, writable: true, value: vi.fn(function (this: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
      let resolve!: () => void;
      const finished = new Promise<Animation>(done => { resolve = () => done({} as Animation); });
      const cancel = vi.fn(resolve);
      animations.push({ node: this, frames: frames as Keyframe[], options: options as KeyframeAnimationOptions, finish: resolve, cancel });
      return { finished, cancel } as unknown as Animation;
    }) });
  });
  afterEach(() => dom.cleanup());

  it('crossfades two inert copies inside one moving object without scaling text or stealing focus', async () => {
    textarea.focus();
    const snapshot = captureMessagePlacement(form, textarea.value)!;
    textarea.value = '';
    const motion = animateMessagePlacement(snapshot, target)!;
    const object = document.querySelector('.message-placement')!;
    expect(object.children.length).toBe(2);
    expect(object.querySelector('textarea')!.value).toBe('Meet at the park?');
    expect(object.querySelectorAll('[id]').length).toBe(0);
    expect(object.getAttribute('aria-hidden')).toBe('true');
    expect(object.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.value).toBe('');
    expect(target.style.opacity).toBe('0');
    expect(animations[0].frames).toEqual([
      { left: '12px', top: '550px', width: '366px', height: '76px' },
      { left: '210px', top: '470px', width: '168px', height: '32px' },
    ]);
    expect(animations[1].frames).toContainEqual({ opacity: 0, offset: .26 });
    expect(animations[2].frames).toContainEqual({ opacity: 1, offset: .26 });
    expect(JSON.stringify(animations.map(animation => animation.frames))).not.toContain('scale');
    animations.forEach(animation => animation.finish()); await motion.finished;
    expect(document.querySelector('.message-placement')).toBeNull();
    expect(target.style.opacity).toBe('');
    expect(target.style.pointerEvents).toBe('');
    expect(dom.frames.size).toBe(0);
  });
  it('cancels cleanly when the user scrolls or the final layout moves', async () => {
    const motion = animateMessagePlacement(captureMessagePlacement(form, textarea.value)!, target)!;
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: -40 }));
    await motion.finished;
    expect(document.querySelector('.message-placement')).toBeNull();
    expect(target.style.opacity).toBe('');
    const next = animateMessagePlacement(captureMessagePlacement(form, textarea.value)!, target)!;
    target.getBoundingClientRect = () => rect(210, 410, 168, 32);
    dom.frame(); await next.finished;
    expect(document.querySelector('.message-placement')).toBeNull();
    expect(target.style.opacity).toBe('');
  });
  it('renders the real message normally when geometry is unavailable', () => {
    const snapshot = captureMessagePlacement(form, textarea.value)!;
    target.getBoundingClientRect = () => rect(0, 0, 0, 0);
    expect(animateMessagePlacement(snapshot, target)).toBeNull();
    expect(target.style.opacity).toBe('');
    expect(animations.length).toBe(0);
  });
});
