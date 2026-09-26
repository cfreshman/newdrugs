import { useLayoutEffect, useRef, type RefObject } from 'react';
import { CircleNotch } from '@phosphor-icons/react';

export function captureHistoryAnchor(element: HTMLElement) {
  const top = element.getBoundingClientRect().top;
  const message = [...element.querySelectorAll<HTMLElement>('[data-message-id], [data-invitation-id]')].find(item => item.getBoundingClientRect().bottom > top);
  return { message, offset: message ? message.getBoundingClientRect().top - top : 0, scrollTop: element.scrollTop, height: element.scrollHeight };
}
export function restoreHistoryAnchor(element: HTMLElement, anchor: ReturnType<typeof captureHistoryAnchor>) {
  element.scrollTop = anchor.message?.isConnected
    ? element.scrollTop + anchor.message.getBoundingClientRect().top - element.getBoundingClientRect().top - anchor.offset
    : anchor.scrollTop + element.scrollHeight - anchor.height;
}

/** Fetch at the top edge, with no off-screen prefetch window. */
export function useTopPagination(scroll: RefObject<HTMLDivElement | null>, options: { enabled: boolean; hasMore: boolean; count: number; scope?: string; load(): Promise<void> }) {
  const latest = useRef(options); latest.current = options;
  const pending = useRef<{ scope?: string; token: symbol } | null>(null);
  useLayoutEffect(() => {
    const node = scroll.current;
    if (!node || !options.enabled || !options.hasMore) return;
    let disposed = false, frame = 0, settle = 0;
    const check = () => {
      if (disposed || pending.current && pending.current.scope === latest.current.scope || !latest.current.enabled || !latest.current.hasMore || node.clientHeight <= 0 || node.scrollTop > 2 || document.hidden) return;
      const token = Symbol('history'); pending.current = { scope: latest.current.scope, token };
      void latest.current.load().finally(() => { if (pending.current?.token === token) pending.current = null; });
    };
    const wheel = (event: WheelEvent) => { if (event.deltaY < 0 && !event.ctrlKey) check(); };
    node.addEventListener('scroll', check); node.addEventListener('wheel', wheel, { passive: true });
    // A tall display can already show the entire first page. Fill only the
    // visible space, after initial bottom-follow has settled.
    frame = requestAnimationFrame(() => { settle = requestAnimationFrame(() => { if (node.scrollHeight <= node.clientHeight + 1) check(); }); });
    return () => { disposed = true; cancelAnimationFrame(frame); cancelAnimationFrame(settle); node.removeEventListener('scroll', check); node.removeEventListener('wheel', wheel); };
  }, [scroll, options.enabled, options.hasMore, options.count, options.scope]);
}
export function OlderMessages({ hasMore, loading, error, retry }: { hasMore: boolean; loading: boolean; error: string; retry(): void }) {
  if (!hasMore && !loading && !error) return null;
  return <div className="history-loader">{loading ? <span role="status" aria-label="Loading earlier messages"><CircleNotch className="agent-spinner" size={16} aria-hidden="true" /></span> : error ? <button type="button" className="text-link small" onClick={retry}>Retry loading earlier messages</button> : null}</div>;
}
