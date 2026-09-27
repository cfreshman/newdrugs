import {logDate,type LogList} from './log';
import { modeForDestination, type AppMode } from './experience';
export const surfaceViews = ['preferences','account_menu','appearance','log_people','log_birthdays','log_anniversaries','log_settings','log_join','log_code','log_scan','log', 'log_compose', 'account_settings', 'inbox', 'automations', 'chat_history', 'profile', 'credits', 'agents', 'connections', 'people', 'feed', 'post_list', 'person', 'post', 'messages', 'location', 'notifications', 'uploads', 'blocked', 'storage'] as const;
export type SurfaceView = typeof surfaceViews[number];
export interface LogSequence { key:string; ids:string[]; query?:Partial<Omit<LogList,'before'|'limit'>>; nextCursor?:string|null }
/** logSequence is browser/history context only, never encoded in the URL. */
export interface Destination { logSequence?:LogSequence; view: SurfaceView | 'settings' | 'chat' | 'compose'; mode?: AppMode; date?:string; logMonth?:string; logScope?:'all'|'private'|'shared'|'invitations'; personId?:string; role?: 'all' | 'user' | 'assistant'; resourceId?: string; areaCell?: string; radiusMiles?: number; query?: string; scope?: 'all' | 'nearby' | 'own' | 'friends' | 'saved'; postIds?:string[] }
export interface ResourceLink { rel: 'open_in_newdrugs' | 'download'; targetKind: 'exact' | 'surface'; title: string; url: string; resourceType: string; resourceId?: string }
export const surfaceRoutes: Record<Destination['view'], string> = { preferences:'/settings/preferences',account_menu:'/account/menu',appearance:'/appearance',log_people:'/log/contacts',log_birthdays:'/log/birthdays',log_anniversaries:'/log/anniversaries',log_settings:'/log/preferences',log_join:'/log/join',log_code:'/log/code',log_scan:'/log/scan',log:'/log',log_compose:'/log/new', compose: '/compose', account_settings: '/account', inbox: '/inbox', automations: '/automations', chat_history: '/chat-history', chat: '/', settings: '/settings', profile: '/profile', credits: '/billing', agents: '/agents', connections: '/connections', people: '/nearby', feed: '/feed', post_list: '/selected-posts', person: '/people', post: '/posts', messages: '/messages', location: '/location', notifications: '/notifications', uploads: '/uploads', blocked: '/blocked', storage: '/storage' };
export const surfaceTitles: Record<Destination['view'], string> = { preferences:'Preferences',account_menu:'Account',appearance:'Preferences',log_people:'Log people',log_birthdays:'Birthdays',log_anniversaries:'Anniversaries',log_settings:'Log settings',log_join:'Join hangout',log_code:'Hangout code',log_scan:'Scan',log:'Log',log_compose:'New entry', compose: 'New post', account_settings: 'Sign-in & security', inbox: 'Agent inbox', automations: 'Automations', chat_history: 'Chat search', chat: 'Chat', settings: 'Settings', profile: 'Profile', credits: 'Add credit', agents: 'Connected agents', connections: 'Messages & invites', people: 'People', feed: 'Posts', post_list: 'Posts for you', person: 'Profile', post: 'Post', messages: 'Messages', location: 'Choose your area', notifications: 'Notifications', uploads: 'Upload files', blocked: 'Blocked people', storage: 'Storage' };

export function destinationPath(destination: Destination) {
  let path = destination.view === 'chat' && destination.resourceId ? '/chat' : surfaceRoutes[destination.view];
  if (destination.resourceId) path += `/${encodeURIComponent(destination.resourceId)}`;
  if (destination.mode && destination.mode !== modeForDestination(destination)) path = `/${destination.mode}${path === '/' ? '/chat' : path}`;
  const query = new URLSearchParams();
  if(destination.logMonth)query.set('month',destination.logMonth);
  if(destination.logScope&&destination.logScope!=='all')query.set('scope',destination.logScope);
  if(destination.personId)query.set('person',destination.personId);
  if(destination.date)query.set('date',destination.date);
  if (destination.areaCell) query.set('area', destination.areaCell);
  if (destination.radiusMiles) query.set('radius', String(destination.radiusMiles));
  if (destination.query) query.set('q', destination.query);
  if (destination.scope) query.set('scope', destination.scope);
  if (destination.role && destination.role !== 'all') query.set('role', destination.role);
  if (destination.postIds?.length) query.set('ids', destination.postIds.join(','));
  return path + (query.size ? `?${query}` : '');
}
export function parseDestination(value: string, origin: string): Destination | null {
  if (!value.trim() || /[\x00-\x1f\x7f\\]/.test(value)) return null;
  try {
    const base = new URL(origin), url = new URL(value, base);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if (url.username || url.password || !['https:', 'http:'].includes(url.protocol) || url.origin !== base.origin && !(local && (url.origin === 'https://dev.druggie.org' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.port === base.port && url.protocol === base.protocol))) return null;
    let path = url.pathname.replace(/\/$/, '') || '/';
    let mode: AppMode | undefined;
    const prefix = /^\/(agent|friends|posts|log)(\/.*)?$/.exec(path);
    if (prefix && path !== '/log') {
      const suffix = prefix[2] || (prefix[1] === 'agent' ? '/' : prefix[1] === 'friends' ? '/nearby' : prefix[1] === 'log' ? '/log' : '/feed');
      // /posts/:id is a canonical post, while /posts/people/:id retains Posts mode.
      if (suffix === '/chat' || Object.values(surfaceRoutes).includes(suffix) || /^\/(log\/join|log\/code|people|posts|messages|chat|inbox|automations|log)\/[^/]+$/.test(suffix)) { mode = prefix[1] as AppMode; path = suffix === '/chat' ? '/' : suffix; }
    }
    const route = Object.entries(surfaceRoutes).find(([, route]) => route === path);
    const record = /^\/(log\/join|log\/code|people|posts|messages|chat|inbox|automations|log)\/([^/]+)$/.exec(path);
    let destination: Destination | undefined = route ? { view: route[0] as Destination['view'] } : record ? { view: record[1] === 'log/join' ? 'log_join' : record[1] === 'log/code' ? 'log_code' : record[1] === 'log' ? 'log' : record[1] === 'people' ? 'person' : record[1] === 'posts' ? 'post' : record[1] === 'chat' ? 'chat' : record[1] === 'inbox' ? 'inbox' : record[1] === 'automations' ? 'automations' : 'messages', resourceId: decodeURIComponent(record[2]) } : undefined;
    if (!destination || ['person', 'post','log_join','log_code'].includes(destination.view) && !destination.resourceId) return null;
    if (destination.resourceId && !/^[A-Za-z0-9:_.-]{1,150}$/.test(destination.resourceId)) return null;
    if (mode) destination.mode = mode;
    const date=url.searchParams.get('date');if(date&&destination.view==='log_compose'){if(!logDate.safeParse(date).success)return null;destination.date=date;}
    const role = url.searchParams.get('role');
    if (destination.view === 'chat_history' && (role === 'user' || role === 'assistant')) destination.role = role;
    const area = url.searchParams.get('area'), radius = Number(url.searchParams.get('radius'));
    if (area && /^[0-9a-f]{15}$/.test(area)) destination.areaCell = area;
    if (radius >= 10 && radius <= 250) destination.radiusMiles = radius;
    if(destination.view==='post_list'){const ids=(url.searchParams.get('ids')||'').split(',');if(!ids.length||ids.length>30||ids.some(id=>!/^[A-Za-z0-9:_.-]{1,100}$/.test(id)))return null;destination.postIds=[...new Set(ids)];}
    if(destination.view==='log'){const month=url.searchParams.get('month'),scope=url.searchParams.get('scope'),person=url.searchParams.get('person');if(month){if(!/^\d{4}-\d{2}$/.test(month)||!logDate.safeParse(`${month}-01`).success)return null;destination.logMonth=month;}if(scope){if(!['all','private','shared','invitations'].includes(scope))return null;destination.logScope=scope as Destination['logScope'];}if(person&&/^[A-Za-z0-9:_.-]{1,100}$/.test(person))destination.personId=person;}
    const query = url.searchParams.get('q'), scope = url.searchParams.get('scope');
    if (query && query.length<=500 && ['people','feed','chat_history','log'].includes(destination.view)) destination.query=query;
    if(destination.view==='people'&&scope&&!['all','nearby'].includes(scope))return null;
    if (scope && ['all','nearby','own','friends','saved'].includes(scope) && ['people','feed','chat_history'].includes(destination.view)) destination.scope=scope as Destination['scope'];
    return destination;
  } catch { return null; }
}

export const operationUiBindings: Record<string, { route: string; targetKind: ResourceLink['targetKind']; resourceType: string }[]> = {
 'log.birthday_get':[{route:'/log/preferences',targetKind:'surface',resourceType:'log_settings'}],
 'log.birthday_update':[{route:'/log/preferences',targetKind:'surface',resourceType:'log_settings'}],
 'log.birthdays':[{route:'/people/[id]',targetKind:'exact',resourceType:'person'}],
  'log.add_person':[{route:'/log/[id]',targetKind:'exact',resourceType:'log_entry'}],
  'log.code':[{route:'/log/join/[code]',targetKind:'exact',resourceType:'log_join'}],
  'log.join':[{route:'/log/[id]',targetKind:'exact',resourceType:'log_entry'}],
  'account.preferences':[{route:'/settings/preferences',targetKind:'surface',resourceType:'preferences'}],
  'account.preferences_update':[{route:'/settings/preferences',targetKind:'surface',resourceType:'preferences'}],
  'conversation.search': [{ route: '/chat/[id]', targetKind: 'exact', resourceType: 'chat_message' }],
  'conversation.window': [{ route: '/chat/[id]', targetKind: 'exact', resourceType: 'chat_message' }],
  'identity.get': [{ route: '/people/[id]', targetKind: 'exact', resourceType: 'person' }],
  'profile.update': [{ route: '/people/[id]', targetKind: 'exact', resourceType: 'person' }],
  'people.get': [{ route: '/people/[id]', targetKind: 'exact', resourceType: 'person' }],
  'people.search': [{ route: '/people/[id]', targetKind: 'exact', resourceType: 'person' }, { route: '/nearby', targetKind: 'surface', resourceType: 'people' }],
  'people.context':[{route:'/people/[id]',targetKind:'exact',resourceType:'person'},{route:'/messages/[id]',targetKind:'exact',resourceType:'conversation'}],
  'activity.since':[{route:'/notifications',targetKind:'surface',resourceType:'notifications'}],
  'posts.thread_updates':[{route:'/posts/[id]',targetKind:'exact',resourceType:'post'},{route:'/selected-posts?ids=[ids]',targetKind:'surface',resourceType:'post_list'}],
  'posts.incoming_replies': [{route:'/posts/[id]',targetKind:'exact',resourceType:'post'},{route:'/selected-posts?ids=[ids]',targetKind:'surface',resourceType:'post_list'}],
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
  'connections.disconnect': [{ route: '/messages/[id]', targetKind: 'exact', resourceType: 'conversation' }],
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
  'storage.list': [{ route: '/storage', targetKind: 'surface', resourceType: 'storage' },{route:'/log/[id]',targetKind:'exact',resourceType:'log'},{route:'/people/[id]',targetKind:'exact',resourceType:'person'},{route:'/posts/[id]',targetKind:'exact',resourceType:'post'},{route:'/chat/[id]',targetKind:'exact',resourceType:'chat'}],
  'files.delete': [{ route: '/storage', targetKind: 'surface', resourceType: 'storage' }],
  'files.get': [{ route: '/api/files/[id]', targetKind: 'exact', resourceType: 'file' }],
  'files.list': [{ route: '/api/files/[id]', targetKind: 'exact', resourceType: 'file' }],
};

for (const name of ['search.query','search.similar','search.refine','search.explain']) operationUiBindings[name]=[{route:'/people/[id]',targetKind:'exact',resourceType:'person'},{route:'/posts/[id]',targetKind:'exact',resourceType:'post'}];
operationUiBindings['posts.search']=[{route:'/posts/[id]',targetKind:'exact',resourceType:'post'}];

/** Discard old BSON null optionals before handing a persisted surface to controls. */
export function cleanDestinationContext(value: Partial<Omit<Destination, 'view'>>): Omit<Destination, 'view'> {
  return {
    ...(value.logMonth&&logDate.safeParse(`${value.logMonth}-01`).success?{logMonth:value.logMonth}:{}),
    ...(value.logScope&&['all','private','shared','invitations'].includes(value.logScope)?{logScope:value.logScope}:{}),
    ...(typeof value.personId==='string'?{personId:value.personId}:{}),
    ...(typeof value.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value.date)?{date:value.date}:{}),
    ...(value.mode && ['agent','friends','posts','log'].includes(value.mode) ? {mode:value.mode} : {}),
    ...(value.role && ['all','user','assistant'].includes(value.role) ? {role:value.role} : {}),
    ...(typeof value.resourceId === 'string' ? { resourceId: value.resourceId } : {}),
    ...(typeof value.areaCell === 'string' ? { areaCell: value.areaCell } : {}),
    ...(typeof value.query === 'string' ? { query: value.query } : {}),
    ...(value.scope && ['all', 'nearby', 'own', 'friends', 'saved'].includes(value.scope) ? { scope: value.scope } : {}),
    ...(typeof value.radiusMiles === 'number' && Number.isFinite(value.radiusMiles) && value.radiusMiles >= 10 && value.radiusMiles <= 250 ? { radiusMiles: value.radiusMiles } : {}),
    ...(Array.isArray(value.postIds) ? { postIds: value.postIds.filter(id => typeof id === 'string') } : {}),
  };
}

for(const name of ['log.list','log.get','log.create','log.update','log.contribute','log.respond','log.export'])operationUiBindings[name]=[{route:'/log/[id]',targetKind:'exact',resourceType:'log_entry'}];
