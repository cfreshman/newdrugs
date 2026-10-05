import {TransientError} from './TransientError';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { errorText, operation } from './api';
import { useRecordRefresh } from './useRecordRefresh';
import type { Destination } from '../shared/navigation';
import type {Profile} from '../shared/types';
import { usePanelLoading } from './PanelReadiness';
import {NavLink} from './NavLink';

export function PersonSafety({ personId, label, navigate, mode, close }: { personId: string; label: string; mode:'block'|'report'|null;close():void; navigate(destination: Destination): void }) {
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [reported, setReported] = useState(false);
  const reportIntent = useRef<{ reason: string; key: string } | null>(null);
  const block = async () => { setBusy(true); try { await operation('people.block', { personId, blocked: true }); navigate({ view: 'blocked' }); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } };
  const report = async (event: FormEvent) => {
    event.preventDefault(); if (!reason.trim() || busy) return; setBusy(true);
    const intent = reportIntent.current?.reason === reason.trim() ? reportIntent.current : { reason: reason.trim(), key: crypto.randomUUID() }; reportIntent.current = intent;
    try { await operation('people.report', { personId, reason: intent.reason }, { confirmed: true, key: intent.key }); setReported(true); close(); setReason(''); setError(''); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  };
  if(!mode&&!reported&&!error)return null;
  return <div className="person-safety">
    {mode === 'block' && <div className="fields"><p className="small">Blocking hides your profiles and posts from each other and stops direct messages. You can unblock later in Settings.</p><div className="panel-actions"><button disabled={busy} onClick={close}>Cancel</button><button disabled={busy} className="solid" onClick={() => void block()}>Block {label}</button></div></div>}
    {mode === 'report' && <form className="fields" onSubmit={report}><label>What happened?<textarea value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} /></label><div className="panel-actions"><button type="button" disabled={busy} onClick={close}>Cancel</button><button className="solid" disabled={busy || !reason.trim()}>Submit report about {label}</button></div></form>}
    {reported && <p className="quiet small" role="status">Report submitted for review.</p>}{error && <TransientError className="error" role="alert">{error}</TransientError>}
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
  return <><div className="blocked-list">{page?.items.map(person => <div key={person.id}><span>{person.handle ? `@${person.handle}` : person.name || 'Person'}</span><button className="text-link" disabled={Boolean(busy)} onClick={() => void unblock(person.personId)}>Unblock</button></div>)}</div>{page && !page.items.length && <p className="quiet">You haven’t blocked anyone.</p>}{page?.nextCursor && <button className="text-link" onClick={() => void load(page.nextCursor!)}>More</button>}{error && <TransientError className="error" role="alert">{error}</TransientError>}</>;
}

export function HiddenPeoplePanel({navigate}:{navigate(destination:Destination):void}){
 const [page,setPage]=useState<{items:Profile[];nextCursor:string|null}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const generation=useRef(0);usePanelLoading(!page&&!error);
 const load=useCallback(async(before?:string)=>{const current=++generation.current;try{const next=await operation<{items:Profile[];nextCursor:string|null}>('people.search',{scope:'hidden',limit:20,...(before?{before}:{})});if(current===generation.current){setPage(previous=>before&&previous?{...next,items:[...previous.items,...next.items]}:next);setError('');}}catch(cause){if(current===generation.current)setError(errorText(cause));}},[]);
 useEffect(()=>{void load();return()=>{generation.current++;};},[load]);useRecordRefresh(['people'],load);
 const unhide=async(personId:string)=>{if(busy)return;setBusy(personId);setError('');try{await operation('people.hide',{personId,hidden:false});setPage(previous=>previous?{...previous,items:previous.items.filter(person=>person.id!==personId)}:previous);void load();}catch(cause){setError(errorText(cause));}finally{setBusy('');}};
 return <><div className="blocked-list hidden-people-list">{page?.items.map(person=><div key={person.id}>{person.discoverable?<NavLink to={{view:'person',resourceId:person.id}} navigate={navigate}>{person.handle?`@${person.handle}`:person.name}</NavLink>:<span>{person.name}</span>}<button className="text-link" disabled={Boolean(busy)} onClick={()=>void unhide(person.id)}>Unhide</button></div>)}</div>{page&&!page.items.length&&<p className="quiet">No hidden people.</p>}{page?.nextCursor&&<button className="text-link" onClick={()=>void load(page.nextCursor!)}>More</button>}{error&&<TransientError className="error" role="alert">{error}</TransientError>}</>;
}

/** Reporting shares only the selected content, never a whole private conversation. */
export function ContentReport({personId,postId,messageId,close}:{personId:string;postId?:string;messageId?:string;close():void}) {
  const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[sent,setSent]=useState(false);
  const intent=useRef<{text:string;key:string}|null>(null);
  const submit=async(event:FormEvent)=>{event.preventDefault();if(!reason.trim()||busy)return;if(intent.current?.text!==reason.trim())intent.current={text:reason.trim(),key:crypto.randomUUID()};setBusy(true);try{await operation('people.report',{personId,reason:intent.current.text,...(postId?{postId}:{}),...(messageId?{messageId}:{})},{confirmed:true,key:intent.current.key});setSent(true);}catch(e){setError(errorText(e));}finally{setBusy(false);}};
  return sent?<div role="status"><p>Report submitted.</p><button onClick={close}>Close</button></div>:<form className="fields content-report" onSubmit={submit}><label>What happened?<textarea value={reason} maxLength={1000} onChange={event=>setReason(event.target.value)}/></label>{messageId&&<p className="quiet small">This message and your report will be shared with the operator.</p>}<div className="panel-actions"><button type="button" disabled={busy} onClick={close}>Cancel</button><button className="solid" disabled={busy||!reason.trim()}>Submit report</button></div>{error&&<TransientError className="error" role="status">{error}</TransientError>}</form>;
}
