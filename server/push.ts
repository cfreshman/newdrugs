import { randomUUID } from 'node:crypto';
import type { ClientSession } from 'mongodb';
import { z } from 'zod';
import webpush from 'web-push';
import { rows, transaction } from './db';
import { config } from './config';
import { hash, users } from './auth';
import { AppError, requireValue } from './errors';

interface PushEvent { _id: string; userId: string; actorId: string; connectionId: string; kind: 'message' | 'invitation' | 'agent_update' | 'automation_status'; eventId: string; status: string; availableAt: number; attempts: number; delivered: string[]; expiresAt: Date; lease?: string }
const outbox = () => rows<PushEvent>('pushOutbox');
export const pushConfigured = () => Boolean(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY);
export const subscriptionSchema = z.strictObject({ deviceId: z.uuid(), endpoint: z.url().max(2048), keys: z.strictObject({ p256dh: z.string().max(100), auth: z.string().max(30) }) });
export function validateSubscription(input: z.infer<typeof subscriptionSchema>) {
  const url = new URL(input.endpoint);
  const host = url.hostname;
  const trusted = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
  if (!trusted || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) throw new AppError(422, 'push_endpoint', 'This push provider is not supported.');
  const key = Buffer.from(input.keys.p256dh, 'base64url');
  if (key.length !== 65 || key[0] !== 4 || Buffer.from(input.keys.auth, 'base64url').length !== 16) throw new AppError(422, 'push_key', 'Invalid push subscription.');
}
export async function saveSubscription(userId: string, sessionId: string, input: z.infer<typeof subscriptionSchema>) {
  if (!pushConfigured()) throw new AppError(503, 'push_unavailable', 'Push notifications are not configured yet.');
  validateSubscription(input);
  return transaction(async session => {
    requireValue(await rows('sessions').findOneAndUpdate({ _id: sessionId, userId, expiresAt: { $gt: new Date() } }, { $set: { pushTouchedAt: new Date() } }, { session }), 'Sign in again to enable notifications.');
    const owner = requireValue(await users().findOneAndUpdate({ _id: userId, handle: { $type: 'string' } }, { $inc: { pushRevision: 1 } }, { session }));
    const id = hash(input.endpoint), now = new Date().toISOString();
    if (await rows('pushSubscriptions').countDocuments({ userId, revokedAt: null, _id: { $ne: id }, deviceId: { $ne: input.deviceId } }, { session }) >= 8) throw new AppError(409, 'push_limit', 'Turn off an old device before adding another.');
    await rows('pushSubscriptions').updateMany({ userId, deviceId: input.deviceId, _id: { $ne: id } }, { $set: { revokedAt: now } }, { session });
    // A shared device belongs only to the account that explicitly enables it now.
    await rows('pushSubscriptions').replaceOne({ _id: id }, { _id: id, userId: owner._id, sessionId, deviceId: input.deviceId, endpoint: input.endpoint, keys: input.keys, createdAt: now, revokedAt: null }, { session, upsert: true });
    return { enabled: true };
  });
}
export async function pushDevices(userId: string, session?: ClientSession) {
  return { items: (await rows('pushSubscriptions').find({ userId, revokedAt: null }, { session, projection: { deviceId: 1, createdAt: 1 } }).toArray()).map(row => ({ id: row._id, deviceId: String(row.deviceId), createdAt: String(row.createdAt) })) };
}
export async function revokePush(userId: string, deviceId: string, session?: ClientSession) {
  await rows('pushSubscriptions').updateMany({ userId, deviceId }, { $set: { revokedAt: new Date().toISOString() } }, { session });
  return { enabled: false };
}
export async function enqueuePush(userId: string, actorId: string, connectionId: string, kind: 'message' | 'invitation', eventId: string, session?: ClientSession) {
  if (!pushConfigured()) return;
  await outbox().updateOne({ _id: hash(`${kind}:${eventId}:${userId}`) }, { $setOnInsert: { userId, actorId, connectionId, kind, eventId, status: 'pending', availableAt: Date.now() + 1500, attempts: 0, delivered: [], expiresAt: new Date(Date.now() + 86400000) } }, { session, upsert: true });
}
export async function enqueueInboxPush(userId: string, itemId: string, session: ClientSession) {
  if (!pushConfigured()) return;
  await outbox().updateOne({ _id: hash(`inbox:${itemId}`) }, { $setOnInsert: { userId, actorId: userId, connectionId: itemId, kind: 'agent_update', eventId: itemId, status: 'pending', availableAt: Date.now() + 1500, attempts: 0, delivered: [], expiresAt: new Date(Date.now() + 86400000) } }, { session, upsert: true });
}
export async function enqueueAutomationPush(userId:string, eventId:string, automationId:string, session?:ClientSession) {
  if (!pushConfigured()) return;
  await outbox().updateOne({_id:hash(eventId)},{$setOnInsert:{userId,actorId:userId,connectionId:automationId,kind:'automation_status',eventId,status:'pending',availableAt:Date.now()+1500,attempts:0,delivered:[],expiresAt:new Date(Date.now()+86400000)}},{session,upsert:true});
}
export async function pushStillRelevant(event: { userId: unknown; actorId: unknown; connectionId: unknown; kind: unknown; eventId: unknown }) {
  const userId = String(event.userId), actorId = String(event.actorId), connectionId = String(event.connectionId);
  if (event.kind === 'automation_status') return Boolean(await users().findOne({_id:userId,inboxPushEnabled:true}) && await rows('notifications').findOne({_id:String(event.eventId),userId,readAt:null}));
  if (event.kind === 'agent_update') return Boolean(await users().findOne({ _id: userId, inboxPushEnabled: true }) && await rows('agentInbox').findOne({ _id: String(event.eventId), userId, readAt: null, archivedAt: null }));
  if(await users().findOne({_id:actorId,suspendedAt:{$type:'string'}}))return false;
  if (!await users().findOne({ _id: userId, suspendedAt:null, handle: { $type: 'string' } })) return false;
  if (await rows('blocks').findOne({ members: { $all: [userId, actorId] } })) return false;
  if (event.kind === 'invitation') return Boolean(await rows('connections').findOne({ _id: connectionId, toId: userId, fromId: actorId, status: 'pending', notificationReadAt: null, createdAt: event.eventId }));
  if (!await rows('connections').findOne({ _id: connectionId, members: userId, status: 'accepted' })) return false;
  return Boolean(await rows('notifications').findOne({ userId, connectionId, kind: 'message', messageId: event.eventId, readAt: null }));
}
export async function deliverPush(send = webpush.sendNotification) {
  if (!pushConfigured()) return;
  const lease = randomUUID();
  const event = await outbox().findOneAndUpdate({ status: 'pending', availableAt: { $lte: Date.now() }, expiresAt: { $gt: new Date() } }, { $set: { lease, availableAt: Date.now() + 120000 }, $inc: { attempts: 1 } }, { sort: { availableAt: 1 }, returnDocument: 'after' });
  if (!event) return;
  const finish = (status: string) => outbox().updateOne({ _id: event._id, lease }, { $set: { status } });
  if (!await pushStillRelevant(event)) { await finish('skipped'); return; }
  const devices = await rows('pushSubscriptions').find({ userId: event.userId, revokedAt: null }).limit(8).toArray();
  let retry = false;
  for (const device of devices) {
    if ((event.delivered as string[]).includes(device._id)) continue;
    if (!await rows('pushSubscriptions').findOne({ _id: device._id, userId: event.userId, revokedAt: null, sessionId: device.sessionId })) continue;
    if (!await rows('sessions').findOne({ _id: String(device.sessionId), userId: event.userId, expiresAt: { $gt: new Date() } })) { await revokePush(String(event.userId), String(device.deviceId)); continue; }
    if (!await pushStillRelevant(event)) break;
    try {
      await send({ endpoint: String(device.endpoint), keys: device.keys as { p256dh: string; auth: string } }, JSON.stringify({ title: 'New Drugs', body: event.kind === 'automation_status' ? 'You have an automation update.' : event.kind === 'agent_update' ? 'You have an agent update.' : event.kind === 'invitation' ? 'You have a new invitation.' : 'You have a new message.', url: `/${event.kind === 'automation_status' ? 'automations' : event.kind === 'agent_update' ? 'inbox' : 'messages'}/${encodeURIComponent(String(event.connectionId))}`, tag: `conversation-${hash(String(event.connectionId)).slice(0, 24)}` }), { vapidDetails: { subject: config.VAPID_SUBJECT, publicKey: config.VAPID_PUBLIC_KEY, privateKey: config.VAPID_PRIVATE_KEY }, timeout: 10000, TTL: 3600, urgency: 'normal', topic: hash(String(event.connectionId)).slice(0, 32) });
      await outbox().updateOne({ _id: event._id, lease }, { $addToSet: { delivered: device._id } });
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await revokePush(String(event.userId), String(device.deviceId));
      else { retry = true; console.error('Push delivery failed', { status: status || 'network' }); }
    }
  }
  if (retry && Number(event.attempts) < 5) await outbox().updateOne({ _id: event._id, lease }, { $set: { availableAt: Date.now() + 30000 * 2 ** Number(event.attempts) } });
  else await finish(retry ? 'failed' : 'sent');
}
export function startPushWorker() {
  let pending: Promise<void> | undefined;
  const timer = setInterval(() => { if (!pending) pending = deliverPush().catch(error => console.error('Push worker:', error.name)).finally(() => { pending = undefined; }); }, 1000);
  return async () => { clearInterval(timer); await pending; };
}
