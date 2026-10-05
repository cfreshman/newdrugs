/* App shell, push, and a bounded account-scoped Log photo cache. */
if (typeof importScripts === 'function') importScripts('/log-image-cache.js');
const APP_CACHE='newdrugs-app-development';
const APP_ASSETS=[];
self.addEventListener('install', event => event.waitUntil((async()=>{
  const cache=await caches.open(APP_CACHE);
  await cache.addAll(['/index.html',...APP_ASSETS]);
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith('newdrugs-app-')&&name!==APP_CACHE)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{return await fetch(request);}catch{
        const cached=await caches.open(APP_CACHE).then(cache=>cache.match('/index.html'));
        return cached||Response.error();
      }
    })());return;
  }
  if(!url.pathname.startsWith('/assets/'))return;
  event.respondWith((async()=>{
    const cache=await caches.open(APP_CACHE),cached=await cache.match(request);
    if(cached)return cached;
    const response=await fetch(request);
    if(response.ok)event.waitUntil(cache.put(request,response.clone()));
    return response;
  })());
});
function messagePath(value) {
  try { const url = new URL(typeof value === 'string' ? value : '/messages', self.location.origin);
    if (url.origin === self.location.origin && (url.pathname==='/' || /^\/(?:messages|inbox|automations|log|posts|spaces|people|billing|storage|agents|account|ious)(?:\/[^/?#]+)?$/.test(url.pathname))) return url.pathname;
  } catch { /* Fall back to the inbox. */ }
  return '/messages';
}
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let data = {};
    try { data = event.data?.json() || {}; } catch { /* Still display a visible notification. */ }
    const path = messagePath(data.url);
    const detail=['alert','call','post_like','post_reply','connection_accepted','invitation','message','review','iou'].includes(data.kind)&&typeof data.body==='string'&&data.body.length<=160?data.body:null;
    const title=typeof data.title==='string'&&data.title.length<=160&&data.title.trim()?data.title:'New Drugs';
    await self.registration.showNotification(title, {
      body: detail || (['You have an agent update.','You have an automation update.','You have a new invitation.','You were added to a hangout.','You have a Log invitation.','Someone added to a hangout.'].includes(data.body) ? data.body : ''),
      icon: typeof data.icon==='string'&&/^\/api\/files\/[0-9a-f-]{36}$/i.test(data.icon)?data.icon:'/icons/icon-192.png', tag: typeof data.tag === 'string' ? data.tag : 'newdrugs',
      data: { path },
    });
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const path = messagePath(event.notification.data?.path);
    const launch=new URL(path,self.location.origin);launch.searchParams.set('notification','1');
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      await client.focus().catch(() => {});
      const channel = new MessageChannel();
      const handled = await new Promise(resolve => {
        const timer = setTimeout(() => { channel.port1.close(); resolve(false); }, 1000);
        channel.port1.onmessage = () => { clearTimeout(timer); channel.port1.close(); resolve(true); };
        client.postMessage({ type: 'newdrugs-open', path, notification: true }, [channel.port2]);
      });
      if (!handled) await client.navigate(launch.href);
      return;
    }
    await self.clients.openWindow(launch.href);
  })());
});
