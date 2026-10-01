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
  if(name.startsWith('agent.instructions.')){add({view:'agent_instructions'},'Guidance','surface','agent_instructions');return links;}
  if(name.startsWith('agent.memory.')){add({view:'agent_memory'},'Agent memory','surface','agent_memory');return links;}
  if(name==='access.get'){add({view:'agents'},'Connected agents','surface','agents');return links;}
  if(name==='account.preferences'||name==='account.preferences_update'){add({view:'preferences'},'Preferences','surface','preferences');return links;}
  if(name==='log.birthday_get'||name==='log.birthday_update'){add({view:'log_settings'},'Log settings','surface','log_settings');return links;}
  if(name==='log.birthdays'){for(const item of data.items||[])add({view:'person',resourceId:item.personId},item.name,'exact','person',item.personId);return links;}
  if(name==='log.code'){add({view:'log_join',resourceId:data.code},'Join hangout','exact','log_join',data.entryId);return links;}
  if(name==='log.contacts'){for(const person of rows)if(person.id)add({view:'person',resourceId:person.id},person.name||'View person','exact','person',person.id);return links;}
  if(name==='log.join_preview'){add({view:'log_join',resourceId:String(input.code)},'Join hangout','exact','log_join',data.entryId);return links;}
  if(name==='log.calendar'){for(const day of data.days||[])for(const row of day.items||[])if(!links.some(link=>link.resourceId===row.id))add({view:'log',resourceId:row.id},row.title||'Open Log entry','exact','log_entry',row.id);return links;}
  if(name==='log.search'||name==='log.related'){for(const row of rows)if(row.entryId)add({view:'log',resourceId:row.entryId},row.title||'Open Log entry','exact','log_entry',row.entryId);return links;}
  if(name.startsWith('website.')){const site=object(data.site||data);if(typeof site.previewUrl==='string')links.push({rel:'open_in_newdrugs',targetKind:'exact',title:'Preview website draft',url:site.previewUrl,resourceType:'website_preview'});if(typeof site.publicUrl==='string')links.push({rel:'open_in_newdrugs',targetKind:'exact',title:'Open published website',url:site.publicUrl,resourceType:'website'});if(typeof site.stableUrl==='string'&&site.publicUrl)links.push({rel:'open_in_newdrugs',targetKind:'exact',title:'Permanent website address',url:site.stableUrl,resourceType:'website'});return links;}
  if(name==='make.publish'&&data.entry?.id){add({view:'log',resourceId:data.entry.id},data.entry.title||'Open Log entry','exact','log_entry',data.entry.id);return links;}
  if(name.startsWith('spaces.')){for(const row of name==='spaces.list'?rows:[object(data.space||data)])if(row.id)add({view:'spaces',resourceId:row.id},row.title||'Open talk space','exact','space',row.id);if(!links.length)add({view:'spaces'},'Browse Talk','surface','spaces');return links;}
  if(name.startsWith('log.')){for(const row of name==='log.neighbors'?[data.previous,data.next].filter(Boolean):rows)if(typeof row.id==='string')add({view:'log',resourceId:row.id},row.title||'Open Log entry','exact','log_entry',row.id);if(!links.length)add({view:'log'},'Open Log','surface','log');return links;}
  if(name==='people.context'){
    if(data.person?.id)links.push(...buildResourceLinks('people.get',{},data.person,actor));
    if(data.connection?.id)links.push(...buildResourceLinks('connections.status',{}, {connection:data.connection},actor));
    for(const post of data.recentPosts?.items||[])if(post.id)add({view:'post',resourceId:post.id},'View post','exact','post',post.id);
  }else if(name==='activity.since'){
    for(const item of rows)if(item.link)links.push(item.link);
  }else if (name.startsWith('automations.')) { if(name==='automations.validate')add({view:'automations'},'Automations','surface','automations');else if (typeof input.automationId === 'string') add({ view: 'automations', resourceId: input.automationId }, 'Open automation', 'exact', 'automation', input.automationId); else for (const row of rows) if (row.id) add({ view: 'automations', resourceId: row.id }, 'Open automation', 'exact', 'automation', row.id); }
  else if (name.startsWith('inbox.') && name !== 'inbox.delete') { for (const row of rows) if (row.id) add({ view: 'inbox', resourceId: row.id }, 'Open agent update', 'exact', 'inbox', row.id); }
  else if (['search.query','posts.search','search.similar','search.refine','search.explain'].includes(name)) {
    for (const match of Array.isArray(data.matches) ? data.matches : data.match ? [data.match] : []) {
      if (match.entityType === 'person') add({view:'person',resourceId:match.entityId}, `View ${match.record?.handle ? '@'+match.record.handle : 'profile'}`, 'exact','person',match.entityId);
      if (match.entityType === 'post') add({view:'post',resourceId:match.entityId},'View matched post','exact','post',match.entityId);
      if (match.entityType === 'space') add({view:'spaces',resourceId:match.entityId},'Join live talk space','exact','space',match.entityId);
    }
  } else if (['identity.get', 'profile.update', 'people.get', 'people.search','people.mutuals'].includes(name)) {
  if (name === 'identity.get' && !data.handle) { add({ view: 'profile' }, 'Create your account', 'surface', 'account'); return links; }
    for (const row of rows) if (typeof row.id === 'string' && (name === 'people.get' || name==='people.mutuals' || row.id === actor.userId || row.discoverable)) add({ view: 'person', resourceId: row.id }, `View ${row.handle ? '@' + row.handle : row.name || 'profile'}`, 'exact', 'person', row.id);
    if (name === 'people.search') input.scope==='hidden'?add({view:'hidden_people'},'Hidden people','surface','hidden_people'):add({ view: 'people', areaCell: input.near as string | undefined, radiusMiles: input.radiusMiles as number | undefined, query:input.query as string|undefined,scope:input.scope as Destination['scope'] }, 'Browse people', 'surface', 'people');
  } else if(name==='people.hide'){
    add({view:'hidden_people'},'Hidden people','surface','hidden_people');
  } else if (['posts.incoming_replies','posts.thread_updates'].includes(name)) {
    for(const row of rows)if(typeof row.id==='string')add({view:'post',resourceId:row.id},'View reply','exact','post',row.id);
    if(rows.length&&rows.every(row=>typeof row.id==='string'))add({view:'post_list',postIds:rows.map(row=>row.id)},name==='posts.incoming_replies'?'Replies to you':'Thread updates','surface','post_list');
  } else if (['posts.save', 'posts.get', 'posts.create', 'posts.list', 'posts.replies', 'posts.reply', 'posts.like'].includes(name)) {
    for (const row of rows) if (typeof row.id === 'string') add({ view: 'post', resourceId: row.id }, 'View post', 'exact', 'post', row.id);
    if (name === 'posts.list' && input.scope === 'selected' && rows.length) add({view:'post_list',postIds:rows.map(row=>row.id)},'Posts for you','surface','post_list');
    else if (name === 'posts.list') add({ view: 'feed', areaCell: input.near as string | undefined, radiusMiles: input.radiusMiles as number | undefined, scope: input.scope==='public'? 'all':input.scope as Destination['scope'] }, 'Browse posts', 'surface', 'feed');
  } else if (name.startsWith('connections.')) {
    for (const row of name === 'connections.status' || name === 'connections.get' ? [object(data.connection)] : rows) if (typeof row.id === 'string') add({ view: 'messages', resourceId: row.id }, row.status === 'accepted' ? 'Open conversation' : 'View invitation', 'exact', row.status === 'accepted' ? 'conversation' : 'invitation', row.id);
    if (!links.length || name === 'connections.list') add({ view: 'messages' }, 'View invitations and conversations', 'surface', 'connections');
  } else if (name === 'notifications.list') return rows.map(row => row.link as ResourceLink).filter(Boolean);
  else if (name.startsWith('messages.') && typeof (input.connectionId || data.connectionId || data.connection?.id) === 'string') {
    const connectionId=String(input.connectionId || data.connectionId || data.connection.id);
    add({ view: 'messages', resourceId: connectionId }, 'Open conversation', ['messages.list','messages.window'].includes(name) ? 'exact' : 'surface', 'conversation', connectionId);
  } else if (name === 'people.blocked' || name === 'people.block') add({ view: 'blocked' }, 'Manage blocked people', 'surface', 'blocked');
  else if(name==='storage.attachments'){for(const attachment of rows)if(attachment.destination)add(attachment.destination,attachment.label,'exact',attachment.destination.view,attachment.destination.resourceId);else if(typeof attachment.url==='string')links.push({rel:'open_in_newdrugs',targetKind:'exact',title:String(attachment.label||'Website image'),url:attachment.url,resourceType:'website_asset'});}
  else if (name === 'storage.list' || name === 'files.delete') {for(const row of rows)for(const attachment of row.attachments||[])if(attachment.destination)add(attachment.destination,attachment.label,'exact',attachment.destination.view,attachment.destination.resourceId);else if(typeof attachment.url==='string')links.push({rel:'open_in_newdrugs',targetKind:'exact',title:String(attachment.label||'Website image'),url:attachment.url,resourceType:'website_asset'});add({ view: 'storage' }, 'Manage storage', 'surface', 'storage');}
  else if ((name === 'wallet.get' || name === 'wallet.activity')) add({ view: 'credits' }, 'View credit and usage', 'surface', 'wallet');
  else if (name === 'locations.resolve') add({ view: 'location', areaCell: data.cell }, 'Choose this area', 'exact', 'area', data.cell);
  else if (name === 'locations.search') add({ view: 'location' }, 'Choose an area', 'surface', 'location');
  else if (name === 'conversation.search' || name === 'conversation.window') {
    for (const row of name === 'conversation.window' ? [{ id: data.targetId }] : rows) if (row.id) add({ view: 'chat', resourceId: row.id }, 'Open chat message', 'exact', 'chat_message', row.id);
  }
  else if (name === 'app.open' && data.open === 'chat_history' && data.resourceId) add({ view: 'chat', resourceId: data.resourceId }, 'Open chat message', 'exact', 'chat_message', data.resourceId);
  else if (name.startsWith('conversation.')) add({ view: 'chat' }, 'Open your agent chat', 'surface', 'chat');
  else if (name === 'app.open') add({ view: data.open,date:data.date,logMonth:data.logMonth,logScope:data.logScope,personId:data.personId, resourceId: data.resourceId, postIds:data.postIds, areaCell: data.areaCell, radiusMiles: data.radiusMiles,query:data.query,scope:data.scope }, 'Open ' + data.open, data.resourceId ? 'exact' : 'surface', data.open, data.resourceId);
  else if (name === 'files.get' || name === 'files.list') for (const row of rows) if (row.ready && typeof row.id === 'string') links.push({ rel: 'download', targetKind: 'exact', title: String(row.name), url: new URL(`/api/files/${encodeURIComponent(row.id)}`, config.uiOrigin).href, resourceType: 'file', resourceId: row.id });
  // Deleted/blocked/reported records have no promised inspectable destination.
  return links.filter((link, index) => links.findIndex(other => other.url === link.url) === index).slice(0, 40);
}
