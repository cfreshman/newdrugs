import { PushSettings } from './PushSettings';
import {useEffect,useRef,useState} from 'react';
import type { NotificationState } from '../shared/notifications';
import { parseDestination, type Destination } from '../shared/navigation';
import { operation } from './api';
import {plainLinkClick} from './NavLink';
export function NotificationsPanel({ state, navigate, userId }: { state?: NotificationState; userId?: string; navigate(destination: Destination): void }) {
  const [older,setOlder]=useState<NotificationState['items']>([]),[cursor,setCursor]=useState(state?.nextCursor),[busy,setBusy]=useState(false);
  const generation=useRef(0);
  useEffect(()=>{generation.current++;setOlder([]);setCursor(state?.nextCursor);setBusy(false);},[state,userId]);
  const more=async()=>{if(!cursor||busy)return;const ticket=generation.current;setBusy(true);try{const page=await operation<NotificationState>('notifications.list',{before:cursor});if(ticket===generation.current){setOlder(previous=>[...new Map([...previous,...page.items].map(item=>[item.id,item])).values()]);setCursor(page.nextCursor);}}catch(error){console.error('Notification history:',error);}finally{if(ticket===generation.current)setBusy(false);}};
  const items=[...new Map([...older,...(state?.items||[])].map(item=>[item.id,item])).values()].sort((a,b)=>Number(a.read)-Number(b.read)||b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
  return <>{userId && <PushSettings key={userId} userId={userId} />}<div className="notification-list">{items.map(item => <a href={item.link.url} key={item.id} data-read={item.read || undefined} onClick={event => {
    if(!plainLinkClick(event))return;event.preventDefault();
    const destination = parseDestination(item.link.url, location.origin);
    if (destination) { navigate(destination); if (!item.read) void operation('notifications.read', { notificationId: item.id }).catch(error => console.error('Notification read:', error)); }
  }}>{item.photoId?<span className="notification-person"><img src={`/api/files/${encodeURIComponent(item.photoId)}`} alt=""/><strong>{item.title}</strong></span>:<strong>{item.title}</strong>}{item.text && <span>{item.text}</span>}<small className="notification-meta"><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time><span>{item.read ? 'Read' : 'Unread'}</span></small></a>)}</div>
    {!items.length&&!cursor && <p className="quiet">No notifications yet.</p>}
    {cursor&&<button className="more-messages" disabled={busy} onClick={()=>void more()}>{busy?'Loading...':'More notifications'}</button>}
  </>;
}
