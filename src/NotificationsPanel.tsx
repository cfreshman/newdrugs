import { PushSettings } from './PushSettings';
import type { NotificationState } from '../shared/notifications';
import { parseDestination, type Destination } from '../shared/navigation';
import { operation } from './api';
export function NotificationsPanel({ state, navigate, userId }: { state?: NotificationState; userId?: string; navigate(destination: Destination): void }) {
  return <>{userId && <PushSettings key={userId} userId={userId} />}<div className="notification-list">{state?.items.map(item => <button key={item.id} data-read={item.read || undefined} onClick={() => {
    const destination = parseDestination(item.link.url, location.origin);
    if (destination) { navigate(destination); if (!item.read) void operation('notifications.read', { notificationId: item.id }).catch(error => console.error('Notification read:', error)); }
  }}><strong>{item.title}</strong>{item.text && <span>{item.text}</span>}<small className="notification-meta"><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time><span>{item.read ? 'Read' : 'Unread'}</span></small></button>)}</div>
    {!state?.items.length && <p className="quiet">No notifications yet.</p>}
  </>;
}
