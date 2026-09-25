import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { errorText, operation } from './api';
import { useRecordRefresh } from './useRecordRefresh';
import type { Destination } from '../shared/navigation';
import { usePanelLoading } from './PanelReadiness';

export function PersonSafety({ personId, label, navigate }: { personId: string; label: string; navigate(destination: Destination): void }) {
  const [mode, setMode] = useState<'block' | 'report' | null>(null), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [reported, setReported] = useState(false);
  const reportIntent = useRef<{ reason: string; key: string } | null>(null);
  const block = async () => { setBusy(true); try { await operation('people.block', { personId, blocked: true }); navigate({ view: 'blocked' }); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } };
  const report = async (event: FormEvent) => {
    event.preventDefault(); if (!reason.trim() || busy) return; setBusy(true);
    const intent = reportIntent.current?.reason === reason.trim() ? reportIntent.current : { reason: reason.trim(), key: crypto.randomUUID() }; reportIntent.current = intent;
    try { await operation('people.report', { personId, reason: intent.reason }, { confirmed: true, key: intent.key }); setReported(true); setMode(null); setReason(''); setError(''); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  };
  return <div className="person-safety">
    <div className="inline-actions"><button className="text-link small" onClick={() => setMode(mode === 'block' ? null : 'block')}>Block</button><button className="text-link small" onClick={() => setMode(mode === 'report' ? null : 'report')}>Report</button></div>
    {mode === 'block' && <div className="fields"><p className="small">Blocking hides your profiles and posts from each other and stops direct messages. You can unblock later in Settings.</p><button disabled={busy} className="solid" onClick={() => void block()}>Block {label}</button></div>}
    {mode === 'report' && <form className="fields" onSubmit={report}><label>What happened?<textarea value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} /></label><button className="solid" disabled={busy || !reason.trim()}>Submit report about {label}</button></form>}
    {reported && <p className="quiet small" role="status">Report submitted for review.</p>}{error && <p className="error" role="alert">{error}</p>}
  </div>;
}
interface Blocked { id: string; personId: string; name: string; handle?: string }
export function BlockedPanel() {
  const [page, setPage] = useState<{ items: Blocked[]; nextCursor: string | null } | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState('');
  const generation = useRef(0);
  usePanelLoading(!page && !error);
  const load = useCallback(async (before?: string) => {
    const current = ++generation.current;
    try { const next = await operation<{ items: Blocked[]; nextCursor: string | null }>('people.blocked', before ? { before } : {}); if (current === generation.current) { setPage(previous => before && previous ? { ...next, items: [...previous.items, ...next.items] } : next); setError(''); } }
    catch (error) { if (current === generation.current) setError(errorText(error)); }
  }, []);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]); useRecordRefresh(['people'], load);
  const unblock = async (personId: string) => { setBusy(personId); try { await operation('people.block', { personId, blocked: false }); await load(); } catch (error) { setError(errorText(error)); } finally { setBusy(''); } };
  return <><div className="blocked-list">{page?.items.map(person => <div key={person.id}><span>{person.handle ? `@${person.handle}` : person.name || 'Person'}</span><button className="text-link" disabled={Boolean(busy)} onClick={() => void unblock(person.personId)}>Unblock</button></div>)}</div>{page && !page.items.length && <p className="quiet">You haven’t blocked anyone.</p>}{page?.nextCursor && <button className="text-link" onClick={() => void load(page.nextCursor!)}>More</button>}{error && <p className="error" role="alert">{error}</p>}</>;
}
