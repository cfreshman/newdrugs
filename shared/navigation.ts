export const surfaceViews = ['profile', 'credits', 'connections', 'people', 'feed', 'post_list', 'person', 'post', 'messages', 'location', 'notifications', 'uploads', 'blocked', 'storage'] as const;
export type SurfaceView = typeof surfaceViews[number];
export interface Destination { view: SurfaceView | 'settings' | 'chat'; resourceId?: string; areaCell?: string; radiusMiles?: number; query?: string; scope?: 'all' | 'nearby' | 'own'; postIds?:string[] }
export interface ResourceLink { rel: 'open_in_newdrugs' | 'download'; targetKind: 'exact' | 'surface'; title: string; url: string; resourceType: string; resourceId?: string }
export const surfaceRoutes: Record<Destination['view'], string> = { chat: '/', settings: '/settings', profile: '/profile', credits: '/billing', connections: '/agents', people: '/nearby', feed: '/feed', post_list: '/selected-posts', person: '/people', post: '/posts', messages: '/messages', location: '/location', notifications: '/notifications', uploads: '/uploads', blocked: '/blocked', storage: '/storage' };
export const surfaceTitles: Record<Destination['view'], string> = { chat: 'Chat', settings: 'Settings', profile: 'Profile', credits: 'Add credit', connections: 'Connect an agent', people: 'People', feed: 'Posts', post_list: 'Posts for you', person: 'Profile', post: 'Post', messages: 'Messages', location: 'Choose your area', notifications: 'Notifications', uploads: 'Upload files', blocked: 'Blocked people', storage: 'Storage' };

export function destinationPath(destination: Destination) {
  let path = surfaceRoutes[destination.view];
  if (destination.resourceId) path += `/${encodeURIComponent(destination.resourceId)}`;
  const query = new URLSearchParams();
  if (destination.areaCell) query.set('area', destination.areaCell);
  if (destination.radiusMiles) query.set('radius', String(destination.radiusMiles));
  if (destination.query) query.set('q', destination.query);
  if (destination.scope) query.set('scope', destination.scope);
  if (destination.postIds?.length) query.set('ids', destination.postIds.join(','));
  return path + (query.size ? `?${query}` : '');
}
export function parseDestination(value: string, origin: string): Destination | null {
  if (!value.trim() || /[\x00-\x1f\x7f\\]/.test(value)) return null;
  try {
    const base = new URL(origin), url = new URL(value, base);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if (url.username || url.password || !['https:', 'http:'].includes(url.protocol) || url.origin !== base.origin && !(local && (url.origin === 'https://dev.druggie.org' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.port === base.port && url.protocol === base.protocol))) return null;
    const path = url.pathname.replace(/\/$/, '') || '/';
    const route = Object.entries(surfaceRoutes).find(([, route]) => route === path);
    const record = /^\/(people|posts|messages)\/([^/]+)$/.exec(path);
    let destination: Destination | undefined = route ? { view: route[0] as Destination['view'] } : record ? { view: record[1] === 'people' ? 'person' : record[1] === 'posts' ? 'post' : 'messages', resourceId: decodeURIComponent(record[2]) } : undefined;
    if (!destination || ['person', 'post'].includes(destination.view) && !destination.resourceId) return null;
    if (destination.resourceId && !/^[A-Za-z0-9:_.-]{1,150}$/.test(destination.resourceId)) return null;
    const area = url.searchParams.get('area'), radius = Number(url.searchParams.get('radius'));
    if (area && /^[0-9a-f]{15}$/.test(area)) destination.areaCell = area;
    if (radius >= 10 && radius <= 250) destination.radiusMiles = radius;
    if(destination.view==='post_list'){const ids=(url.searchParams.get('ids')||'').split(',');if(!ids.length||ids.length>30||ids.some(id=>!/^[A-Za-z0-9:_.-]{1,100}$/.test(id)))return null;destination.postIds=[...new Set(ids)];}
    const query = url.searchParams.get('q'), scope = url.searchParams.get('scope');
    if (query && query.length<=500 && ['people','feed'].includes(destination.view)) destination.query=query;
    if (scope && ['all','nearby','own'].includes(scope) && ['people','feed'].includes(destination.view)) destination.scope=scope as Destination['scope'];
    return destination;
  } catch { return null; }
}

export const operationUiBindings: Record<string, { route: string; targetKind: ResourceLink['targetKind']; resourceType: string }[]> = {
  'identity.get': [{ route: '/people/[id]', targetKind: 'exact', resourceType: 'person' }],
  'profile.update': [{ route: '/people/[id]', targetKind: 'exact', resourceType: 'person' }],
  'people.get': [{ route: '/people/[id]', targetKind: 'exact', resourceType: 'person' }],
  'people.search': [{ route: '/people/[id]', targetKind: 'exact', resourceType: 'person' }, { route: '/nearby', targetKind: 'surface', resourceType: 'people' }],
  'posts.replies': [{ route: '/posts/[id]', targetKind: 'exact', resourceType: 'post' }],
  'posts.reply': [{ route: '/posts/[id]', targetKind: 'exact', resourceType: 'post' }],
  'posts.like': [{ route: '/posts/[id]', targetKind: 'exact', resourceType: 'post' }],
  'posts.get': [{ route: '/posts/[id]', targetKind: 'exact', resourceType: 'post' }],
  'posts.create': [{ route: '/posts/[id]', targetKind: 'exact', resourceType: 'post' }],
  'posts.list': [{ route: '/posts/[id]', targetKind: 'exact', resourceType: 'post' }, { route: '/feed', targetKind: 'surface', resourceType: 'feed' }],
  'connections.list': [{ route: '/messages', targetKind: 'surface', resourceType: 'connections' }],
  'connections.status': [{ route: '/messages/[id]', targetKind: 'exact', resourceType: 'conversation' }, { route: '/messages', targetKind: 'surface', resourceType: 'connections' }],
  'connections.get': [{ route: '/messages/[id]', targetKind: 'exact', resourceType: 'conversation' }],
  'connections.request': [{ route: '/messages/[id]', targetKind: 'exact', resourceType: 'invitation' }],
  'connections.withdraw': [{ route: '/messages/[id]', targetKind: 'exact', resourceType: 'invitation' }],
  'people.blocked': [{ route: '/blocked', targetKind: 'surface', resourceType: 'blocked' }],
  'connections.respond': [{ route: '/messages/[id]', targetKind: 'exact', resourceType: 'conversation' }],
  'messages.list': [{ route: '/messages/[connectionId]', targetKind: 'exact', resourceType: 'conversation' }],
  'messages.send': [{ route: '/messages/[connectionId]', targetKind: 'surface', resourceType: 'message' }],
  'wallet.get': [{ route: '/billing', targetKind: 'surface', resourceType: 'wallet' }],
  'locations.search': [{ route: '/location', targetKind: 'surface', resourceType: 'location' }],
  'locations.resolve': [{ route: '/location?area=[cell]', targetKind: 'exact', resourceType: 'area' }],
  'conversation.list': [{ route: '/', targetKind: 'surface', resourceType: 'chat' }],
  'conversation.append': [{ route: '/', targetKind: 'surface', resourceType: 'chat' }],
  'storage.list': [{ route: '/storage', targetKind: 'surface', resourceType: 'storage' }],
  'files.delete': [{ route: '/storage', targetKind: 'surface', resourceType: 'storage' }],
  'files.get': [{ route: '/api/files/[id]', targetKind: 'exact', resourceType: 'file' }],
  'files.list': [{ route: '/api/files/[id]', targetKind: 'exact', resourceType: 'file' }],
};

for (const name of ['search.query','search.similar','search.refine','search.explain']) operationUiBindings[name]=[{route:'/people/[id]',targetKind:'exact',resourceType:'person'},{route:'/posts/[id]',targetKind:'exact',resourceType:'post'}];
operationUiBindings['posts.search']=[{route:'/posts/[id]',targetKind:'exact',resourceType:'post'}];
