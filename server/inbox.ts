import { textLinks } from '../shared/links';
import { enqueueInboxPush } from './push';
import {notificationEnabled} from './notificationSettings';
import { randomUUID } from 'node:crypto';
import type { ClientSession } from 'mongodb';
import { rows } from './db';
import { users, type Actor } from './auth';
import { requireValue, AppError } from './errors';
import { config } from './config';
import { parseDestination } from '../shared/navigation';
import type { InboxItem } from '../shared/inbox';
import { executeOperation } from './operations';
export interface InboxRow { _id: string; userId: string; title: string; body: string; links: InboxItem['links']; producer: InboxItem['producer']; createdAt: string; readAt: string | null; archivedAt: string | null; automationId?: string; runId?: string; automationGeneration?: number }
export const inboxRows = () => rows<InboxRow>('agentInbox');
export async function validateInboxLinks(userId: string, links: InboxItem['links'], body = '') {
  const actor: Actor = { userId, source: 'external', scope: 'read' };
  const urls = [...new Set([...links.map(link => link.url), ...textLinks(body).map(link => link.url), ...[...body.matchAll(/\]\((\/[^\s)]+)\)/g)].map(match => new URL(match[1], config.uiOrigin).href)])];
  let internal = 0;
  for (const url of urls) {
    const link = { url };
    const destination = parseDestination(link.url, config.uiOrigin) || parseDestination(link.url, config.APP_ORIGIN);
    if (!destination?.resourceId) continue;
    if (++internal > 24) throw new AppError(422, 'inbox_links', 'Use at most 24 internal source links.');
    const id = destination.resourceId;
    if (destination.view === 'log') await executeOperation('log.get',{entryId:id},actor);
    if (destination.view === 'post') await executeOperation('posts.get', { postId: id }, actor);
    if (destination.view === 'person') await executeOperation('people.get', { personId: id }, actor);
    if (destination.view === 'messages') await executeOperation('connections.get', { connectionId: id }, actor);
    if (destination.view === 'chat') await executeOperation('conversation.window', { messageId: id }, actor);
    if (destination.view === 'inbox') requireValue(await inboxRows().findOne({ _id: id, userId }));
  }
}
export async function inboxView(row: InboxRow): Promise<InboxItem> {
  let unavailable = false;
  try { await validateInboxLinks(row.userId, row.links, row.body); } catch { unavailable = true; }
  return { id: row._id, title: unavailable ? 'Update unavailable' : row.title, body: unavailable ? 'A source in this update is no longer available.' : row.body, links: unavailable ? [] : row.links, producer: row.producer, createdAt: row.createdAt, read: Boolean(row.readAt), archived: Boolean(row.archivedAt), unavailable, ...(row.automationId ? { automationId: row.automationId } : {}), ...(row.runId ? { runId: row.runId } : {}) };
}
export async function ownInbox(userId: string, id: string, session?: ClientSession) { return requireValue(await inboxRows().findOne({ _id: id, userId }, { session }), 'This update is unavailable.'); }
export async function publishInbox(userId: string, data: { title: string; body: string; links: InboxItem['links'] }, producer: InboxItem['producer'], session: ClientSession, origin?: { automationId: string; runId: string; automationGeneration?: number }) {
  const owner = requireValue(await users().findOneAndUpdate({ _id: userId, handle: { $type: 'string' } }, { $inc: { inboxRevision: 1 } }, { session }), 'Save your account before receiving agent updates.');
  if (origin) { const prior = await inboxRows().findOne({ userId, runId: origin.runId }, { session }); if (prior) return inboxView(prior); }
  const day = new Date().toISOString().slice(0, 10);
  if (await inboxRows().countDocuments({ userId, createdAt: { $gte: day } }, { session, limit: 200 }) >= 200) throw new AppError(429, 'inbox_limit', 'The daily inbox delivery limit has been reached.');
  if (await inboxRows().countDocuments({ userId }, { session, limit: 2000 }) >= 2000) throw new AppError(409, 'inbox_full', 'Your agent inbox is full. Delete old updates to make room.');
  const row: InboxRow = { _id: randomUUID(), userId: owner._id, ...data, producer, createdAt: new Date().toISOString(), readAt: null, archivedAt: null, ...origin };
  await inboxRows().insertOne(row, { session });
  if(await notificationEnabled(userId,'agent_update',session)){
    await rows('notifications').insertOne({ _id: `inbox:${row._id}`, userId, actorId: userId, kind: 'agent_update', inboxId: row._id, title: row.title, text: 'An agent update is ready.', readAt: null, createdAt: row.createdAt }, { session });
    await enqueueInboxPush(userId, row._id, session);
  }
  return inboxView(row);
}
export async function inboxOperation(name: string, data: Record<string, unknown>, actor: Actor, session?: ClientSession) {
  const userId = actor.userId;
  if (name === 'inbox.publish') {
    if (!session) throw Error('A delivery must be transactional.');
    if (actor.source === 'browser') throw new AppError(403, 'agent_delivery', 'Deliver updates through a connected agent.');
    const connection = actor.source === 'external' ? requireValue(await rows('tokens').findOneAndUpdate({ _id: actor.credentialId, userId, scope: 'write', revokedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }, { $set: { lastInboxDeliveryAt: new Date().toISOString() } }, { session }), 'This connected agent was revoked.') : null;
    return publishInbox(userId, data as unknown as Parameters<typeof publishInbox>[1], { kind: actor.source === 'external' ? 'external' : 'hosted', name: connection ? String(connection.name || 'My AI agent') : 'Your agent', ...(connection ? { id: connection._id } : {}) }, session);
  }
  if (name === 'inbox.list') {
    const limit = Number(data.limit || 20), cursor = data.before ? await ownInbox(userId, String(data.before), session) : null;
    const found = await inboxRows().find({ userId, ...(data.scope === 'archived' ? { archivedAt: { $ne: null } } : { archivedAt: null }), ...(data.scope === 'unread' ? { readAt: null } : {}), ...(cursor ? { $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor._id } }] } : {}) }, { session }).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).toArray();
    return { items: await Promise.all(found.slice(0, limit).map(inboxView)), nextCursor: found.length > limit ? found[limit - 1]._id : null };
  }
  const row = await ownInbox(userId, String(data.itemId), session);
  if (name === 'inbox.get') return inboxView(row);
  if (name === 'inbox.delete') { await inboxRows().deleteOne({ _id: row._id, userId }, { session }); await rows('notifications').deleteOne({ _id: `inbox:${row._id}`, userId }, { session }); return { deleted: true }; }
  const now = new Date().toISOString();
  if (name === 'inbox.mark_read') row.readAt = data.read ? now : null;
  if (name === 'inbox.archive') { row.archivedAt = data.archived ? now : null; if (data.archived) row.readAt = now; }
  await inboxRows().updateOne({ _id: row._id, userId }, { $set: { readAt: row.readAt, archivedAt: row.archivedAt } }, { session });
  await rows('notifications').updateOne({ _id: `inbox:${row._id}`, userId }, { $set: { readAt: row.readAt } }, { session });
  return inboxView(row);
}
export async function inboxContext(userId: string, ids: string[]) {
  const items = await Promise.all(ids.map(id => ownInbox(userId, id).then(inboxView)));
  if (items.some(item => item.unavailable)) throw new AppError(409, 'inbox_unavailable', 'A source changed. Open the update before discussing it.');
  return items;
}
