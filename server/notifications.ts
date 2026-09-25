import type { ClientSession } from 'mongodb';
import { rows } from './db';
import { hash, users } from './auth';
import { config } from './config';
import { destinationPath, type ResourceLink } from '../shared/navigation';
import type { Notification, NotificationState } from '../shared/notifications';

export async function notifyConnection(userId: string, actorId: string, connectionId: string, kind: 'message' | 'connection_accepted', text: string, messageId: string | undefined, session?: ClientSession) {
  await rows('notifications').updateOne({ _id: hash(`${kind}:${connectionId}:${userId}`) }, { $set: { userId, actorId, connectionId, kind, text, messageId, readAt: null, createdAt: new Date().toISOString() } }, { session, upsert: true });
}
export async function notificationState(userId: string, session?: ClientSession): Promise<NotificationState> {
  const blocked = (await rows('blocks').find({ members: userId }, { session }).toArray()).flatMap(row => (row.members as string[]).filter(id => id !== userId));
  const invitationFilter = { toId: userId, status: 'pending', fromId: { $nin: blocked } };
  const recordFilter = { userId, readAt: null, actorId: { $nin: blocked } };
  const invitations = await rows('connections').find(invitationFilter, { session }).sort({ createdAt: -1 }).limit(30).toArray();
  const stored = await rows('notifications').find(recordFilter, { session }).sort({ createdAt: -1 }).limit(30).toArray();
  const count = await rows('connections').countDocuments(invitationFilter, { session }) + await rows('notifications').countDocuments(recordFilter, { session });
  const people = await users().find({ _id: { $in: [...invitations.map(row => String(row.fromId)), ...stored.map(row => String(row.actorId))] } }, { session, projection: { name: 1, handle: 1 } }).toArray();
  const label = (id: string) => { const person = people.find(person => person._id === id); return person?.handle ? `@${person.handle}` : person?.name || 'Someone'; };
  const link = (connectionId: string): ResourceLink => ({ rel: 'open_in_newdrugs', targetKind: 'exact', title: 'Open conversation', url: new URL(destinationPath({ view: 'messages', resourceId: connectionId }), config.uiOrigin).href, resourceType: 'conversation', resourceId: connectionId });
  const items: Notification[] = invitations.map(row => ({ id: `invite:${row._id}`, kind: 'invitation', title: `Invitation from ${label(String(row.fromId))}`, text: String(row.note), createdAt: String(row.createdAt), connectionId: row._id, link: link(row._id) }));
  for (const row of stored) {
    const social = row.kind === 'post_like' || row.kind === 'post_reply';
    const destination: ResourceLink = social ? { rel:'open_in_newdrugs',targetKind:'exact',title:'Open post',url:new URL(destinationPath({view:'post',resourceId:String(row.postId)}),config.uiOrigin).href,resourceType:'post',resourceId:String(row.postId) } : link(String(row.connectionId));
    const actor=label(String(row.actorId));
    items.push({id:row._id,kind:row.kind as Notification['kind'],title:row.kind==='message'?`Message from ${actor}`:row.kind==='post_like'?`${actor} liked your post`:row.kind==='post_reply'?`${actor} replied to your post`:`${actor} accepted your invitation`,text:String(row.text||''),createdAt:String(row.createdAt),...(social?{}:{connectionId:String(row.connectionId)}),link:destination});
  }
  const owner = await users().findOne({ _id: userId }, { session, projection: { activeRun: 1 } });
  const review = owner?.activeRun && await rows('runs').findOne({ _id: owner.activeRun, userId, status: 'waiting_for_approval' }, { session });
  if (review) items.push({ id: `review:${review._id}`, kind: 'review', title: 'Your agent has a change to review', text: 'Confirm or reject the proposed action in chat.', createdAt: String(review.updatedAt), link: { rel: 'open_in_newdrugs', targetKind: 'surface', title: 'Review in chat', url: new URL('/', config.uiOrigin).href, resourceType: 'chat' } });
  return { unread: count + (review ? 1 : 0), items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30) };
}
