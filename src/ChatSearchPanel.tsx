import type {Destination} from '../shared/navigation';
import { AgentMarkdown } from './AgentMarkdown';
import { usePanelVisible } from './PanelReadiness';
import { useEffect, useRef, useState } from 'react';
import { CircleNotch } from '@phosphor-icons/react';
import { SearchField } from './SearchField';
import { operation, errorText } from './api';
import type { ChatSearchResult } from '../shared/chatSearch';
import { useRecordRefresh } from './useRecordRefresh';
import {NavLink} from './NavLink';
export function ChatSearchPanel({ initialQuery = '', initialRole = 'all', onStateChange, openMessage }: { initialQuery?: string; initialRole?:Destination['role'];onStateChange?(context:Partial<Destination>):void; openMessage(id: string): Promise<void> }) {
  const visible = usePanelVisible();
  const [query, setQuery] = useState(initialQuery || ''), [role, setRole] = useState<'all' | 'user' | 'assistant'>(initialRole);
  useEffect(()=>{setQuery(initialQuery||'');setRole(initialRole);},[initialQuery,initialRole]);
  const [result, setResult] = useState<ChatSearchResult | null>(null), [loading, setLoading] = useState(false), [appending,setAppending]=useState(false), [error, setError] = useState(''), [opening, setOpening] = useState<string>();
  const generation = useRef(0), refreshedAt = useRef(0);
  const load = async (cursor?: string) => {
    const ticket = ++generation.current;
    if (!query.trim()) { setResult(null); setLoading(false); setError(''); return; }
    setLoading(true); setAppending(Boolean(cursor)); setError('');
    try {
      const page = await operation<ChatSearchResult>('conversation.search', { query, role, limit: 20, ...(cursor ? { cursor } : {}) });
      if (generation.current === ticket) setResult(previous => cursor && previous ? { ...page, items: [...previous.items, ...page.items] } : page);
    } catch (reason) { if (generation.current === ticket) setError(errorText(reason)); }
    finally { if (generation.current === ticket) setLoading(false); }
  };
  useEffect(() => { setResult(null); void load(); return () => { generation.current++; }; }, [query, role]);
  // Index invalidations are coalesced by the live-state channel; do not poll or call a model while typing.
  useRecordRefresh(['chat_history'], () => { if (visible && result?.indexing && !loading && Date.now() - refreshedAt.current > 5000) { refreshedAt.current = Date.now(); void load(); } });
  return <>
    <SearchField label="Search your chat" value={query} onSearch={value => { if (value === query) void load(); else {setQuery(value);onStateChange?.({query:value,role});} }} />
    <nav className="view-tabs" aria-label="Chat author">{(['all', 'user', 'assistant'] as const).map(value => <button key={value} aria-pressed={role === value} onClick={() => {setRole(value);onStateChange?.({query,role:value});}}>{value === 'all' ? 'All' : value === 'user' ? 'You' : 'Your agent'}</button>)}</nav>
    {!query && <p className="quiet">Find something you or your agent said. Only your chat is searched.</p>}
    {result?.notices.map(notice => <p key={notice} className="quiet small">{notice}</p>)}
    <div className="chat-search-results">{result?.items.map(item => {
      const open = () => { if (opening) return; setOpening(item.id); void openMessage(item.id).catch(reason => setError(errorText(reason))).finally(() => setOpening(undefined)); };
      return <article className="chat-search-result" key={item.id} aria-busy={opening === item.id || undefined} onClick={event => {
        if (event.target instanceof Element && event.target.closest('a, button, input, textarea, select, summary, [role="button"]')) return;
        if (window.getSelection()?.toString()) return;
        open();
      }}>
        <NavLink className="chat-search-meta" to={{view:'chat',resourceId:item.id}} navigate={open} aria-disabled={Boolean(opening)} aria-label={`Open message from ${item.role === 'user' ? 'you' : 'your agent'} on ${new Date(item.createdAt).toLocaleDateString()}`}><strong>{item.role === 'user' ? 'You' : 'Your agent'}</strong><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time>{opening === item.id && <CircleNotch className="agent-spinner" size={14} />}</NavLink>
        <div className="chat-search-excerpt"><AgentMarkdown text={item.text} /></div>
      </article>;
    })}</div>
    {loading && <div className="history-loader"><span role="status" aria-label="Searching your chat"><CircleNotch className={appending?'agent-spinner spinner-immediate':'agent-spinner'} size={16} /></span></div>}
    {result && !loading && !result.items.length && <p className="quiet">No matching messages.</p>}
    {result?.nextCursor && !loading && <button className="text-link chat-search-more" onClick={() => void load(result.nextCursor!)}>More messages</button>}
    {error && <p role="status" className="error">{error}</p>}
  </>;
}
