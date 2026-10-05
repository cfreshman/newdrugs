import {avatarImageUrl} from './logImageCache';
import { PushSettings } from './PushSettings';
import {useEffect,useRef,useState} from 'react';
import type { NotificationState } from '../shared/notifications';
import { parseDestination, type Destination } from '../shared/navigation';
import {operation,errorText} from './api';
import {plainLinkClick} from './NavLink';
export function NotificationsPanel({ state, navigate, userId, refresh }: { state?: NotificationState; userId?: string; navigate(destination: Destination): void; refresh?:()=>Promise<void> }) {
  const [older,setOlder]=useState<NotificationState['items']>([]),[cursor,setCursor]=useState(state?.nextCursor),[busy,setBusy]=useState(false),[marking,setMarking]=useState(false),[markedItems,setMarkedItems]=useState<Map<string,string>>(()=>new Map()),[error,setError]=useState('');
  const generation=useRef(0);
  useEffect(()=>{generation.current++;setOlder([]);setCursor(state?.nextCursor);setBusy(false);setMarkedItems(new Map());setError('');},[userId]);
  useEffect(()=>{if(!older.length)setCursor(state?.nextCursor);},[state?.nextCursor,older.length]);
  const more=async()=>{if(!cursor||busy)return;const ticket=generation.current;setBusy(true);try{const page=await operation<NotificationState>('notifications.list',{before:cursor});if(ticket===generation.current){setOlder(previous=>[...new Map([...previous,...page.items].map(item=>[item.id,item])).values()]);setCursor(page.nextCursor);}}catch(error){console.error('Notification history:',error);}finally{if(ticket===generation.current)setBusy(false);}};
  const items=[...new Map([...older,...(state?.items||[])].map(item=>[item.id,item])).values()].map(item=>markedItems.get(item.id)===item.createdAt?{...item,read:true}:item).sort((a,b)=>Number(a.read)-Number(b.read)||b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
  const hasUnread=items.some(item=>!item.read&&item.kind!=='review')||Boolean(state?.unreadCapped);
  const markAll=async()=>{if(marking)return;setMarking(true);setError('');try{await operation<{read:true;readAt:string}>('notifications.read_all');setMarkedItems(previous=>new Map([...previous,...items.filter(item=>item.kind!=='review').map(item=>[item.id,item.createdAt] as const)]));const current=await operation<NotificationState>('notifications.list').catch(cause=>{console.error('Notification history refresh:',cause);return null;});if(current)setCursor(current.nextCursor);await refresh?.().catch(cause=>console.error('Notification refresh:',cause));}catch(cause){setError(errorText(cause));}finally{setMarking(false);}};
  return <>{hasUnread&&<div className="notification-toolbar"><button className="text-link" type="button" disabled={marking} onClick={()=>void markAll()}>{marking?'Marking…':'Mark all read'}</button></div>}{error&&<p className="error" role="alert">{error}</p>}{userId && <PushSettings key={userId} userId={userId} />}<div className="notification-list">{items.map(item => <a href={item.link.url} key={item.id} data-read={item.read || undefined} onClick={event => {
    if(!plainLinkClick(event))return;event.preventDefault();
    const destination = parseDestination(item.link.url, location.origin);
    if (destination) { navigate(destination); if (!item.read) void operation('notifications.read', { notificationId: item.id }).catch(error => console.error('Notification read:', error)); }
  }}>{item.photoId?<span className="notification-person"><img src={avatarImageUrl(item.photoId)} alt=""/><strong>{item.title}</strong></span>:<strong>{item.title}</strong>}{item.text && <span>{item.text}</span>}<small className="notification-meta"><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time><span>{item.read ? 'Read' : 'Unread'}</span></small></a>)}</div>
    {!items.length&&!cursor && <p className="quiet">No notifications yet.</p>}
    {cursor&&<button className="more-messages" disabled={busy} onClick={()=>void more()}>{busy?'Loading...':'More notifications'}</button>}
  </>;
}
