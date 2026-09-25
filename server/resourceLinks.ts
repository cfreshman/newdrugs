import { config } from './config';
import { destinationPath, type Destination, type ResourceLink } from '../shared/navigation';
import type { Actor } from './auth';

const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
/** Derive links only from an authorized operation's validated output, never a guessed ID. */
export function buildResourceLinks(name: string, input: Record<string, unknown>, output: unknown, actor: Actor): ResourceLink[] {
  const data = object(output), rows = Array.isArray(data.items) ? data.items.map(object) : [data];
  const links: ResourceLink[] = [];
  const add = (destination: Destination, title: string, targetKind: ResourceLink['targetKind'], resourceType: string, resourceId?: string) => {
    links.push({ rel: 'open_in_newdrugs', targetKind, title: title.slice(0, 160), url: new URL(destinationPath(destination), config.uiOrigin).href, resourceType, ...(resourceId ? { resourceId } : {}) });
  };
  if (['search.query','posts.search','search.similar','search.refine','search.explain'].includes(name)) {
    for (const match of Array.isArray(data.matches) ? data.matches : data.match ? [data.match] : []) {
      if (match.entityType === 'person') add({view:'person',resourceId:match.entityId}, `View ${match.record?.handle ? '@'+match.record.handle : 'profile'}`, 'exact','person',match.entityId);
      if (match.entityType === 'post') add({view:'post',resourceId:match.entityId},'View matched post','exact','post',match.entityId);
    }
  } else if (['identity.get', 'profile.update', 'people.get', 'people.search'].includes(name)) {
    if (name === 'identity.get' && !data.handle) { add({ view: 'profile' }, 'Create your account', 'surface', 'account'); return links; }
    for (const row of rows) if (typeof row.id === 'string' && (row.id === actor.userId || row.discoverable)) add({ view: 'person', resourceId: row.id }, `View ${row.handle ? '@' + row.handle : row.name || 'profile'}`, 'exact', 'person', row.id);
    if (name === 'people.search') add({ view: 'people', areaCell: input.near as string | undefined, radiusMiles: input.radiusMiles as number | undefined, query:input.query as string|undefined,scope:input.scope as Destination['scope'] }, 'Browse people', 'surface', 'people');
  } else if (['posts.get', 'posts.create', 'posts.list', 'posts.replies', 'posts.reply', 'posts.like'].includes(name)) {
    for (const row of rows) if (typeof row.id === 'string') add({ view: 'post', resourceId: row.id }, 'View post', 'exact', 'post', row.id);
    if (name === 'posts.list' && input.scope === 'selected' && rows.length) add({view:'post_list',postIds:rows.map(row=>row.id)},'Posts for you','surface','post_list');
    else if (name === 'posts.list') add({ view: 'feed', areaCell: input.near as string | undefined, radiusMiles: input.radiusMiles as number | undefined }, 'Browse posts', 'surface', 'feed');
  } else if (name.startsWith('connections.')) {
    for (const row of name === 'connections.status' || name === 'connections.get' ? [object(data.connection)] : rows) if (typeof row.id === 'string') add({ view: 'messages', resourceId: row.id }, row.status === 'accepted' ? 'Open conversation' : 'View invitation', 'exact', row.status === 'accepted' ? 'conversation' : 'invitation', row.id);
    if (!links.length || name === 'connections.list') add({ view: 'messages' }, 'View invitations and conversations', 'surface', 'connections');
  } else if (name === 'notifications.list') return rows.map(row => row.link as ResourceLink).filter(Boolean);
  else if (name.startsWith('messages.') && typeof input.connectionId === 'string') {
    add({ view: 'messages', resourceId: input.connectionId }, 'Open conversation', name === 'messages.list' ? 'exact' : 'surface', 'conversation', input.connectionId);
  } else if (name === 'people.blocked' || name === 'people.block') add({ view: 'blocked' }, 'Manage blocked people', 'surface', 'blocked');
  else if (name === 'storage.list' || name === 'files.delete') add({ view: 'storage' }, 'Manage storage', 'surface', 'storage');
  else if (name === 'wallet.get') add({ view: 'credits' }, 'View credit and usage', 'surface', 'wallet');
  else if (name === 'locations.resolve') add({ view: 'location', areaCell: data.cell }, 'Choose this area', 'exact', 'area', data.cell);
  else if (name === 'locations.search') add({ view: 'location' }, 'Choose an area', 'surface', 'location');
  else if (name.startsWith('conversation.')) add({ view: 'chat' }, 'Open your agent chat', 'surface', 'chat');
  else if (name === 'app.open') add({ view: data.open, resourceId: data.resourceId, postIds:data.postIds, areaCell: data.areaCell, radiusMiles: data.radiusMiles,query:data.query,scope:data.scope }, 'Open ' + data.open, data.resourceId ? 'exact' : 'surface', data.open, data.resourceId);
  else if (name === 'files.get' || name === 'files.list') for (const row of rows) if (row.ready && typeof row.id === 'string') links.push({ rel: 'download', targetKind: 'exact', title: String(row.name), url: new URL(`/api/files/${encodeURIComponent(row.id)}`, config.uiOrigin).href, resourceType: 'file', resourceId: row.id });
  // Deleted/blocked/reported records have no promised inspectable destination.
  return links.filter((link, index) => links.findIndex(other => other.url === link.url) === index).slice(0, 40);
}
