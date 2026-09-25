import type { NotificationState } from '../shared/notifications';
import { parseDestination, type Destination } from '../shared/navigation';
import { operation } from './api';
export function NotificationsPanel({ state, navigate }: { state?: NotificationState; navigate(destination: Destination): void }) {
  return <><div className="notification-list">{state?.items.map(item => <button key={item.id} onClick={() => {
    const destination = parseDestination(item.link.url, location.origin);
    if (destination) { navigate(destination); void operation('notifications.read', { notificationId: item.id }).catch(error => console.error('Notification read:', error)); }
  }}><strong>{item.title}</strong>{item.text && <span>{item.text}</span>}</button>)}</div>
    {!state?.items.length && <p className="quiet">You’re all caught up.</p>}
  </>;
}
