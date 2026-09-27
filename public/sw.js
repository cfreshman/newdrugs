/* Push plus a bounded, account-scoped cache for explicitly marked Log photos. */
if (typeof importScripts === 'function') importScripts('/log-image-cache.js');
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
function messagePath(value) {
  try { const url = new URL(typeof value === 'string' ? value : '/messages', self.location.origin);
    if (url.origin === self.location.origin && /^\/(?:messages|inbox|automations|log)(?:\/[^/?#]+)?$/.test(url.pathname)) return url.pathname;
  } catch { /* Fall back to the inbox. */ }
  return '/messages';
}
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data = {};
    try { data = event.data?.json() || {}; } catch { /* Still display a visible notification. */ }
    const path = messagePath(data.url);
    await self.registration.showNotification('Notification', {
      body: ['You have an agent update.','You have an automation update.','You have a new invitation.','You were added to a hangout.','You have a Log invitation.','Someone added to a hangout.'].includes(data.body) ? data.body : 'You have a new message.',
      icon: '/icons/icon-192.png', tag: typeof data.tag === 'string' ? data.tag : 'newdrugs',
      data: { path },
    });
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const path = messagePath(event.notification.data?.path);
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.focus().catch(() => {});
      const channel = new MessageChannel();
      const handled = await new Promise(resolve => {
        const timer = setTimeout(() => { channel.port1.close(); resolve(false); }, 1000);
        channel.port1.onmessage = () => { clearTimeout(timer); channel.port1.close(); resolve(true); };
        client.postMessage({ type: 'newdrugs-open', path }, [channel.port2]);
      });
      if (!handled) await client.navigate(new URL(path, self.location.origin).href);
      return;
    }
    await self.clients.openWindow(new URL(path, self.location.origin).href);
  })());
});
