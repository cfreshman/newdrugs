import {LocationLabel} from './LocationLabel';
import { DotsThree } from '@phosphor-icons/react';
import { ContentReport } from './PeopleSafety';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import type { Profile } from '../shared/types';
import type { CoarseArea } from '../shared/geo';
import type { Destination } from '../shared/navigation';
import { RadiusSelect } from './RadiusSelect';
import { SearchField } from './SearchField';
import type { SearchRetrieval } from '../shared/search';
import { operation, errorText } from './api';
import { LocationPicker } from './LocationPicker';
import { LinkedText } from './LinkedText';
import { VideoCamera, ArrowUp, ArrowDown } from '@phosphor-icons/react';
import { usePanelLoading, usePanelVisible } from './PanelReadiness';
import { useMessagePlacement } from './useMessagePlacement';
import { CollapsibleMessage } from './CollapsibleMessage';
import { useRecordRefresh } from './useRecordRefresh';
import { captureHistoryAnchor, restoreHistoryAnchor, OlderMessages, useTopPagination } from './ChatHistory';

interface Page<T> { items: T[]; nextCursor: string | null }
interface Connection { initialInvitation?:{fromId:string;note:string;createdAt:string}; disconnectedBy?:string; createdAt: string; id: string; members: string[]; fromId: string; toId: string; note: string; status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'disconnected'; unread?: boolean; lastMessage?: { text: string; fromId: string; createdAt: string } }
interface DirectMessage { id: string; fromId: string; text: string; createdAt: string; pending?: boolean; failed?: boolean; key?: string; clientId?: string }
type Navigate = (destination: Destination) => void;

export function LocationPanel({ user, areaCell, saved }: { user: Profile; areaCell?: string; saved(): Promise<void> }) {
  const [area, setArea] = useState<CoarseArea | null>(user.area || null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { let cancelled = false; if (areaCell && areaCell !== user.area?.cell) void operation<CoarseArea>('locations.resolve', { cell: areaCell }).then(value => { if (!cancelled) setArea(value); }).catch(error => { if (!cancelled) setError(errorText(error)); }); return () => { cancelled = true; }; }, [areaCell]);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await operation('profile.update', { locationCell: area?.cell || null }); await saved(); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  };
  return <form className="fields" onSubmit={save}><LocationPicker value={area} onChange={setArea} /><button className="solid" disabled={busy}>{busy ? 'Saving…' : 'Save area'}</button>{error && <p className="error" role="alert">{error}</p>}</form>;
}

export function PeoplePanel({ user, areaCell, radiusMiles = 25, initialQuery = '', initialScope, onStateChange, navigate }: { user: Profile; areaCell?: string; radiusMiles?: number; initialQuery?:string; initialScope?:Destination['scope']; onStateChange?(context:Partial<Destination>):void; navigate: Navigate }) {
  const [people, setPeople] = useState<(Page<Profile> & {retrieval?:SearchRetrieval}) | null>(null), [error, setError] = useState('');
  const [query,setQuery]=useState(initialQuery ?? ''), [radius,setRadius]=useState(typeof radiusMiles === 'number' && Number.isFinite(radiusMiles) && radiusMiles >= 10 && radiusMiles <= 250 ? radiusMiles : 25), [scope,setScope]=useState<'all'|'nearby'>(initialScope==='all'?'all':areaCell || user.area ? 'nearby' : 'all'); const requestId=useRef(0);
  useEffect(()=>{setQuery(initialQuery||'');setRadius(radiusMiles);setScope(initialScope==='all'?'all':initialScope==='nearby'||areaCell||user.area?'nearby':'all');},[initialQuery,initialScope,radiusMiles,areaCell]);
  const change=(context:Partial<Destination>)=>onStateChange?.({query,scope,radiusMiles:radius,...context});
  const near = areaCell || user.area?.cell;
  usePanelLoading((scope==='all'||Boolean(near)) && !people && !error);
  const load = useCallback(async (before?: string) => {
    if (scope==='nearby' && !near) return;
    const request=++requestId.current;
    try { const page = await operation<Page<Profile>>('people.search', { scope, ...(scope==='nearby'?{near,radiusMiles:radius ?? 25}:{}), ...(query?{query}:{}), ...(before ? { before } : {}) }); if(request!==requestId.current)return; setPeople(previous => before && previous ? { ...page, items: [...previous.items, ...page.items] } : page); setError(''); }
    catch (error) { setError(errorText(error)); }
  }, [near, radius, query, scope]);
  useEffect(() => { setPeople(null); void load(); }, [load]);
  useRecordRefresh(['people'], load);
  return <>
    <SearchField label="Search people by interests" value={query} onSearch={value => { if (value === query) void load(); else {setQuery(value);change({query:value});} }}/>
    <nav className="view-tabs" aria-label="People filter"><button aria-pressed={scope==='nearby'} onClick={()=>{setScope('nearby');change({scope:'nearby'});}}>Nearby</button><button aria-pressed={scope==='all'} onClick={()=>{setScope('all');change({scope:'all'});}}>All people</button></nav>
    {scope==='nearby' && <div className="search-area-controls"><button className="text-link" onClick={()=>navigate({view:'location'})}>{near ? user.area?.cell===near ? <LocationLabel label={user.area.label}/> : 'Change area' : 'Choose your area'}</button>{near && <RadiusSelect value={radius} onChange={value=>{setRadius(value);change({radiusMiles:value});}}/>}</div>}
    {people?.retrieval?.notices.map(notice=><p className="quiet small" key={notice}>{notice}</p>)}
    {people && !people.items.length && <p className="quiet">{query ? 'No matching profiles found.' : scope==='nearby' ? 'No shared profiles found in this area yet.' : 'No shared profiles yet.'}</p>}
    <div className="people-list">{people?.items.map(person => <button key={person.id} onClick={() => navigate({ view: 'person', resourceId: person.id })}>
      {person.photos?.[0] && <img src={`/api/files/${encodeURIComponent(person.photos[0])}`} alt="" />}<span><strong>{person.name || `@${person.handle}`}</strong><span className="quiet small">{person.handle && <><span className="person-handle">@{person.handle}</span>{' · '}</>}<LocationLabel label={person.area?.label}/></span>{person.bio && <span className="person-excerpt">{person.bio}</span>}</span>
    </button>)}</div>
    {people?.nextCursor && <button className="text-link" onClick={() => void load(people.nextCursor!)}>More people</button>}
    {error && <p className="error">{error}</p>}
  </>;
}

export function MessagesPanel({ userId, connectionId, navigate }: { userId: string; connectionId?: string; navigate: Navigate }) {
  const visible = usePanelVisible();
  const [inbox, setInbox] = useState<(Page<Connection> & { people: Profile[] }) | null>(null), [messages, setMessages] = useState<Page<DirectMessage> | null>(null);
  const [current, setCurrent] = useState<{ connection: Connection; people: Profile[] } | null>(null);
  const [reconnectNote,setReconnectNote]=useState('');
  const [reporting,setReporting]=useState<string|null>(null),[choosingReport,setChoosingReport]=useState(false);
  const [filter, setFilter] = useState<'all' | 'invites'>('all');
  const [text, setText] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [awayFromBottom,setAwayFromBottom]=useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false), [olderError, setOlderError] = useState('');
  const olderRequest = useRef<string | null>(null), prependAnchor = useRef<ReturnType<typeof captureHistoryAnchor> | null>(null), isVisible = useRef(visible); isVisible.current = visible;
  const generation = useRef(0), scroller = useRef<HTMLDivElement>(null), following = useRef(true), readThrough = useRef('');
  const input = useRef<HTMLTextAreaElement>(null);
  const composer = useRef<HTMLFormElement>(null), content = useRef<HTMLDivElement>(null);
  const placeMessage = useMessagePlacement(composer, scroller, `${userId}:${connectionId}`, !visible);
  const pendingSend = useRef<{ text: string; connectionId: string; key: string } | null>(null);
  usePanelLoading(!error && (connectionId ? !current : !inbox));
  useLayoutEffect(() => {
    if (!input.current) return;
    input.current.style.height = 'auto'; input.current.style.height = `${Math.min(140, Math.max(48, input.current.scrollHeight))}px`;
    if (visible && following.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [text, Boolean(messages), connectionId, visible]);
  const merge = (previous: DirectMessage[], incoming: DirectMessage[]) => [...new Map([...previous.filter(message => !message.key || !incoming.some(saved => saved.clientId === message.key && saved.fromId === message.fromId)), ...incoming].map(message => [message.id, message])).values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      if (connectionId) {
        const relationship = await operation<{ connection: Connection; people: Profile[] }>('connections.get', { connectionId });
        const page = (relationship.connection.status === 'accepted' || relationship.connection.initialInvitation) ? await operation<Page<DirectMessage>>('messages.list', { connectionId }) : null;
        if (request !== generation.current) return;
        setCurrent(relationship);
        setMessages(previous => page ? { ...page, nextCursor: previous && previous.items.length > page.items.length ? previous.nextCursor : page.nextCursor, items: merge(previous?.items || [], page.items) } : null);
      } else { const inbox = await operation<Page<Connection> & { people: Profile[] }>('connections.list'); if (request === generation.current) setInbox(inbox); }
      if (request === generation.current) setError('');
    } catch (error) { if (request === generation.current) { setError(errorText(error)); setCurrent(null); setMessages(null); } }
  }, [connectionId]);
  useEffect(() => { setMessages(null); setReporting(null); setChoosingReport(false); setInbox(null); setCurrent(null); setText(''); setLoadingOlder(false); setOlderError(''); setAwayFromBottom(false); prependAnchor.current = null; following.current = true; readThrough.current = ''; pendingSend.current = null; void load(); return () => { generation.current++; }; }, [load]);
  useRecordRefresh(['connections', 'messages'], load);
  const markRead = useCallback(() => {
    if (!visible || !connectionId || current?.connection.status !== 'accepted' || document.hidden || !following.current) return;
    const latest = messages?.items.find(message => !message.pending && !message.failed)?.id || 'empty';
    if (readThrough.current === latest) return;
    readThrough.current = latest;
    void operation('messages.mark_read', { connectionId, ...(latest === 'empty' ? {} : { throughMessageId: latest }) }).catch(error => { readThrough.current = ''; console.error('Conversation read:', error); });
  }, [connectionId, current?.connection.status, messages?.items[0]?.id, visible]);
  const rememberPosition=()=>{const node=scroller.current;if(visible&&node)setAwayFromBottom(node.scrollHeight-node.clientHeight-node.scrollTop>24);};
  const followLatest=()=>{const node=scroller.current;if(!node)return;prependAnchor.current=null;following.current=true;node.scrollTop=node.scrollHeight;setAwayFromBottom(false);markRead();};
  useLayoutEffect(() => { if (!visible) return; if (following.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; rememberPosition();markRead(); }, [messages?.items.length, markRead, visible]);
  useEffect(() => { document.addEventListener('visibilitychange', markRead); return () => document.removeEventListener('visibilitychange', markRead); }, [markRead]);
  useLayoutEffect(() => {
    if (!visible || !scroller.current || !content.current) return;
    const observer = new ResizeObserver(() => { if (following.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;rememberPosition(); });
    observer.observe(scroller.current); observer.observe(content.current); return () => observer.disconnect();
  }, [visible, Boolean(messages)]);
  const older = async () => {
    const cursor = messages?.nextCursor; if (!cursor || !connectionId) return;
    const key = `${connectionId}:${cursor}`; if (olderRequest.current === key) return;
    const request = generation.current, before = scroller.current ? captureHistoryAnchor(scroller.current) : null;
    olderRequest.current = key; setLoadingOlder(true); setOlderError('');
    try {
      const page = await operation<Page<DirectMessage>>('messages.list', { connectionId, before: cursor });
      if (request !== generation.current) return;
      // A jump to latest during this request wins over the older-page anchor.
      prependAnchor.current = following.current ? null : isVisible.current && scroller.current ? captureHistoryAnchor(scroller.current) : before;
      setMessages(previous => ({ ...page, items: merge(previous?.items || [], page.items) }));
    } catch (error) { if (request === generation.current) setOlderError(errorText(error)); }
    finally { if (olderRequest.current === key) olderRequest.current = null; if (request === generation.current) setLoadingOlder(false); }
  };
  useTopPagination(scroller, { enabled: visible && !olderError, hasMore: Boolean(messages?.nextCursor), count: messages?.items.length || 0, scope: connectionId, load: older });
  useLayoutEffect(() => { if (visible && prependAnchor.current && scroller.current) { restoreHistoryAnchor(scroller.current, prependAnchor.current); prependAnchor.current = null;rememberPosition(); } });
  const respond = async (connection: Connection, accept: boolean) => { setBusy(true); try { await operation('connections.respond', { connectionId: connection.id, accept }, { confirmed: true }); await load(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } };
  const send = async (event?: FormEvent, retry?: DirectMessage) => {
    event?.preventDefault(); const message = retry?.text || text.trim(); if (!message || !connectionId || busy) return;
    const intent = pendingSend.current?.text === message && pendingSend.current.connectionId === connectionId ? pendingSend.current : { text: message, connectionId, key: crypto.randomUUID() };
    if (retry?.key) intent.key = retry.key;
    const optimistic: DirectMessage = { id: `pending:${intent.key}`, fromId: userId, text: message, createdAt: retry?.createdAt || new Date().toISOString(), pending: true, key: intent.key, clientId: intent.key };
    if (!retry) placeMessage(optimistic.id, message);
    following.current = true; setAwayFromBottom(false);setBusy(true); setText('');
    setMessages(previous => ({ nextCursor: previous?.nextCursor || null, items: merge((previous?.items || []).filter(item => item.id !== optimistic.id), [optimistic]) }));
    pendingSend.current = intent;
    try { const saved = { ...await operation<DirectMessage>('messages.send', { connectionId, text: message, clientId:intent.key }, { key: intent.key }), clientId: intent.key }; pendingSend.current = null; setMessages(previous => previous && { ...previous, items: merge(previous.items.filter(item => item.id !== optimistic.id), [saved]) }); setError(''); }
    catch (error) { setError(errorText(error)); setMessages(previous => previous && { ...previous, items: previous.items.map(item => item.id === optimistic.id ? { ...item, pending: false, failed: true } : item) }); } finally { setBusy(false); }
  };
  const withdraw = async (connection: Connection) => { setBusy(true); try { await operation('connections.withdraw', { connectionId: connection.id }); await load(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } };
  const moreConnections = async () => {
    if (!inbox?.nextCursor) return;
    const request = generation.current;
    try { const next = await operation<Page<Connection> & { people: Profile[] }>('connections.list', { before: inbox.nextCursor }); if (request === generation.current) setInbox(previous => previous && { ...next, items: [...new Map([...previous.items, ...next.items].map(item => [item.id, item])).values()], people: [...new Map([...previous.people, ...next.people].map(person => [person.id, person])).values()] }); }
    catch (error) { setError(errorText(error)); }
  };
  if (!connectionId) return <><nav className="view-tabs" aria-label="Inbox filter"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button><button aria-pressed={filter === 'invites'} onClick={() => setFilter('invites')}>Invitations</button></nav>
    <div className="inbox-list">{inbox?.items.filter(connection => filter === 'all' || connection.status === 'pending' || connection.status === 'declined' || connection.status === 'withdrawn').map(connection => {
      const person = inbox.people.find(person => person.id === connection.members.find(id => id !== userId));
      return <article key={connection.id}><div className="inbox-heading"><button className="text-link" disabled={person?.discoverable===false&&!['accepted','pending'].includes(connection.status)&&!(connection.status==='declined'&&connection.toId===userId)} onClick={() => navigate({ view: 'person', resourceId: person?.id || connection.members.find(id => id !== userId) })}>{person?.handle ? `@${person.handle}` : person?.name || 'View profile'}</button>{connection.unread && <span className="unread-label">Unread</span>}</div>
        <p className="inbox-preview">{connection.lastMessage ? `${connection.lastMessage.fromId === userId ? 'You: ' : ''}${connection.lastMessage.text}` : connection.note}</p>
        {connection.status === 'accepted' ? <button className="text-link" onClick={() => navigate({ view: 'messages', resourceId: connection.id })}>Open conversation</button>
          : connection.status === 'pending' && connection.toId === userId ? <div className="review-buttons"><button disabled={busy} onClick={() => void respond(connection, false)}>Decline</button><button disabled={busy} onClick={() => void respond(connection, true)}>Accept invitation</button></div>
            : connection.status === 'pending' ? <div className="inline-actions"><span className="quiet small">Invitation sent</span><button className="text-link small" disabled={busy} onClick={() => void withdraw(connection)}>Withdraw invitation</button></div>
              : <span className="quiet small">{connection.status === 'disconnected' ? 'Connection ended' : connection.status === 'withdrawn' ? 'Invitation withdrawn' : 'Invitation declined'}</span>}
      {connection.status!=='accepted'&&<button className="text-link" onClick={()=>navigate({view:'messages',resourceId:connection.id})}>{connection.initialInvitation?'View conversation history':'View invitation'}</button>}</article>;
    })}</div>{inbox && !inbox.items.length && <><p className="quiet">No invitations or conversations yet.</p><button className="text-link" onClick={() => navigate({ view: 'people' })}>Find people nearby</button></>}
    {inbox?.nextCursor && <button className="text-link" onClick={() => void moreConnections()}>More conversations</button>}{error && <p className="error" role="alert">{error}</p>}</>;
  const other = current?.people.find(person => person.id !== userId);
  return <div className={messages ? 'message-view' : undefined}>{other && <div className="message-view-actions"><button className="text-link" disabled={other.discoverable===false&&!['accepted','pending'].includes(current!.connection.status)&&!(current!.connection.status==='declined'&&current!.connection.toId===userId)} onClick={() => navigate({ view: 'person', resourceId: other.id })}>{other.handle ? `@${other.handle}` : other.name}</button>{messages && current?.connection.status==='accepted' && <a className="video-link" href="https://pair.video" target="_blank" rel="noopener noreferrer" title="Create a call, then share its link in this conversation"><VideoCamera size={19} />Video call</a>}{messages&&<details className="conversation-menu"><summary aria-label="Conversation actions"><DotsThree size={23}/></summary><div><button type="button" onClick={event=>{setChoosingReport(true);setReporting(null);event.currentTarget.closest('details')?.removeAttribute('open');}}>Report a message</button></div></details>}</div>}
    {current && ['pending','declined','withdrawn'].includes(current.connection.status) && <p>{current.connection.note}</p>}
    {current?.connection.status === 'pending' && <>{current.connection.toId === userId ? <div className="review-buttons"><button disabled={busy} onClick={() => void respond(current.connection, false)}>Decline</button><button disabled={busy} onClick={() => void respond(current.connection, true)}>Accept invitation</button></div> : <><p className="quiet">Invitation sent. Messages open when they accept.</p><button className="text-link" disabled={busy} onClick={() => void withdraw(current.connection)}>Withdraw invitation</button></>}</>}
    {current?.connection.status === 'declined' && <><p className="quiet">This invitation was declined.</p>{current.connection.toId===userId&&<button onClick={()=>navigate({view:'person',resourceId:current.connection.fromId})}>Send a new invitation</button>}</>}{current?.connection.status==='disconnected'&&<><p className="quiet">This connection has ended. Message history is read-only.</p>{current.connection.disconnectedBy===userId&&<form className="fields" onSubmit={event=>{event.preventDefault();if(!reconnectNote.trim()||busy)return;setBusy(true);void operation('connections.request',{personId:current.connection.members.find(id=>id!==userId),note:reconnectNote.trim()},{confirmed:true}).then(()=>{setReconnectNote('');return load();}).catch(e=>setError(errorText(e))).finally(()=>setBusy(false));}}><label>New invitation<textarea value={reconnectNote} maxLength={500} onChange={event=>setReconnectNote(event.target.value)}/></label><button className="solid" disabled={busy||!reconnectNote.trim()}>Send invitation</button></form>}</>}{current?.connection.status === 'withdrawn' && <p className="quiet">This invitation was withdrawn.</p>}
    {messages && <>{choosingReport&&<div className="message-report-choice"><span>Choose a message to report.</span><button onClick={()=>{setChoosingReport(false);setReporting(null);}}>Cancel</button></div>}<div className="direct-message-scroll"><div className="direct-messages" ref={scroller} onScroll={() => { if (!visible) return; const node = scroller.current!; following.current = node.scrollHeight - node.clientHeight - node.scrollTop <= 24; setAwayFromBottom(!following.current); markRead(); }}>
      <div className="direct-message-content" ref={content}><OlderMessages hasMore={Boolean(messages.nextCursor)} loading={loadingOlder} error={olderError} retry={() => void older()} />
      {!messages.nextCursor && (current?.connection.initialInvitation?.note || current?.connection.note) && <article className={`message invitation-message ${(current.connection.initialInvitation?.fromId || current.connection.fromId) === userId ? 'user' : 'peer'}`} data-invitation-id={current.connection.id}>
        <small className="invitation-meta">Invitation · <time dateTime={current.connection.initialInvitation?.createdAt || current.connection.createdAt}>{new Date(current.connection.initialInvitation?.createdAt || current.connection.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time></small>
        <div className="bubble"><CollapsibleMessage text={current.connection.initialInvitation?.note || current.connection.note} assistant={false} social scrollRef={scroller} /></div>
      </article>}
      {[...messages.items].reverse().map(message=>{
        const selectable=choosingReport&&message.fromId!==userId;
        const select=()=>{setReporting(message.id);setChoosingReport(false);};
        return <article className={`message ${message.fromId===userId?'user':'peer'}`} key={message.clientId||message.id} data-message-id={message.clientId?`pending:${message.clientId}`:message.id}>
          <div className={`bubble ${selectable?'report-target':''}`} role={selectable?'button':undefined} tabIndex={selectable?0:undefined} aria-label={selectable?`Report message: ${message.text}`:undefined}
            onClickCapture={selectable?event=>{event.preventDefault();event.stopPropagation();select();}:undefined}
            onKeyDownCapture={selectable?event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();select();}}:undefined}>
            <CollapsibleMessage text={message.text} assistant={false} social scrollRef={scroller}/>
          </div>
          {reporting===message.id&&<ContentReport personId={message.fromId} messageId={message.id} close={()=>setReporting(null)}/>}
          {message.failed&&<button className="retry-message" disabled={busy} onClick={()=>void send(undefined,message)}>Not sent · retry</button>}
        </article>;
      })}</div>
    </div>{awayFromBottom&&<button className="latest-chat latest-dm" type="button" aria-label="Latest messages" title="Latest messages" onClick={followLatest}><ArrowDown size={22} weight="bold"/></button>}</div>{current?.connection.status==='accepted'&&<form className="message-compose" ref={composer} onSubmit={send}><label className="sr-only" htmlFor="direct-message">Message</label><textarea id="direct-message" ref={input} value={text} maxLength={2000} rows={2} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(event); } }} /><button className="solid" aria-label="Send direct message" disabled={busy || !text.trim()}><ArrowUp size={20} weight="bold" /></button></form>}</>}{error && <p className="error" role="alert">{error}</p>}</div>;
}
