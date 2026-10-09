import {TransientError} from './TransientError';
import {PersonPhoto} from './PersonPhoto';
import {avatarImageUrl} from './logImageCache';
import {scrollFromPanelHeader} from './panelHeaderScroll';
import {ConversationHeader} from './ConversationHeader';
import {LocationLabel} from './LocationLabel';
import { DotsThree } from '@phosphor-icons/react';
import { ContentReport } from './PeopleSafety';
import { Fragment,useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import type { Profile } from '../shared/types';
import type { CoarseArea } from '../shared/geo';
import type { Destination } from '../shared/navigation';
import { RadiusSelect } from './RadiusSelect';
import { SearchField } from './SearchField';
import type { SearchRetrieval } from '../shared/search';
import { api,post,operation, errorText } from './api';
import { LocationPicker } from './LocationPicker';
import { LinkedText } from './LinkedText';
import { VideoCamera, ArrowUp, ArrowDown } from '@phosphor-icons/react';
import { usePanelLoading, usePanelVisible } from './PanelReadiness';
import { useMessagePlacement } from './useMessagePlacement';
import { CollapsibleMessage } from './CollapsibleMessage';
import { useRecordRefresh } from './useRecordRefresh';
import { captureHistoryAnchor, restoreHistoryAnchor, OlderMessages, useTopPagination } from './ChatHistory';
import {directMessageLayout,directMessageTimeLabel,inboxTimeLabel} from './directMessageGrouping';
import type {CallPage,CallRecord} from '../shared/calling';
import type {DMSearchResult} from '../shared/dmSearch';
import {useCall} from './CallProvider';
import './calling.css';
import {NavLink} from './NavLink';
import {LinkPreviews} from './LinkPreview';

interface Page<T> { items: T[]; nextCursor: string | null }
type ExplorePerson=Profile & {undoHidden?:boolean};
const mutualLine=(person:Profile)=>{const count=person.mutualCount||0,names=person.mutualFriends||[];return `${count} mutual ${count===1?'friend':'friends'}${names.length?`: ${names.map(friend=>friend.name).join(', ')}${count>names.length?` +${count-names.length} more`:''}`:''}`;};
interface Connection { initialInvitation?:{fromId:string;note:string;createdAt:string}; disconnectedBy?:string; updatedAt?:string; createdAt: string; id: string; members: string[]; fromId: string; toId: string; note: string; status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'disconnected'; unread?: boolean; lastMessage?: { text: string; fromId: string; createdAt: string } }
interface DirectMessage { id: string; fromId: string; text: string; createdAt: string; pending?: boolean; failed?: boolean; key?: string; clientId?: string }
function callDuration(call:CallRecord){if(!call.joinedAt||!call.endedAt)return '';const seconds=Math.max(0,Math.floor((Date.parse(call.endedAt)-Date.parse(call.joinedAt))/1000));if(!Number.isFinite(seconds))return '';const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60),remainder=seconds%60;return `Called for ${hours?`${hours}h `:''}${minutes?`${minutes}m `:''}${!hours||!minutes?`${remainder}s`:''}`.trim();}
type Navigate = (destination: Destination) => void;
function MessageAvatar({person}:{person?:Profile}){
 const name=person?.name||person?.handle||'?';
 return <span className="message-avatar" aria-hidden="true">{person?.photos?.[0]?<img src={avatarImageUrl(person.photos[0])} alt=""/>:name.replace(/^@/,'').slice(0,1).toUpperCase()}</span>;
}
function MessageName({person}:{person?:Profile}){
 return <span className="message-person-name"><strong>{person?.name||person?.handle||'Member'}</strong>{person?.name&&person.handle&&<span className="quiet">@{person.handle}</span>}</span>;
}


export function LocationPanel({ user, areaCell, saved }: { user: Profile; areaCell?: string; saved(): Promise<void> }) {
  const [area, setArea] = useState<CoarseArea | null>(user.area || null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { let cancelled = false; if (areaCell && areaCell !== user.area?.cell) void operation<CoarseArea>('locations.resolve', { cell: areaCell }).then(value => { if (!cancelled) setArea(value); }).catch(error => { if (!cancelled) setError(errorText(error)); }); return () => { cancelled = true; }; }, [areaCell]);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await operation('profile.update', { locationCell: area?.cell || null }); await saved(); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  };
  return <form className="fields" onSubmit={save}><LocationPicker value={area} onChange={setArea} /><button className="solid" disabled={busy}>{busy ? 'Saving…' : 'Save area'}</button>{error && <TransientError className="error" role="alert">{error}</TransientError>}</form>;
}

export function PeoplePanel({ user, areaCell, radiusMiles = 25, initialQuery = '', initialScope, onStateChange, navigate }: { user: Profile; areaCell?: string; radiusMiles?: number; initialQuery?:string; initialScope?:Destination['scope']; onStateChange?(context:Partial<Destination>):void; navigate: Navigate }) {
  const [people, setPeople] = useState<(Page<ExplorePerson> & {retrieval?:SearchRetrieval;indexing?:boolean}) | null>(null), [error, setError] = useState('');
  const [query,setQuery]=useState(initialQuery ?? ''), [radius,setRadius]=useState(typeof radiusMiles === 'number' && Number.isFinite(radiusMiles) && radiusMiles >= 10 && radiusMiles <= 250 ? radiusMiles : 25), [scope,setScope]=useState<'all'|'nearby'|'circle'>(initialScope==='all'||initialScope==='circle'?initialScope:areaCell || user.area ? 'nearby' : 'all'); const requestId=useRef(0);
  const [friendFor,setFriendFor]=useState<string|null>(null),[friendNote,setFriendNote]=useState(''),[personBusy,setPersonBusy]=useState<string|null>(null),[actionError,setActionError]=useState<{id:string;text:string}|null>(null);
  const undoCards=useRef(new Map<string,{index:number;person:ExplorePerson}>());
  useEffect(()=>{setQuery(initialQuery||'');setRadius(radiusMiles);setScope(initialScope==='all'||initialScope==='circle'?initialScope:initialScope==='nearby'||areaCell||user.area?'nearby':'all');},[initialQuery,initialScope,radiusMiles,areaCell]);
  const change=(context:Partial<Destination>)=>onStateChange?.({query,scope,radiusMiles:radius,...context});
  const near = areaCell || user.area?.cell;
  usePanelLoading((scope!=='nearby'||Boolean(near)) && !people && !error);
  const load = useCallback(async (before?: string) => {
    if (scope==='nearby' && !near) return;
    const request=++requestId.current;
    try { const page = await operation<Page<Profile>>('people.search', { scope, ...(scope==='nearby'?{near,radiusMiles:radius ?? 25}:{}), ...(query?{query}:{}), ...(before ? { before } : {}) }); if(request!==requestId.current)return; setPeople(previous => {const items:ExplorePerson[]=before&&previous?[...previous.items,...page.items]:[...page.items];for(const {index,person} of [...undoCards.current.values()].sort((a,b)=>a.index-b.index))if(!items.some(item=>item.id===person.id))items.splice(Math.min(index,items.length),0,person);return {...page,items};}); setError(''); }
    catch (error) { setError(errorText(error)); }
  }, [near, radius, query, scope]);
  useEffect(() => { undoCards.current.clear();setPeople(null); void load(); }, [load]);
  useRecordRefresh(['people'], load);
  const hide=async(person:ExplorePerson)=>{if(personBusy)return;setPersonBusy(person.id);setActionError(null);try{await operation('people.hide',{personId:person.id,hidden:!person.hidden});if(!person.hidden){const index=Math.max(0,people?.items.findIndex(item=>item.id===person.id)||0),placeholder={...person,hidden:true,undoHidden:true};undoCards.current.set(person.id,{index,person:placeholder});setPeople(previous=>{if(!previous)return previous;const items=previous.items.filter(item=>item.id!==person.id);items.splice(Math.min(index,items.length),0,placeholder);return {...previous,items};});}else{undoCards.current.delete(person.id);setPeople(previous=>previous?{...previous,items:person.undoHidden?previous.items.map(item=>item.id===person.id?{...person,hidden:false,undoHidden:false}:item):previous.items.filter(item=>item.id!==person.id)}:previous);if(person.undoHidden)void load();}if(friendFor===person.id){setFriendFor(null);setFriendNote('');}}catch(cause){setActionError({id:person.id,text:errorText(cause)});}finally{setPersonBusy(null);}};
  const friend=async(person:Profile)=>{if(personBusy)return;if(person.friendAction==='invite'){setFriendFor(person.id);setFriendNote('');setActionError(null);return;}if(person.friendAction!=='accept'||!person.connectionId)return;setPersonBusy(person.id);setActionError(null);try{await operation('connections.respond',{connectionId:person.connectionId,accept:true},{confirmed:true});setPeople(previous=>previous?{...previous,items:previous.items.map(item=>item.id===person.id?{...item,friendAction:'friend'}:item)}:previous);}catch(cause){setActionError({id:person.id,text:errorText(cause)});}finally{setPersonBusy(null);}};
  const sendInvite=async(person:Profile)=>{if(personBusy||!friendNote.trim())return;setPersonBusy(person.id);setActionError(null);try{const result=await operation<{id:string;status:string}>('connections.request',{personId:person.id,note:friendNote.trim()},{confirmed:true});setPeople(previous=>previous?{...previous,items:previous.items.map(item=>item.id===person.id?{...item,friendAction:result.status==='accepted'?'friend':'invited',connectionId:result.id}:item)}:previous);setFriendFor(null);setFriendNote('');}catch(cause){setActionError({id:person.id,text:errorText(cause)});}finally{setPersonBusy(null);}};
  return <>
    <SearchField label="Search people by interests" value={query} onSearch={value => { if (value === query) void load(); else {setQuery(value);change({query:value});} }}/>
    <nav className="view-tabs" aria-label="People filter"><button aria-pressed={scope==='nearby'} onClick={()=>{setScope('nearby');change({scope:'nearby'});}}>Nearby</button><button aria-pressed={scope==='all'} onClick={()=>{setScope('all');change({scope:'all'});}}>All people</button><button aria-pressed={scope==='circle'} onClick={()=>{setScope('circle');change({scope:'circle'});}}>Circle</button></nav>
    {scope==='nearby' && <div className="search-area-controls"><NavLink className="text-link" to={{view:'location'}} navigate={navigate}>{near ? user.area?.cell===near ? <LocationLabel label={user.area.label}/> : 'Change area' : 'Choose your area'}</NavLink>{near && <RadiusSelect value={radius} onChange={value=>{setRadius(value);change({radiusMiles:value});}}/>}</div>}
    {people?.retrieval?.notices.map(notice=><p className="quiet small" key={notice}>{notice}</p>)}
    {people && !people.items.length && !people.nextCursor && <p className="quiet">{scope==='circle'&&people.indexing?'Updating Circle...':query ? 'No matching profiles found.' : scope==='nearby' ? 'No shared profiles found in this area yet.' : scope==='circle'?'No people with mutual friends yet.':'No shared profiles yet.'}</p>}
    <div className="people-list">{people?.items.map(person => person.undoHidden?<article className="person-result person-hide-undo" key={person.id}><span><strong>Hidden</strong>{actionError?.id===person.id&&<TransientError as="small" className="error" role="alert">{actionError.text}</TransientError>}</span><button type="button" className="text-action" disabled={Boolean(personBusy)} onClick={()=>void hide(person)}>Undo</button></article>:<article className="person-result" key={person.id}>
      {person.discoverable?<NavLink className="person-result-main" to={{view:'person',resourceId:person.id}} navigate={navigate}><PersonPhoto photoId={person.photos?.[0]} name={person.name||person.handle||'Member'}/><span><strong>{person.name || `@${person.handle}`}</strong><span className="quiet small">{person.handle && <><span className="person-handle">@{person.handle}</span>{' · '}</>}<LocationLabel label={person.area?.label}/></span>{person.bio && <span className="person-excerpt">{person.bio}</span>}{Boolean(person.mutualCount)&&<span className="person-mutual quiet small"><span className="person-mutual-avatars" aria-hidden="true">{person.mutualFriends?.map(friend=><span key={friend.id}>{friend.photoId?<img src={avatarImageUrl(friend.photoId)} alt=""/>:friend.name.replace(/^@/,'').slice(0,1).toUpperCase()}</span>)}</span><span>{mutualLine(person)}</span></span>}</span></NavLink>:<div className="person-result-main"><PersonPhoto name={person.name||person.handle||'Member'}/><span><strong>{person.name}</strong></span></div>}
      {person.discoverable&&person.mediaUrl&&<div className="person-card-media"><LinkPreviews text="" links={[person.mediaUrl]}/></div>}
      {friendFor!==person.id&&<div className="person-card-actions">{(person.hidden||person.friendAction!=='friend')&&<button type="button" className="text-action" disabled={Boolean(personBusy)} onClick={()=>void hide(person)}>{person.hidden?'Unhide':'Hide'}</button>}{person.discoverable&&person.friendAction&&<button type="button" className="solid" disabled={Boolean(personBusy)||['invited','friend','unavailable'].includes(person.friendAction)} onClick={()=>void friend(person)}>{person.friendAction==='invite'?'Add friend':person.friendAction==='accept'?'Accept':person.friendAction==='invited'?'Invited':person.friendAction==='friend'?'Friends':'Unavailable'}</button>}</div>}
      {friendFor===person.id&&<form className="fields person-card-invite" onSubmit={event=>{event.preventDefault();void sendInvite(person);}}><label>Invitation note<textarea value={friendNote} maxLength={500} rows={2} onChange={event=>setFriendNote(event.target.value)}/></label><button className="solid" disabled={Boolean(personBusy)||!friendNote.trim()}>Send invitation</button><button type="button" className="text-action" onClick={()=>{setFriendFor(null);setFriendNote('');}}>Cancel</button></form>}
      {actionError?.id===person.id&&<TransientError className="error" role="alert">{actionError.text}</TransientError>}
    </article>)}</div>
    {people?.nextCursor && <button className="text-link" onClick={() => void load(people.nextCursor!)}>More people</button>}
    {error && <TransientError className="error">{error}</TransientError>}
  </>;
}

export function MessagesPanel({ userId, connectionId, messageId, initialQuery = '', onStateChange, navigate }: { userId: string; connectionId?: string; messageId?:string; initialQuery?:string; onStateChange?(context:Partial<Destination>):void; navigate: Navigate }) {
  const visible = usePanelVisible();
  const callControl=useCall();
  const [inbox, setInbox] = useState<(Page<Connection> & { people: Profile[] }) | null>(null), [messages, setMessages] = useState<Page<DirectMessage> | null>(null);
  const [bffs,setBffs]=useState<{id:string;name:string;handle?:string;photoId?:string;connectionId:string}[]>([]);
  const [current, setCurrent] = useState<{ connection: Connection; people: Profile[] } | null>(null);
  const [calls,setCalls]=useState<CallPage|null>(null);
  const callBusy=Boolean(callControl?.busy);
  const activeCall=callControl?.call&&callControl.call.connectionId===connectionId?callControl.call:calls?.active;
  const [reconnectNote,setReconnectNote]=useState('');
  const [reporting,setReporting]=useState<string|null>(null),[choosingReport,setChoosingReport]=useState(false);
  const [filter, setFilter] = useState<'all' | 'invites'>('all');
  const [query,setQuery]=useState(initialQuery),[searchRevision,setSearchRevision]=useState(0),[searchResult,setSearchResult]=useState<DMSearchResult|null>(null),[searchBusy,setSearchBusy]=useState(false),[searchError,setSearchError]=useState('');
  const [newerCursor,setNewerCursor]=useState<string|null>(null),[loadingNewer,setLoadingNewer]=useState(false);
  const [text, setText] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [awayFromBottom,setAwayFromBottom]=useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false), [olderError, setOlderError] = useState('');
  const olderRequest = useRef<string | null>(null), prependAnchor = useRef<ReturnType<typeof captureHistoryAnchor> | null>(null), isVisible = useRef(visible); isVisible.current = visible;
  const generation = useRef(0), searchGeneration=useRef(0), scroller = useRef<HTMLDivElement>(null), following = useRef(true), readThrough = useRef(''),jumpedTo=useRef(''),lastConnection=useRef(connectionId),windowCursorInitialized=useRef(false);
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
  useEffect(()=>{setQuery(initialQuery||'');},[initialQuery]);
  useEffect(()=>{const request=++searchGeneration.current;if(!query.trim()){setSearchResult(null);setSearchBusy(false);setSearchError('');return;}setSearchResult(null);setSearchBusy(true);setSearchError('');void operation<DMSearchResult>('messages.search',{query,limit:20}).then(result=>{if(request===searchGeneration.current)setSearchResult(result);}).catch(error=>{if(request===searchGeneration.current)setSearchError(errorText(error));}).finally(()=>{if(request===searchGeneration.current)setSearchBusy(false);});return()=>{searchGeneration.current++;};},[query,searchRevision]);
  const moreSearch=async()=>{if(!searchResult?.nextCursor||searchBusy)return;const request=++searchGeneration.current;setSearchBusy(true);try{const page=await operation<DMSearchResult>('messages.search',{query,limit:20,cursor:searchResult.nextCursor});if(request===searchGeneration.current)setSearchResult(previous=>previous?{...page,items:[...previous.items,...page.items]}:page);}catch(error){if(request===searchGeneration.current)setSearchError(errorText(error));}finally{if(request===searchGeneration.current)setSearchBusy(false);}};
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      if (connectionId) {
        const window=messageId?await operation<{connection:Connection;people:Profile[];items:DirectMessage[];targetId:string;olderCursor:string|null;newerCursor:string|null}>('messages.window',{messageId}):null;
        if(window&&window.connection.id!==connectionId)throw Error('This message belongs to another conversation.');
        const relationship = window||await operation<{ connection: Connection; people: Profile[] }>('connections.get', { connectionId });
        const [page,history]=await Promise.all([window?Promise.resolve({items:[...window.items].reverse(),nextCursor:window.olderCursor}):(relationship.connection.status === 'accepted' || relationship.connection.initialInvitation) ? operation<Page<DirectMessage>>('messages.list', { connectionId }) : Promise.resolve(null),api<CallPage>(`/calls/${encodeURIComponent(connectionId)}`)]);
        if (request !== generation.current) return;
        setCurrent(relationship);setCalls(history);
        if(!windowCursorInitialized.current){setNewerCursor(window?.newerCursor||null);windowCursorInitialized.current=true;}
        setMessages(previous => page ? { ...page, nextCursor: previous && previous.items.length > page.items.length ? previous.nextCursor : page.nextCursor, items: merge(previous?.items || [], page.items) } : null);
      } else { const [inbox,bffPage] = await Promise.all([operation<Page<Connection> & { people: Profile[] }>('connections.list'),operation<{items:typeof bffs;nextCursor:string|null}>('people.bffs',{limit:6}).catch(cause=>{console.error('BFF conversations:',cause);return {items:[],nextCursor:null};})]); if (request === generation.current){setInbox(inbox);setBffs(bffPage.items);} }
      if (request === generation.current) setError('');
    } catch (error) { if (request === generation.current) { setError(errorText(error)); setCurrent(null); setMessages(null);setCalls(null); } }
  }, [connectionId,messageId]);
  useEffect(() => { const changed=lastConnection.current!==connectionId;lastConnection.current=connectionId;setMessages(null);setCalls(null); setReporting(null); setChoosingReport(false); setInbox(null); setCurrent(null);if(changed)setText(''); setLoadingOlder(false); setOlderError(''); setNewerCursor(null);windowCursorInitialized.current=false;setAwayFromBottom(false); prependAnchor.current = null; following.current = !messageId; jumpedTo.current='';readThrough.current = ''; pendingSend.current = null; void load(); return () => { generation.current++; }; }, [load]);
  useRecordRefresh(['connections', 'messages','calls'], load);
  useLayoutEffect(()=>{if(visible)readThrough.current='';},[visible,connectionId]);
  const callReadKey=calls?.items.map(call=>call.id).join(',')||'';
  const markRead = useCallback(() => {
    if (!visible || !connectionId || !current || document.hidden) return;
    const latest = messageId ? messages?.items.some(message=>message.id===messageId)?messageId:undefined : following.current ? messages?.items.find(message => !message.pending && !message.failed)?.id : undefined;
    const key=JSON.stringify([latest,current.connection.status,current.connection.updatedAt||current.connection.createdAt,callReadKey]);
    if (readThrough.current === key) return;
    readThrough.current = key;
    void operation('messages.mark_read', { connectionId, ...(latest ? { throughMessageId: latest } : {}) }).catch(error => { if(readThrough.current===key)readThrough.current = ''; console.error('Conversation read:', error); });
  }, [connectionId, messageId,current?.connection.status, current?.connection.updatedAt, current?.connection.createdAt, messages?.items[0]?.id, callReadKey, visible]);
  const rememberPosition=()=>{const node=scroller.current;if(visible&&node)setAwayFromBottom(node.scrollHeight-node.clientHeight-node.scrollTop>24);};
  const followLatest=()=>{if(messageId&&connectionId){navigate({view:'messages',resourceId:connectionId,messageId:undefined});return;}const node=scroller.current;if(!node)return;prependAnchor.current=null;following.current=true;node.scrollTop=node.scrollHeight;setAwayFromBottom(false);markRead();};
  useLayoutEffect(()=>{if(!visible||!messageId||jumpedTo.current===messageId||!messages?.items.some(message=>message.id===messageId)||!scroller.current)return;const node=scroller.current,target=[...node.querySelectorAll<HTMLElement>('[data-message-id]')].find(element=>element.dataset.messageId===messageId);if(!target)return;node.scrollTop+=target.getBoundingClientRect().top-node.getBoundingClientRect().top-12;jumpedTo.current=messageId;following.current=false;rememberPosition();},[visible,messageId,messages?.items.length]);
  useLayoutEffect(() => { if (!visible) return; if (following.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; rememberPosition();markRead(); }, [messages?.items.length, markRead, visible]);
  useEffect(() => { const restored=()=>{if(!document.hidden)readThrough.current='';markRead();};document.addEventListener('visibilitychange', restored); return () => document.removeEventListener('visibilitychange', restored); }, [markRead]);
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
  const newer=async()=>{if(!newerCursor||loadingNewer)return;const request=generation.current,cursor=newerCursor;setLoadingNewer(true);try{const page=await operation<{items:DirectMessage[];newerCursor:string|null;connection:Connection}>('messages.window',{messageId:cursor});if(request!==generation.current||page.connection.id!==connectionId)return;setNewerCursor(page.newerCursor);setMessages(previous=>previous&&({...previous,items:merge(previous.items,page.items)}));}catch(error){if(request===generation.current)setOlderError(errorText(error));}finally{if(request===generation.current)setLoadingNewer(false);}};
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
  const openCall=async(selected?:CallRecord)=>{
    if(!connectionId||callBusy||!callControl)return;setError('');
    try{
      const call=selected||activeCall;
      if(!call)await callControl.start(connectionId,other?.handle?`@${other.handle}`:other?.name||'your friend');
      else if(call.status==='waiting'&&call.calleeId===userId)await callControl.answer(call);
      else if(call.status==='connected')await callControl.open(call);
      void load();
    }catch(error){setError(errorText(error));}
  };
  const closeCall=async(call:CallRecord)=>{if(callBusy||!callControl)return;setError('');try{await callControl.end(call);await load();}catch(error){setError(errorText(error));}};
  const bffConnectionIds=new Set(bffs.map(person=>person.connectionId));
  const inboxItems=inbox?.items.filter(connection => (filter === 'all' || ['pending','declined','withdrawn'].includes(connection.status)) && (filter!=='all'||!bffConnectionIds.has(connection.id)));
  if (!connectionId) return <><SearchField label="Search messages" value={query} onSearch={value=>{if(value===query)setSearchRevision(previous=>previous+1);else setQuery(value);onStateChange?.({query:value});}}/>{query?<>
    {searchResult?.notices.map(notice=><p className="quiet small" key={notice}>{notice}</p>)}
    <div className="inbox-list dm-inbox-list">{searchResult?.items.map(item=><article className="dm-inbox-card" key={item.id}><NavLink className="dm-inbox-open" to={{view:'messages',resourceId:item.connectionId,messageId:item.id}} navigate={navigate}><span className="message-avatar" aria-hidden="true">{item.person.photoId?<img src={avatarImageUrl(item.person.photoId)} alt=""/>:(item.person.name||item.person.handle||'?').slice(0,1).toUpperCase()}</span><span className="dm-inbox-content"><span className="dm-inbox-heading"><span className="message-person-name"><strong>{item.person.name}</strong>{item.person.handle&&<span className="quiet">@{item.person.handle}</span>}</span><time dateTime={item.createdAt}>{inboxTimeLabel(item.createdAt)}</time></span><span className="dm-inbox-preview">{item.fromId===userId?'You: ':''}{item.text}</span></span></NavLink></article>)}</div>
    {searchBusy&&<p className="quiet">Searching…</p>}{searchResult&&!searchBusy&&!searchResult.items.length&&<p className="quiet">No matching messages.</p>}{searchResult?.nextCursor&&!searchBusy&&<button className="text-link" onClick={()=>void moreSearch()}>More messages</button>}{searchError&&<TransientError className="error" role="alert">{searchError}</TransientError>}</>:<><nav className="view-tabs" aria-label="Inbox filter"><button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button><button aria-pressed={filter === 'invites'} onClick={() => setFilter('invites')}>Invitations</button></nav>
    {filter==='all'&&bffs.length>0&&<div className="dm-bff-grid" aria-label="BFF conversations">{bffs.map(person=><NavLink className="dm-bff" key={person.id} to={{view:'messages',resourceId:person.connectionId}} navigate={navigate}><span className="dm-bff-avatar" aria-hidden="true">{person.photoId?<img src={avatarImageUrl(person.photoId)} alt=""/>:(person.name||person.handle||'?').slice(0,1).toUpperCase()}</span><span className="dm-bff-name">{person.name||`@${person.handle}`}</span></NavLink>)}</div>}<div className="inbox-list dm-inbox-list">{inboxItems?.map(connection => {
      const person = inbox?.people.find(person => person.id === connection.members.find(id => id !== userId));
      const invitation=connection.status==='pending',sent=(connection.lastMessage?.fromId||connection.fromId)===userId;
      const preview=invitation?`${connection.fromId===userId?'You: ':''}${connection.note}`:`${sent?'You: ':''}${connection.lastMessage?.text||connection.note}`;
      const at=connection.updatedAt||connection.lastMessage?.createdAt||connection.createdAt;
      return <article className={`dm-inbox-card${connection.unread?' is-unread':''}`} key={connection.id}>
        <NavLink className="dm-inbox-open" to={{view:'messages',resourceId:connection.id}} navigate={navigate}>
          <MessageAvatar person={person}/><span className="dm-inbox-content"><span className="dm-inbox-heading"><MessageName person={person}/><time dateTime={at} title={new Date(at).toLocaleString()}>{inboxTimeLabel(at)}</time>{connection.unread&&<span className="dm-unread"><span className="sr-only">Unread</span></span>}</span><span className={`dm-inbox-preview${invitation?' is-invitation':''}`}>{preview}</span></span>
        </NavLink>
        {connection.status!=='accepted'&&<div className="dm-inbox-footer">{connection.status === 'pending' && connection.toId === userId ? <div className="review-buttons button-row"><button className="text-action" disabled={busy} onClick={() => void respond(connection, false)}>Decline</button><button className="confirm" disabled={busy} onClick={() => void respond(connection, true)}>Accept invitation</button></div>
          : connection.status === 'pending' ? <><span className="quiet small">Invitation sent</span><button className="text-link small" disabled={busy} onClick={() => void withdraw(connection)}>Withdraw invitation</button></>
            : <span className="quiet small">{connection.status === 'disconnected' ? 'Connection ended' : connection.status === 'withdrawn' ? 'Invitation withdrawn' : 'Invitation declined'}</span>}</div>}
      </article>;
    })}</div>{inbox && !inboxItems?.length && !inbox.nextCursor && (filter!=='all'||!bffs.length) && <><p className="quiet">{filter==='invites'?'No invitations yet.':'No invitations or conversations yet.'}</p><NavLink className="text-link" to={{view:'people'}} navigate={navigate}>Find people nearby</NavLink></>}
    {inbox?.nextCursor && <button className="text-link" onClick={() => void moreConnections()}>More conversations</button>}{error && <TransientError className="error" role="alert">{error}</TransientError>}</>}</>;
  const other = current?.people.find(person => person.id !== userId);
  const chronologicalMessages=messages?[...messages.items].reverse():[],messageLayout=directMessageLayout(chronologicalMessages),layoutById=new Map(chronologicalMessages.map((message,index)=>[message.id,messageLayout[index]]));
  const visibleCalls=activeCall&&!calls?.items.some(call=>call.id===activeCall.id)?[activeCall,...(calls?.items||[])]:calls?.items||[];
  const timeline=[...chronologicalMessages.map(message=>({kind:'message' as const,id:message.id,createdAt:message.createdAt,message})),...visibleCalls.filter(call=>!messages?.nextCursor||!chronologicalMessages.length||call.createdAt>=chronologicalMessages[0].createdAt).map(call=>({kind:'call' as const,id:call.id,createdAt:call.createdAt,call}))].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
  const callLabel=activeCall?activeCall.status==='waiting'?activeCall.callerId===userId?'Calling':'Answer call':'Open call':'Video call';
  return <div className={messages ? 'message-view' : undefined}>{other && <ConversationHeader><div className="message-view-actions" onClick={event=>scrollFromPanelHeader(event,scroller.current)}><NavLink className="message-person" to={{view:'person',resourceId:other.id}} navigate={navigate}><MessageAvatar person={other}/><MessageName person={other}/></NavLink>{messages && current?.connection.status==='accepted' && <button type="button" className="call-start" aria-label={callLabel} disabled={callBusy||!callControl||activeCall?.status==='waiting'&&activeCall.callerId===userId} onClick={()=>void openCall()}><VideoCamera size={19}/><span className="call-start-label">{callLabel}</span></button>}{messages&&<details className="conversation-menu"><summary aria-label="Conversation actions"><DotsThree size={23}/></summary><div><button type="button" onClick={event=>{setChoosingReport(true);setReporting(null);event.currentTarget.closest('details')?.removeAttribute('open');}}>Report a message</button></div></details>}</div></ConversationHeader>}
    {current && ['pending','declined','withdrawn'].includes(current.connection.status) && <p>{current.connection.note}</p>}
    {current?.connection.status === 'pending' && <>{current.connection.toId === userId ? <div className="review-buttons button-row"><button className="text-action" disabled={busy} onClick={() => void respond(current.connection, false)}>Decline</button><button className="confirm" disabled={busy} onClick={() => void respond(current.connection, true)}>Accept invitation</button></div> : <><p className="quiet">Invitation sent. Messages open when they accept.</p><button className="text-link" disabled={busy} onClick={() => void withdraw(current.connection)}>Withdraw invitation</button></>}</>}
    {current&&['declined','withdrawn','disconnected'].includes(current.connection.status)&&<><p className="quiet">{current.connection.status==='disconnected'?'This connection has ended. Message history is read-only.':current.connection.status==='withdrawn'?'This invitation was withdrawn.':'This invitation was declined.'}</p><form className="fields" onSubmit={event=>{event.preventDefault();if(!reconnectNote.trim()||busy)return;setBusy(true);void operation('connections.request',{personId:current.connection.members.find(id=>id!==userId),note:reconnectNote.trim()},{confirmed:true}).then(()=>{setReconnectNote('');return load();}).catch(e=>setError(errorText(e))).finally(()=>setBusy(false));}}><label>New invitation<textarea value={reconnectNote} maxLength={500} onChange={event=>setReconnectNote(event.target.value)}/></label><button className="solid" disabled={busy||!reconnectNote.trim()}>Send invitation</button></form></>}
    {messages && <>{choosingReport&&<div className="message-report-choice"><span>Choose a message to report.</span><button onClick={()=>{setChoosingReport(false);setReporting(null);}}>Cancel</button></div>}<div className="direct-message-scroll"><div className="direct-messages" ref={scroller} onScroll={() => { if (!visible) return; const node = scroller.current!; following.current = !messageId&&!newerCursor&&node.scrollHeight - node.clientHeight - node.scrollTop <= 24; setAwayFromBottom(!following.current); markRead(); }}>
      <div className="direct-message-content" ref={content}><OlderMessages hasMore={Boolean(messages.nextCursor)} loading={loadingOlder} error={olderError} retry={() => void older()} />
      {!messages.nextCursor && (current?.connection.initialInvitation?.note || current?.connection.note) && <article className={`message invitation-message ${(current.connection.initialInvitation?.fromId || current.connection.fromId) === userId ? 'user' : 'peer'}`} data-invitation-id={current.connection.id}>
        <small className="invitation-meta">Invitation · <time dateTime={current.connection.initialInvitation?.createdAt || current.connection.createdAt}>{new Date(current.connection.initialInvitation?.createdAt || current.connection.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time></small>
        <div className="bubble"><CollapsibleMessage text={current.connection.initialInvitation?.note || current.connection.note} assistant={false} social scrollRef={scroller} /></div>
        <LinkPreviews text={current.connection.initialInvitation?.note || current.connection.note} simple/>
      </article>}
      {timeline.map(item=>{
        if(item.kind==='call'){
          const call=item.call,outgoing=call.callerId===userId,active=call.status!=='ended',name=other?.handle?`@${other.handle}`:other?.name||'your friend';
          const heading=call.status==='waiting'?outgoing?`Calling ${name}`:`${name} is calling`:call.status==='connected'?`In a call with ${name}`:`Video call with ${name}`;
          const detail=call.status==='waiting'?outgoing?`Waiting for ${name} to answer`:'Answer when you’re ready':call.status==='connected'?'Connected':call.joinedAt?callDuration(call):outgoing?'Call cancelled':'Missed call';
          return <article key={`call:${call.id}`} className={`message call-message ${outgoing?'user':'peer'}`} data-call-id={call.id}><div className="call-message-card"><VideoCamera size={22} aria-hidden="true"/><div><strong>{heading}</strong><span>{detail}</span></div>{active&&<div className="call-message-actions">{(call.status==='connected'||!outgoing)&&<button type="button" disabled={callBusy} onClick={()=>void openCall(call)}>{call.status==='waiting'?'Answer':'Open'}</button>}<button type="button" disabled={callBusy} onClick={()=>void closeCall(call)}>{call.status==='waiting'?outgoing?'Cancel':'Decline':'End'}</button></div>}</div></article>;
        }
        const message=item.message;
        const selectable=choosingReport&&message.fromId!==userId;
        const select=()=>{setReporting(message.id);setChoosingReport(false);};
        const layout=layoutById.get(message.id)!;
        return <Fragment key={message.clientId||message.id}>{layout.showTime&&<time className="message-time-separator" dateTime={message.createdAt}>{directMessageTimeLabel(message.createdAt)}</time>}<article className={`message ${message.fromId===userId?'user':'peer'} ${layout.groupWithPrevious?'dm-group-with-previous':''} ${layout.groupWithNext?'dm-group-with-next':''}`} data-message-id={message.pending||message.failed?`pending:${message.clientId||message.key}`:message.id} data-search-target={messageId===message.id||undefined} title={new Date(message.createdAt).toLocaleString()}>
          <div className={`bubble ${selectable?'report-target':''}`} role={selectable?'button':undefined} tabIndex={selectable?0:undefined} aria-label={selectable?`Report message: ${message.text}`:undefined}
            onClickCapture={selectable?event=>{event.preventDefault();event.stopPropagation();select();}:undefined}
            onKeyDownCapture={selectable?event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();select();}}:undefined}>
            <CollapsibleMessage text={message.text} assistant={false} social scrollRef={scroller}/>
          </div>
          {!message.failed&&<LinkPreviews text={message.text} simple/>}
          {reporting===message.id&&<ContentReport personId={message.fromId} messageId={message.id} close={()=>setReporting(null)}/>}
          {message.failed&&<button className="retry-message" disabled={busy} onClick={()=>void send(undefined,message)}>Not sent · retry</button>}
        </article></Fragment>;
      })}{newerCursor&&<button className="text-link dm-newer" disabled={loadingNewer} onClick={()=>void newer()}>{loadingNewer?'Loading…':'Newer messages'}</button>}</div>
    </div>{(awayFromBottom||messageId)&&<button className="latest-chat latest-dm" type="button" aria-label="Latest messages" title="Latest messages" onClick={followLatest}><ArrowDown size={22} weight="bold"/></button>}</div>{current?.connection.status==='accepted'&&<form className="message-compose" ref={composer} onSubmit={send}><label className="sr-only" htmlFor="direct-message">Message</label><textarea id="direct-message" ref={input} value={text} maxLength={2000} rows={2} onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(event); } }} /><button className="solid" aria-label="Send direct message" disabled={busy || !text.trim()}><ArrowUp size={20} weight="bold" /></button></form>}</>}{error && <TransientError className="error" role="alert">{error}</TransientError>}</div>;
}
