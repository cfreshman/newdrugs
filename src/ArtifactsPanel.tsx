import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ArtifactSummary } from '../shared/artifacts';
import { ARTIFACT_MAX_ACCOUNT_COUNT } from '../shared/artifacts';
import type { Destination } from '../shared/navigation';
import { operation, errorText } from './api';
import { NavLink } from './NavLink';
import { usePanelLoading, usePanelVisible } from './PanelReadiness';
import { useRecordRefreshDetails } from './useRecordRefresh';
import { TransientError } from './TransientError';
import './artifactControls.css';

interface ArtifactPage { items: ArtifactSummary[]; nextCursor: string | null }
interface LibraryState { items: ArtifactSummary[]; cursor: string | null; pages: number }
interface ListAnchor { scroller: HTMLElement; id?: string; offset: number; top: number }
const PAGE_SIZE = 20;
function listAnchor(root: HTMLElement | null): ListAnchor | null {
  if (!root) return null;
  for (let parent = root.parentElement; parent; parent = parent.parentElement) {
    if (!/auto|scroll/.test(getComputedStyle(parent).overflowY || getComputedStyle(parent).overflow)) continue;
    const top = parent.getBoundingClientRect().top;
    const row = [...root.querySelectorAll<HTMLElement>('[data-artifact-id]')].find(node => node.getBoundingClientRect().bottom > top);
    return { scroller: parent, id: row?.dataset.artifactId, offset: row ? row.getBoundingClientRect().top - top : 0, top: parent.scrollTop };
  }
  return null;
}

export function ArtifactsPanel({ navigate }: { navigate(destination: Destination): void }) {
  const visible = usePanelVisible(), isVisible = useRef(visible); isVisible.current = visible;
  const [library, setLibrary] = useState<LibraryState>({ items: [], cursor: null, pages: 0 });
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const current = useRef(library); current.current = library;
  const root = useRef<HTMLDivElement>(null), anchor = useRef<ListAnchor | null>(null);
  const request = useRef(0), controller = useRef<AbortController | null>(null), busy = useRef(false), dirty = useRef(false), loaded = useRef(false);
  usePanelLoading(visible && !loaded.current && !error);

  const load = useCallback(async (more = false) => {
    if (!isVisible.current) { dirty.current = true; return; }
    if (busy.current) { if (!more) dirty.current = true; return; }
    const before = current.current;
    if (more && !before.cursor) return;
    const ticket = ++request.current, active = new AbortController(); controller.current = active;
    busy.current = true; dirty.current = false; setLoading(true);
    try {
      const pages = more ? 1 : Math.max(1, before.pages), items: ArtifactSummary[] = [];
      let cursor = more ? before.cursor : null, fetched = 0;
      for (; fetched < Math.min(pages, Math.ceil(ARTIFACT_MAX_ACCOUNT_COUNT / PAGE_SIZE)); fetched++) {
        const page: ArtifactPage = await operation('artifacts.list', { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) }, { signal: active.signal, dedupe: true });
        items.push(...page.items); cursor = page.nextCursor;
        if (!cursor) { fetched++; break; }
      }
      if (ticket !== request.current || !isVisible.current) return;
      anchor.current = listAnchor(root.current);
      const next = { items: [...new Map([...(more ? before.items : []), ...items].map(item => [item.id, item])).values()], cursor, pages: more ? before.pages + fetched : fetched };
      current.current = next; loaded.current = true; setLibrary(next); setError('');
    } catch (cause) { if (ticket === request.current && !active.signal.aborted) setError(errorText(cause)); }
    finally {
      if (ticket === request.current) {
        busy.current = false; controller.current = null; setLoading(false);
        if (dirty.current && isVisible.current) void load();
      }
    }
  }, []);
  useEffect(() => {
    if (visible) { if (!loaded.current || dirty.current) void load(); }
    else if (controller.current) { dirty.current = true; request.current++; controller.current.abort(); controller.current = null; busy.current = false; setLoading(false); }
  }, [visible, load]);
  useEffect(() => () => { request.current++; controller.current?.abort(); }, []);
  useRecordRefreshDetails(['artifacts'], () => load());
  useLayoutEffect(() => {
    const saved = anchor.current; anchor.current = null;
    if (!saved || !visible || !saved.scroller.isConnected) return;
    const row = [...root.current?.querySelectorAll<HTMLElement>('[data-artifact-id]') || []].find(node => node.dataset.artifactId === saved.id);
    saved.scroller.scrollTop = row ? saved.scroller.scrollTop + row.getBoundingClientRect().top - saved.scroller.getBoundingClientRect().top - saved.offset : saved.top;
  }, [library, visible]);

  return <div className="artifacts-panel" ref={root} aria-busy={loading || undefined}>
    <div className="inbox-items">{library.items.map(artifact => <NavLink className="inbox-row artifact-list-row" key={artifact.id} data-artifact-id={artifact.id} to={{ view: 'artifacts', resourceId: artifact.id }} navigate={navigate}>
      <strong>{artifact.title}</strong><time className="quiet small" dateTime={artifact.updatedAt}>Updated {new Date(artifact.updatedAt).toLocaleString()}</time>
    </NavLink>)}</div>
    {loaded.current && !library.items.length && !loading && !error && <p className="quiet">No artifacts yet.</p>}
    {library.cursor && <button type="button" className="text-link chat-search-more" disabled={loading} onClick={() => void load(true)}>More artifacts</button>}
    {error && <><TransientError className="error" role="alert">{error}</TransientError><button type="button" className="text-link" disabled={loading} onClick={() => void load()}>Retry</button></>}
  </div>;
}
