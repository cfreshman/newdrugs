import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUp, Stop, GearSix, UserCircle, CreditCard, Plugs, Heart, SignOut, Bell, X, ArrowLeft, SquaresFour, Users, Article, ChatCircle, Paperclip, Shield, HardDrives, ArrowClockwise } from '@phosphor-icons/react';
import type { Bootstrap, Message, RunView } from '../shared/types';
import { api, post, errorText, ApiError, balanceLabel } from './api';
import { useDictation } from './useDictation';
import { Orb } from './Orb';
import { Dialog } from './Dialog';
import { Account, Connections, Credits } from './Panels';
import { useChatPosition } from './useChatPosition';
import { useConversationScroll } from './useConversationScroll';
import { RunProgress } from './RunProgress';
import { AgentLiveMessage } from './AgentLiveMessage';
import { CollapsibleMessage } from './CollapsibleMessage';
import { useMessagePlacement } from './useMessagePlacement';
import { usePageChatScroll } from './usePageChatScroll';
import { useLiveState } from './useLiveState';
import { PersonPanel } from './PersonPanel';
import { PeoplePanel, MessagesPanel, LocationPanel } from './NativePanels';
import { PreservedPanels } from './PreservedPanels';
import { FeedPanel, PostPanel, SelectedPostsPanel } from './PostPanels';
import { BlockedPanel } from './PeopleSafety';
import { ComposerPanel } from './ComposerPanel';
import { StoragePanel } from './StoragePanel';
import { useControlDrag } from './useControlDrag';
import { NavigationContext } from './NavigationContext';
import { NotificationsPanel } from './NotificationsPanel';
import { UploadPanel } from './UploadPanel';
import type { UploadRef } from '../shared/uploads';
import { parseDestination, surfaceTitles, surfaceViews, type Destination } from '../shared/navigation';
import release from '../release.json';

const inlineViews = new Set(['people', 'person', 'feed', 'post_list', 'post', 'messages', 'location', 'uploads']);
const accountViews = new Set(['people', 'person', 'feed', 'post_list', 'post', 'messages', 'location', 'uploads', 'storage', 'blocked', 'notifications', 'connections']);
type Panel = Exclude<Destination['view'], 'chat' | 'profile'> | 'account' | null;
interface ComposerScreen { panel: Panel; context: Omit<Destination, 'view'>; history: { panel: Exclude<Panel, null>; context: Omit<Destination, 'view'> }[]; title: string; content: ReactNode; open: boolean; reset: number }
function mergeRun(previous: RunView | null, next: RunView | null) {
  if (!next || !previous || next.id !== previous.id) return next;
  if (next.revision < previous.revision) return previous;
  // Recovered partial history can lag the live draft. Keep the text already
  // shown until a newer suffix or the authoritative completed message arrives.
  if (['queued', 'running'].includes(next.status) && previous.draft.startsWith(next.draft)) return { ...next, draft: previous.draft };
  return next;
}
const logError = (message: string) => { if (message) console.error('New Drugs:', message); };
function browserSession() {
  const fallback = crypto.randomUUID();
  try { const prior = sessionStorage.getItem('nd-client'); if (prior) return prior; sessionStorage.setItem('nd-client', fallback); } catch { /* Optional storage. */ }
  return fallback;
}
export function App() {
  const [clientId] = useState(browserSession);
  const [data, setData] = useState<Bootstrap | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [run, setRun] = useState<RunView | null>(null);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [panelReset, setPanelReset] = useState(0);
  const [panelSpace, setPanelSpace] = useState<'modal' | 'composer'>('modal');
  const [panelContext, setPanelContext] = useState<Omit<Destination, 'view'>>({});
  const [afterAccount, setAfterAccount] = useState<{ panel?: Exclude<Panel, null>; context?: Omit<Destination, 'view'>; space?: 'modal' | 'composer'; chat?: string } | null>(null);
  const [resumeChat, setResumeChat] = useState<string | null>(null);
  const [accountMode, setAccountMode] = useState<'register' | 'login'>('register');
  const [panelHistory, setPanelHistory] = useState<{ panel: Exclude<Panel, null>; context: Omit<Destination, 'view'> }[]>([]);
  const [underlay, setUnderlay] = useState<ComposerScreen | null>(null);
  const lastComposer = useRef<ComposerScreen | null>(null);
  const [surface, setSurface] = useState<{ runId: string; id: string; view: string } | null>(null);
  const [attachments, setAttachments] = useState<UploadRef[]>([]);
  const composer = useRef<HTMLDivElement>(null);
  const inputForm = useRef<HTMLFormElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const { style, sideBySide, ...dragHandlers } = useChatPosition(composer, Boolean(data), launcherOpen && Boolean(panelSpace === 'composer' ? panel : underlay?.panel), launcherOpen);
  const inputOccupied = launcherOpen && !sideBySide;
  const launcherDrag = useControlDrag(dragHandlers);
  const scroll = useConversationScroll({viewId:data?.user.id,submittedId:messages.findLast(m=>m.role==='user')?.id,completedId:messages.findLast(m=>m.role==='assistant'&&m.status!=='pending')?.id,approvalIds:run?.approvals.map(a=>a.id).join(',')});
  usePageChatScroll(page, scroll.transcript, Boolean(data), Boolean(panel && panelSpace === 'modal') || inputOccupied, scroll.onScroll);
  const seenSurfaces = useRef(new Set<string>());
  const dictation = useDictation(draft, setDraft, logError);
  const busy = submitting || Boolean(run && !['completed', 'cancelled', 'failed'].includes(run.status));
  const busyRef = useRef(busy); busyRef.current = busy;
  const submission = useRef<string | null>(null);
  const identity = useRef<string | null>(null);
  const completedRuns = useRef(new Set<string>());
  const rememberCompleted = (list: Message[]) => { for (const message of list) if (message.role === 'assistant' && message.id.endsWith(':assistant')) completedRuns.current.add(message.id.slice(0, -10)); };
  const liveRevision = useRef(0), refreshRequest = useRef(0);
  const refresh = useCallback(async () => {
    const revision = liveRevision.current, request = ++refreshRequest.current;
    const next = await api<Bootstrap>('/bootstrap');
    if (request !== refreshRequest.current) return;
    const changedIdentity = identity.current !== next.user.id;
    if (!changedIdentity && revision !== liveRevision.current) return;
    if (changedIdentity) {
      identity.current = next.user.id; completedRuns.current.clear(); submission.current = null;
      dictation.cancel(); setLauncherOpen(false); setUnderlay(null); lastComposer.current = null; setAfterAccount(null); setResumeChat(null); setSubmitting(false); setSurface(null); setAttachments([]); setPanel(null); setPanelHistory([]); seenSurfaces.current.clear();
      let outbox: Message[] = [];
      try { setDraft(localStorage.getItem(`nd-draft:${next.user.id}`) || ''); outbox = JSON.parse(localStorage.getItem(`nd-outbox:${next.user.id}`) || '[]'); } catch { /* Optional storage. */ }
      setMessages([...next.messages, ...outbox.filter(message => !next.messages.some(saved => saved.id === message.id)).map(message => ({ ...message, status: 'failed' as const }))]);
    }
    rememberCompleted(next.messages);
    setData(next); setRun(previous => next.run && completedRuns.current.has(next.run.id) ? null : mergeRun(previous, next.run ?? null));
    if (!changedIdentity) setMessages(previous => [...next.messages, ...previous.filter(m => ['pending', 'failed'].includes(m.status || '') && !next.messages.some(s => s.id === m.id))]);
  }, []);
  useLiveState(data?.user.id, (change, actorId) => {
    if (actorId !== identity.current) return;
    liveRevision.current++;
    if (change.messages) rememberCompleted(change.messages);
    const pending = submission.current;
    if (pending && (change.run?.id === pending || change.messages?.some(message => message.id === `${pending}:user`))) {
      if ('run' in change && !change.run) completedRuns.current.add(pending);
      submission.current = null; setSubmitting(false);
    }
    setData(previous => previous ? { ...previous, ...change } : previous);
    if ('run' in change) setRun(previous => change.run && completedRuns.current.has(change.run.id) ? null : mergeRun(previous, change.run ?? null));
    if (change.messages) setMessages(previous => [...change.messages!, ...previous.filter(message => ['pending', 'failed'].includes(message.status || '') && !change.messages!.some(saved => saved.id === message.id))]);
  }, refresh);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await post('/session'); const initial = await api<Bootstrap>('/bootstrap'); if (cancelled) return;
        identity.current = initial.user.id;
        setData(initial); setRun(initial.run ?? null);
        rememberCompleted(initial.messages);
        let outbox: Message[] = [];
        try {
          setDraft(localStorage.getItem(`nd-draft:${initial.user.id}`) || '');
          outbox = JSON.parse(localStorage.getItem(`nd-outbox:${initial.user.id}`) || '[]');
        } catch { /* Optional storage. */ }
        setMessages([...initial.messages, ...outbox.filter(m => !initial.messages.some(s => s.id === m.id)).map(m => ({ ...m, status: 'failed' as const }))]);
        if (new URL(location.href).searchParams.has('payment')) { setPanel('credits'); history.replaceState(null, '', location.pathname); }
        else { const destination = parseDestination(location.href, location.origin); if (destination && destination.view !== 'chat') { setPanel(destination.view === 'profile' ? 'account' : destination.view); setPanelContext(destination); if (inlineViews.has(destination.view)) { setPanelSpace('composer'); setLauncherOpen(true); } history.replaceState(null, '', '/'); } }
      } catch (e) { logError(errorText(e)); }
    })();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!data) return;
    try {
      localStorage.setItem(`nd-draft:${data.user.id}`, draft);
      localStorage.setItem(`nd-outbox:${data.user.id}`, JSON.stringify(messages.filter(m => m.role === 'user' && ['pending', 'failed'].includes(m.status || ''))));
    } catch { /* Optional storage. */ }
  }, [draft, messages, data?.user.id]);
  useLayoutEffect(() => {
    const el = textarea.current; if (!el) return;
    el.style.height = 'auto'; el.style.height = `${Math.min(180, Math.max(76, el.scrollHeight))}px`;
  }, [draft, Boolean(data)]);
  useEffect(() => {
    if (!data || panel && panelSpace === 'modal' || launcherOpen) return;
    const frame = requestAnimationFrame(() => textarea.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [Boolean(data), panel, panelSpace, launcherOpen]);
  const placeMessage = useMessagePlacement(inputForm, scroll.transcript, data?.user.id, Boolean(panel && panelSpace === 'modal') || inputOccupied);
  const open = (next: Panel, context: Omit<Destination, 'view'> = {}, space: 'modal' | 'composer' = 'modal') => {
    if (data?.user.id !== identity.current) return;
    if (next && accountViews.has(next) && !data?.user.handle) { setAfterAccount({ panel: next, context, space }); next = 'account'; context = {}; setAccountMode('register'); }
    dictation.stop();
    if (space === 'modal' && panelSpace === 'composer') setUnderlay(lastComposer.current);
    else if (space === 'composer') setUnderlay(null);
    setPanelSpace(space); if (space === 'composer') setLauncherOpen(true);
    setPanelHistory(next === 'notifications' ? [{ panel: 'settings', context: {} }] : []); setPanelContext(context); setPanel(next);
  };
  const navigatePanel = (next: Exclude<Panel, null>, context: Omit<Destination, 'view'> = {}) => {
    if (data?.user.id !== identity.current) return;
    if (accountViews.has(next) && !data?.user.handle) { setAfterAccount({ panel: next, context, space: panelSpace }); next = 'account'; context = {}; setAccountMode('register'); }
    if (panel) setPanelHistory(previous => [...previous, { panel, context: panelContext }]); setPanelContext(context); setPanel(next);
  };
  const backPanel = () => { const previous = panelHistory.at(-1); if (previous) { setPanel(previous.panel); setPanelContext(previous.context); setPanelHistory(history => history.slice(0, -1)); } else if (panelSpace === 'composer') setPanel(null); };
  const navigate = (destination: Destination) => {
    if (destination.view === 'settings') { open('settings'); return; }
    if (destination.view === 'chat') { void closePanel().then(() => setLauncherOpen(false)); return; }
    const next = destination.view === 'profile' ? 'account' : destination.view;
    if (panel && (launcherOpen || panelSpace === 'modal')) navigatePanel(next, destination); else open(next, destination, inlineViews.has(next) ? 'composer' : 'modal');
  };
  const openRunSurface = (active: RunView) => {
    if (!active.surface) return;
    if (!(surfaceViews as readonly string[]).includes(active.surface.view)) { logError(`Unknown app destination: ${active.surface.view}`); return; }
    seenSurfaces.current.add(active.surface.id);
    try { sessionStorage.setItem(`nd-surface:${active.surface.id}`, 'seen'); } catch { /* Optional storage. */ }
    setSurface({ runId: active.id, id: active.surface.id, view: active.surface.view });
    const view = active.surface.view as Destination['view'];
    open(view === 'profile' ? 'account' : view as Exclude<Panel, null>, active.surface, inlineViews.has(view) ? 'composer' : 'modal');
  };
  useEffect(() => {
    if (!run?.surface || run.surface.completed || run.clientId !== clientId || seenSurfaces.current.has(run.surface.id)) return;
    try { if (sessionStorage.getItem(`nd-surface:${run.surface.id}`)) return; } catch { /* Optional storage. */ }
    openRunSurface(run);
  }, [run?.surface?.id, clientId]);
  const closePanel = async (saved = false, fileIds: string[] = []) => {
    if (data?.user.id !== identity.current) return;
    setAfterAccount(null);
    if (panelSpace === 'modal' && underlay) { setPanel(underlay.panel); setPanelContext(underlay.context); setPanelHistory(underlay.history); setPanelSpace('composer'); setLauncherOpen(underlay.open); setUnderlay(null); return; }
    if (panelSpace === 'modal') { setPanel(null); setPanelHistory([]); }
    setLauncherOpen(false);
    if (surface) { try { const matches = (surface.view === 'profile' && panel === 'account') || surface.view === panel; await post(`/runs/${surface.runId}/surface`, { id: surface.id, saved: saved && matches, fileIds }); await refresh(); } catch (e) { logError(errorText(e)); } setSurface(null); }
  };
  const send = async (event?: FormEvent, textOverride?: string, retry?: Message) => {
    event?.preventDefault();
    if (inputOccupied || (dictation.active && textOverride === undefined) || busyRef.current || !data || data.user.id !== identity.current) return;
    const text = (textOverride ?? draft).trim(); const files = retry?.files || attachments; if (!text && !files.length) return;
    const commands: Record<string, Panel> = { '/profile': 'account', '/account': 'account', '/credits': 'credits', '/connect': 'connections', '/nearby': 'people', '/feed': 'feed', '/location': 'location', '/messages': 'messages', '/upload': 'uploads' };
    if (commands[text.toLowerCase()]) { const destination = commands[text.toLowerCase()]!; open(destination, {}, inlineViews.has(destination) ? 'composer' : 'modal'); setDraft(''); return; }
    if (!data.user.handle) { setAfterAccount({ chat: text }); setAccountMode('register'); setDraft(text); open('account'); return; }
    const requestId = retry ? retry.id.split(':')[1] : crypto.randomUUID();
    const id = `${data.user.id}:${requestId}:user`;
    const runId = `${data.user.id}:${requestId}`;
    submission.current = runId;
    if (!retry) { if (!files.length) placeMessage(id, text); dictation.stop(); setDraft(''); setAttachments([]); }
    setRun(null);
    busyRef.current = true; setSubmitting(true); scroll.follow();
    const message: Message = { id, role: 'user', text, files, createdAt: new Date().toISOString(), source: 'app', status: 'pending' };
    setMessages(previous => [...previous.filter(m => m.id !== id), message]);
    let accepted = false;
    try {
      const result = await post<{ run: RunView }>('/chat', { text, fileIds: files.map(file => file.id), requestId, clientId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      if (data.user.id !== identity.current) return;
      accepted = true;
      if (submission.current === runId) { submission.current = null; setSubmitting(false); }
      setRun(previous => completedRuns.current.has(result.run.id) ? previous : mergeRun(previous, result.run));
      await refresh();
    } catch (e) {
      if (data.user.id !== identity.current) return;
      logError(errorText(e));
      if (e instanceof ApiError && e.code === 'credit_required') open('credits');
      if (!accepted) setMessages(previous => previous.map(m => m.id === id ? { ...m, status: 'failed' } : m));
    } finally { if (submission.current === runId) { submission.current = null; setSubmitting(false); } }
  };
  useEffect(() => {
    if (!resumeChat || !data?.user.handle || inputOccupied || panel && panelSpace === 'modal') return;
    const text = resumeChat; setResumeChat(null); void send(undefined, text);
  }, [resumeChat, data?.user.handle, inputOccupied, panel, panelSpace]);
  const accountSaved = async () => {
    const intent = afterAccount; setAfterAccount(null);
    if (surface) { await closePanel(true); return; }
    if (intent?.panel) { open(intent.panel, intent.context, intent.space); return; }
    if (intent?.chat) { await closePanel(); setResumeChat(intent.chat); return; }
    if (panelHistory.length) backPanel(); else await closePanel(true);
  };
  const bubble = (message: Message) => <article className={`message ${message.role}`} data-message-id={message.id} key={message.id}>
    <span className="sr-only">{message.role === 'user' ? 'You' : 'Your agent'}: </span>
    <div className="bubble">{message.text && <CollapsibleMessage text={message.text} assistant={message.role === 'assistant'} scrollRef={scroll.transcript} />}{message.files?.map(file => <a className="message-file" href={`/api/files/${encodeURIComponent(file.id)}`} target="_blank" rel="noopener noreferrer" key={file.id}>{file.name}</a>)}{message.id === `intro:${data?.user.id}` && !data?.user.handle && <div className="welcome-actions"><button onClick={() => { setAccountMode('register'); open('account'); }}>Create account</button><button onClick={() => { setAccountMode('login'); open('account'); }}>Sign in</button></div>}</div>
    {message.status === 'failed' && <button className="retry-message" disabled={busy} onClick={() => void send(undefined, message.text, message)}>Not sent · retry</button>}
  </article>;
  const needsAccount = Boolean(data && !data.user.handle && panel && accountViews.has(panel));
  useEffect(() => { if (needsAccount && panel) { setAfterAccount({ panel, context: panelContext, space: panelSpace }); setPanel('account'); setPanelContext({}); setAccountMode('register'); } }, [needsAccount, panel]);
  const panelTitle = needsAccount ? 'Create an account' : panel === 'account' ? data?.user.handle ? 'Profile' : 'Create an account' : panel ? surfaceTitles[panel] : '';
  const panelContent = panel ? (panel === 'settings' ? <nav className="settings-menu" aria-label="Settings">
        <button onClick={() => navigatePanel('account')}><UserCircle size={23} />{data?.user.handle ? 'Profile' : 'Account & profile'}</button>
        <button onClick={() => navigatePanel('credits')}><CreditCard size={23} />Billing</button>
        <button onClick={() => navigatePanel('connections')}><Plugs size={23} />Connected agents</button>
        <button onClick={() => navigatePanel('notifications')}><Bell size={23} />Notifications</button>
        <button onClick={() => navigatePanel('blocked')}><Shield size={23} />Blocked people</button>
        <button onClick={() => navigatePanel('storage')}><HardDrives size={23} />Storage</button>
        <a href="https://fuckingdonate.co/@cyrus" target="_blank" rel="noopener noreferrer"><Heart size={23} />Fucking donate</a>
        {data?.user.handle && <button onClick={() => { void post('/account/logout').then(() => location.reload()).catch(error => logError(errorText(error))); }}><SignOut size={23} />Log out</button>}
        <p className="settings-credit"><a href="https://freshman.dev" target="_blank" rel="noopener noreferrer">Made by Cyrus Freshman</a></p>
      </nav> : !data ? <p>Connecting…</p> : panel === 'credits' ? <Credits data={data} onAccount={() => navigatePanel('account')} onConnect={() => navigatePanel('connections')} />
        : panel === 'account' || needsAccount ? <Account data={data} initialMode={accountMode} onboarding={Boolean(afterAccount)} refresh={refresh} close={() => void closePanel()} saved={() => void accountSaved()} />
          : panel === 'person' ? <PersonPanel personId={panelContext.resourceId || ''} user={data.user} navigate={navigate} />
            : panel === 'location' ? <LocationPanel user={data.user} areaCell={panelContext.areaCell} saved={async () => { await refresh(); if (surface) await closePanel(true); else if (panelHistory.length) backPanel(); else await closePanel(); }} />
              : panel === 'people' ? <PeoplePanel user={data.user} {...panelContext} initialQuery={panelContext.query} initialScope={panelContext.scope} navigate={navigate} />
                : panel === 'feed' ? <FeedPanel user={data.user} {...panelContext} initialQuery={panelContext.query} initialScope={panelContext.scope} navigate={navigate} />
                  : panel === 'post_list' ? <SelectedPostsPanel user={data.user} postIds={panelContext.postIds||[]} navigate={navigate}/>
                  : panel === 'post' ? <PostPanel user={data.user} postId={panelContext.resourceId || ''} navigate={navigate} />
                    : panel === 'messages' ? <MessagesPanel userId={data.user.id} connectionId={panelContext.resourceId} navigate={navigate} />
                      : panel === 'blocked' ? <BlockedPanel />
                      : panel === 'storage' ? <StoragePanel />
                      : panel === 'notifications' ? <NotificationsPanel state={data.notifications} navigate={navigate} />
                        : panel === 'uploads' ? <UploadPanel requestId={surface?.view === 'uploads' ? surface.id : undefined} submit={async files => { if (surface?.view === 'uploads') await closePanel(true, files.map(file => file.id)); else { setAttachments(files); await closePanel(); } }} />
                        : panel === 'connections' ? <Connections registered={Boolean(data.user.handle)} onAccount={() => navigatePanel('account')} /> : null) : null;
  if (panelSpace === 'composer') lastComposer.current = { panel, context: panelContext, history: panelHistory, title: panelTitle, content: panelContent, open: launcherOpen, reset: panelReset };
  const composerScreen = panelSpace === 'composer' ? lastComposer.current : underlay || lastComposer.current;
  const screenKey=(screen:{panel:Panel;context:Omit<Destination,'view'>})=>JSON.stringify([screen.panel,screen.context]);
  return <NavigationContext.Provider value={navigate}><div className="app" style={style} ref={page} onKeyDown={event => { if (event.key === 'Escape' && launcherOpen && !event.defaultPrevented) { event.preventDefault(); void closePanel(); } }}>
    <div className="atmosphere" aria-hidden="true" /><div className="grain" aria-hidden="true" />
    {data && <><main className="workspace">
      <div className="conversation" data-fade-top={scroll.fadedTop || undefined} ref={scroll.transcript} role="log" aria-label="Your conversation" aria-live="polite" aria-relevant="additions text" onScroll={scroll.onScroll}>
        <div className="conversation-content" ref={scroll.content}>
          {messages.filter(m => m.text || m.files?.length).map(bubble)}
          {busy && <AgentLiveMessage run={run} />}
          {run && <RunProgress run={run} refresh={refresh} open={() => openRunSurface(run)} />}
          {busy && <button className="stop-run" aria-label="Stop reply" onClick={() => { if (run) void post(`/runs/${run.id}/cancel`).then(refresh).catch(e => logError(errorText(e))); }}><Stop size={12} weight="fill" />Stop</button>}
        </div>
      </div>
      <div className="composer-area" ref={composer}>
        <ComposerPanel open={launcherOpen} sideBySide={sideBySide} obscured={Boolean(panel && panelSpace === 'modal')} dragging={launcherDrag.dragging} extentKey={`${style['--chat-y' as keyof typeof style]}:${style['--viewport-top' as keyof typeof style]}`} contentKey={composerScreen?screenKey(composerScreen):'launcher'} input={<form className={`composer ${dictation.listening ? 'is-listening' : ''} ${attachments.length ? 'has-files' : ''}`} ref={inputForm} onSubmit={send}>
          <label htmlFor="thought" className="sr-only">Message your agent</label>
          <textarea id="thought" ref={textarea} value={draft} maxLength={6000} rows={2} enterKeyHint="send" onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
          {attachments.length > 0 && <div className="composer-files">{attachments.map(file => <button type="button" key={file.id} aria-label={`Remove ${file.name}`} onClick={() => setAttachments(previous => previous.filter(candidate => candidate.id !== file.id))}>{file.name}<X size={14} aria-hidden="true" /></button>)}</div>}
          {(draft.trim() || attachments.length > 0) && !dictation.active && <button className="send" type="submit" disabled={busy || !data} aria-label="Send message"><ArrowUp size={19} weight="bold" /></button>}
        </form>}><PreservedPanels key={data.user.id} activeKey={composerScreen?screenKey(composerScreen):'launcher'} ancestorKeys={composerScreen?.history.map(screenKey)||[]} reset={composerScreen?.reset||0}>{composerScreen?.panel ? <section className="composer-surface" aria-label={composerScreen.title}><header className="composer-surface-header"><button type="button" className="close" aria-label="Back" onClick={backPanel}><ArrowLeft size={21} /></button><h2>{composerScreen.title}</h2></header><div className="composer-surface-content" key={`${composerScreen.panel}:${composerScreen.context.resourceId || ''}:${composerScreen.reset}`}><div className="composer-surface-body">{composerScreen.content}</div></div><footer className="composer-surface-footer"><button type="button" className="close" aria-label="Back" onClick={backPanel}><ArrowLeft size={21} /></button><h2>{composerScreen.title}</h2></footer></section> : <nav className="launcher-menu" aria-label="New Drugs"><button onClick={() => open('people', {}, 'composer')}><Users size={24} />People nearby</button><button onClick={() => open('feed', {}, 'composer')}><Article size={24} />Posts</button><button onClick={() => open('messages', {}, 'composer')}><ChatCircle size={24} />Messages &amp; invites</button><button onClick={() => open('uploads', {}, 'composer')}><Paperclip size={24} />Attach files</button></nav>}</PreservedPanels></ComposerPanel>
        <div className="composer-controls"><div className="launcher-controls"><button type="button" className={`launcher-button ${launcherDrag.dragging ? 'dragging' : ''}`} {...launcherDrag.handlers} aria-label={launcherOpen ? 'Close launcher' : 'Open New Drugs'} aria-expanded={launcherOpen} onClick={() => launcherDrag.click(() => { dictation.stop(); if (launcherOpen) void closePanel(); else { if (lastComposer.current) { setPanel(lastComposer.current.panel); setPanelContext(lastComposer.current.context); setPanelHistory(lastComposer.current.history); } else { setPanel(null); setPanelHistory([]); } setPanelSpace('composer'); setLauncherOpen(true); } })}>{launcherOpen ? <X size={24} /> : <SquaresFour size={24} />}</button>{launcherOpen && composerScreen?.panel && <button type="button" className="launcher-button reset-panel" aria-label="Reset launcher" title="Return to launcher options and clear this view" onClick={() => { setPanel(null); setPanelContext({}); setPanelHistory([]); setPanelReset(value => value + 1); }}><ArrowClockwise size={22} /></button>}</div>
        <div className="dictation-slot"><Orb hideIcon={inputOccupied || Boolean(draft.trim())} active={dictation.active && !inputOccupied} listening={dictation.listening} finishing={dictation.finishing} canSend={Boolean(draft.trim()) && Boolean(data)} busy={busy}
          onTap={() => { if (!inputOccupied) dictation.start(); }} onCancel={dictation.cancel} onSend={() => { void dictation.finish().then(text => { void send(undefined, text); }); }} {...dragHandlers} /></div></div>
        <span id="orb-hint" className="sr-only">{dictation.active ? 'Cancel on the left or send on the right. Either clears the draft.' : dragHandlers.draggable ? 'Tap to dictate. Drag to move chat, or use arrow keys while focused.' : 'Tap to dictate.'}</span>
      </div>
    </main>
    <div className="settings-controls"><span className="app-version">v{data.config.version || release.version}</span><button className="settings-button" aria-label={`${data.notifications?.unread && panel !== 'notifications' ? `Notifications, ${data.notifications.unread} updates` : 'Settings'}, ${balanceLabel(data.wallet.balanceNanos)} credit balance`} onClick={() => open(data.notifications?.unread && panel !== 'notifications' ? 'notifications' : 'settings', {}, 'modal')}><span>{balanceLabel(data.wallet.balanceNanos)}</span>{data.notifications?.unread && panel !== 'notifications' ? <><Bell size={22} /><span className="notification-count" aria-hidden="true">{data.notifications.unread > 9 ? '9+' : data.notifications.unread}</span></> : <GearSix size={22} />}</button></div></>}
    {panel && panelSpace === 'modal' && <Dialog placement={['settings', 'account', 'credits', 'connections', 'blocked', 'storage', 'notifications'].includes(panel) ? 'settings' : 'task'} title={panelTitle} close={() => void closePanel()} back={panelHistory.length ? backPanel : undefined}>
      {panelContent}
    </Dialog>}
  </div></NavigationContext.Provider>;
}
