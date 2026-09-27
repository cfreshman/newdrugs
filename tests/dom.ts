import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { vi } from 'vitest';

export function setupDOM() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(null);
  let now = 0, nextFrame = 0, desktop = false;
  const frames = new Map<number, FrameRequestCallback>();
  const media = new EventTarget();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() { return desktop; },
    addEventListener: media.addEventListener.bind(media), removeEventListener: media.removeEventListener.bind(media),
  }));
  const observers: { callback: ResizeObserverCallback; targets: Set<Element> }[] = [];
  vi.stubGlobal('ResizeObserver', class {
    record: typeof observers[number];
    constructor(callback: ResizeObserverCallback) { this.record = { callback, targets: new Set() }; observers.push(this.record); }
    observe(target: Element) { this.record.targets.add(target); }
    unobserve(target: Element) { this.record.targets.delete(target); }
    disconnect() { this.record.targets.clear(); }
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  return {
    root, container, frames, observers,
    frame: (elapsed = 16) => act(() => { now += elapsed; const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(now)); }),
    resize: (target?: Element) => act(() => { for (const observer of observers) if (observer.targets.size && (!target || observer.targets.has(target))) observer.callback([], {} as ResizeObserver); }),
    desktop: (value: boolean) => act(() => { desktop = value; window.dispatchEvent(new Event('resize')); }),
    cleanup: () => { act(() => root.unmount()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); },
  };
}

export const rect = (left: number, top: number, width: number, height: number): DOMRect => ({ left, top, width, height, x: left, y: top, right: left + width, bottom: top + height, toJSON: () => ({}) });
