// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useArtifactShare } from '../src/useArtifactShare';
import { setupDOM } from './dom';

let dom: ReturnType<typeof setupDOM>, controls: ReturnType<typeof useArtifactShare>;
const record = { id: 'd95df27b-3d83-4e84-bcbc-8036626b75cb', title: 'A saved graph' };
const url = () => new URL(`/artifacts/${record.id}`, location.origin).href;
function Probe({ id = record.id, title = record.title }: { id?: string; title?: string }) {
  controls = useArtifactShare({ id, title });
  return createElement('button', { onClick: () => void controls.share(), disabled: controls.sharing }, controls.copied ? 'Copied' : 'Share');
}
const render = (value: { id?: string; title?: string } = {}) => act(() => dom.root.render(createElement(Probe, value)));
beforeEach(() => { dom = setupDOM(); });
afterEach(() => { dom.cleanup(); vi.useRealTimers(); });

it('waits for an explicit action and shares the canonical unprefixed URL through native sharing', async () => {
  const share = vi.fn().mockResolvedValue(undefined), canShare = vi.fn().mockReturnValue(true), copy = vi.fn();
  vi.stubGlobal('navigator', { share, canShare, clipboard: { writeText: copy } });
  history.replaceState({}, '', '/friends/artifacts/other?mode=posts#section');
  render();
  expect(share).not.toHaveBeenCalled(); expect(copy).not.toHaveBeenCalled();
  await act(async () => controls.share());
  expect(canShare).toHaveBeenCalledWith({ title: record.title, url: url() });
  expect(share).toHaveBeenCalledWith({ title: record.title, url: url() });
  expect(copy).not.toHaveBeenCalled();
  expect(controls).toMatchObject({ sharing: false, copied: false, error: '' });
});

it('supports native sharing when the browser has no canShare method', async () => {
  const share = vi.fn().mockResolvedValue(undefined), copy = vi.fn();
  vi.stubGlobal('navigator', { share, clipboard: { writeText: copy } }); render();
  await act(async () => controls.share());
  expect(share).toHaveBeenCalledOnce(); expect(copy).not.toHaveBeenCalled();
});

it.each(['missing', 'unsupported', 'canShare error'] as const)('copies the URL with a brief check when native sharing is %s', async kind => {
  vi.useFakeTimers();
  const share = vi.fn(), copy = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { ...(kind === 'missing' ? {} : { share, canShare: kind === 'unsupported' ? () => false : () => { throw Error('Unsupported share'); } }), clipboard: { writeText: copy } });
  render(); await act(async () => controls.share());
  expect(share).not.toHaveBeenCalled(); expect(copy).toHaveBeenCalledWith(url());
  expect(controls).toMatchObject({ sharing: false, copied: true, error: '' });
  act(() => vi.advanceTimersByTime(1499)); expect(controls.copied).toBe(true);
  act(() => vi.advanceTimersByTime(1)); expect(controls.copied).toBe(false);
});

it('treats native cancellation as cancellation without copying or showing an error', async () => {
  const share = vi.fn().mockRejectedValue(new DOMException('Dismissed', 'AbortError')), copy = vi.fn();
  vi.stubGlobal('navigator', { share, canShare: () => true, clipboard: { writeText: copy } }); render();
  await act(async () => controls.share());
  expect(copy).not.toHaveBeenCalled(); expect(controls).toMatchObject({ sharing: false, copied: false, error: '' });
});

it('uses the existing copy fallback after a failed native share', async () => {
  const share = vi.fn().mockRejectedValue(Error('Native share unavailable')), copy = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { share, canShare: () => true, clipboard: { writeText: copy } }); render();
  await act(async () => controls.share());
  expect(copy).toHaveBeenCalledWith(url()); expect(controls).toMatchObject({ copied: true, error: '' });
});

it('prevents duplicate native calls before React rerenders and exposes the pending state', async () => {
  let finish!: () => void;
  const share = vi.fn().mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  vi.stubGlobal('navigator', { share, canShare: () => true }); render();
  let pending!: Promise<void>;
  act(() => { pending = controls.share(); void controls.share(); });
  expect(share).toHaveBeenCalledOnce(); expect(controls.sharing).toBe(true);
  await act(async () => { finish(); await pending; });
  expect(controls.sharing).toBe(false);
});

it('reports clipboard failure and clears that error explicitly or on the next attempt', async () => {
  const copy = vi.fn().mockRejectedValueOnce(Error('Copy was denied')).mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText: copy } }); render();
  await act(async () => controls.share()); expect(controls.error).toBe('Copy was denied');
  act(() => controls.clearError()); expect(controls.error).toBe('');
  await act(async () => controls.share()); expect(controls).toMatchObject({ copied: true, error: '' });
});

it('ignores an earlier artifact completion after navigation and clears copied state for the new record', async () => {
  let finish!: () => void;
  const copy = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText: copy } }); render();
  let pending!: Promise<void>; act(() => { pending = controls.share(); });
  render({ id: 'another-artifact', title: 'Another graph' });
  expect(controls).toMatchObject({ sharing: false, copied: false, error: '' });
  await act(async () => { finish(); await pending; }); expect(controls.copied).toBe(false);
  await act(async () => controls.share());
  expect(copy).toHaveBeenLastCalledWith(new URL('/artifacts/another-artifact', location.origin).href);
  expect(controls.copied).toBe(true);
  render(); expect(controls.copied).toBe(false);
});

it('clears the copied timer on unmount and does not start work through an unmounted callback', async () => {
  vi.useFakeTimers();
  const copy = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText: copy } }); render();
  await act(async () => controls.share()); expect(vi.getTimerCount()).toBe(1);
  const previous = controls;
  act(() => dom.root.render(null)); expect(vi.getTimerCount()).toBe(0);
  await previous.share(); expect(copy).toHaveBeenCalledOnce();
});

it('keeps the existing hidden-selection copy fallback when canShare rejects and Clipboard API is absent', async () => {
  const share = vi.fn();
  vi.stubGlobal('navigator', { share, canShare: () => false });
  const copy = vi.fn().mockReturnValue(true);
  const previous = Object.getOwnPropertyDescriptor(document, 'execCommand');
  Object.defineProperty(document, 'execCommand', { configurable: true, value: copy });
  try {
    render(); await act(async () => controls.share());
    expect(copy).toHaveBeenCalledWith('copy'); expect(share).not.toHaveBeenCalled();
    expect(document.body.querySelector('textarea')).toBeNull(); expect(controls.copied).toBe(true);
  } finally { if (previous) Object.defineProperty(document, 'execCommand', previous); else delete (document as unknown as { execCommand?: unknown }).execCommand; }
});
