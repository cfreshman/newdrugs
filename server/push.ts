import { randomUUID } from 'node:crypto';
import type { ClientSession } from 'mongodb';
import { z } from 'zod';
import webpush from 'web-push';
import { rows, transaction } from './db';
import { config } from './config';
import { hash, users } from './auth';
import { AppError, requireValue } from './errors';
import { logNotificationText, notificationActor } from './notificationText';
import {notificationEnabled} from './notificationSettings';
import {notificationType} from '../shared/notificationSettings';
import {isPersonHidden} from './peopleHides';

interface PushEvent { _id: string; userId: string; actorId: string; connectionId: string; kind: 'message' | 'invitation' | 'log_invitation' | 'log_added' | 'log_update' | 'iou' | 'quiz' | 'dinder_match' | 'dinder_message' | 'agent_update' | 'automation_status' | 'connection_accepted' | 'call' | 'post_like' | 'post_reply' | 'post_mention' | 'alert' | 'review'; eventId: string; status: string; availableAt: number; attempts: number; delivered: string[]; expiresAt: Date; lease?: string }
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
export async function enqueueLogPush(userId:string,actorId:string,entryId:string,revision:number,session:ClientSession|undefined,kind:'log_added'|'log_update'){
  if(!pushConfigured())return;
  await outbox().updateOne({_id:hash(`log:${entryId}:${revision}:${userId}`)},{$setOnInsert:{userId,actorId,connectionId:entryId,kind,eventId:String(revision),status:'pending',availableAt:Date.now()+1500,attempts:0,delivered:[],expiresAt:new Date(Date.now()+86400000)}},{session,upsert:true});
}
export async function enqueueInboxPush(userId: string, itemId: string, session: ClientSession) {
  if (!pushConfigured()) return;
  await outbox().updateOne({ _id: hash(`inbox:${itemId}`) }, { $setOnInsert: { userId, actorId: userId, connectionId: itemId, kind: 'agent_update', eventId: itemId, status: 'pending', availableAt: Date.now() + 1500, attempts: 0, delivered: [], expiresAt: new Date(Date.now() + 86400000) } }, { session, upsert: true });
}
export async function enqueueAutomationPush(userId:string, eventId:string, automationId:string, session?:ClientSession) {
  if (!pushConfigured()) return;
  await outbox().updateOne({_id:hash(eventId)},{$setOnInsert:{userId,actorId:userId,connectionId:automationId,kind:'automation_status',eventId,status:'pending',availableAt:Date.now()+1500,attempts:0,delivered:[],expiresAt:new Date(Date.now()+86400000)}},{session,upsert:true});
}
export async function enqueueStoredPush(userId:string,actorId:string,resourceId:string,kind:PushEvent['kind'],notificationId:string,session?:ClientSession){
 if(!pushConfigured())return;
 await outbox().updateOne({_id:hash(`notice:${notificationId}`)},{$setOnInsert:{userId,actorId,connectionId:resourceId,kind,eventId:notificationId,status:'pending',availableAt:Date.now()+1500,attempts:0,delivered:[],expiresAt:new Date(Date.now()+86400000)}},{session,upsert:true});
}
export async function enqueueReviewPush(userId:string,runId:string){if(!pushConfigured()||!await notificationEnabled(userId,'review'))return;await outbox().updateOne({_id:hash(`review:${runId}`)},{$setOnInsert:{userId,actorId:userId,connectionId:runId,kind:'review',eventId:runId,status:'pending',availableAt:Date.now()+1500,attempts:0,delivered:[],expiresAt:new Date(Date.now()+86400000)}},{upsert:true});}
export async function pushStillRelevant(event: { userId: unknown; actorId: unknown; connectionId: unknown; kind: unknown; eventId: unknown }) {
  const userId = String(event.userId), actorId = String(event.actorId), connectionId = String(event.connectionId);
  if(event.kind==='log_invitation')return false;
  const type=notificationType.safeParse(event.kind);if(type.success&&!await notificationEnabled(userId,type.data))return false;
  if(event.kind==='review')return Boolean(await users().findOne({_id:userId,activeRun:String(event.eventId)})&&await rows('runs').findOne({_id:String(event.eventId),userId,status:'waiting_for_approval'}));
  if (event.kind === 'automation_status') return Boolean(await rows('notifications').findOne({_id:String(event.eventId),userId,readAt:null}));
  if (event.kind === 'agent_update') return Boolean(await rows('agentInbox').findOne({ _id: String(event.eventId), userId, readAt: null, archivedAt: null }));
  if(await users().findOne({_id:actorId,suspendedAt:{$type:'string'}}))return false;
  if (!await users().findOne({ _id: userId, suspendedAt:null, handle: { $type: 'string' } })) return false;
  if (await rows('blocks').findOne({ members: { $all: [userId, actorId] } })) return false;
  if(event.kind==='dinder_match'||event.kind==='dinder_message')return Boolean(await rows('notifications').findOne({_id:String(event.eventId),userId,readAt:null})&&await rows('dinderMatches').findOne({_id:connectionId,members:{$all:[userId,actorId]}}));
  if(event.kind==='iou')return Boolean(await rows('notifications').findOne({_id:String(event.eventId),userId,kind:'iou',readAt:null})&&await rows('iousLedgers').findOne({_id:[userId,actorId].sort().join(':'),members:userId}));
  if(event.kind==='quiz')return Boolean(await rows('notifications').findOne({_id:String(event.eventId),userId,kind:'quiz',readAt:null})&&await rows('quizzes').findOne({_id:connectionId,members:{$all:[userId,actorId]}}));
  if(event.kind==='log_invitation'||event.kind==='log_added'||event.kind==='log_update'){
    const {logEntryFor}=await import('./log');try{const entry=await logEntryFor(userId,connectionId);if(event.kind==='log_invitation'?!entry.invited.includes(userId):!entry.members.includes(userId))return false;}catch(error){if(error instanceof AppError&&[403,404].includes(error.status))return false;throw error;}
    return Boolean(await rows('notifications').findOne({_id:`log:${connectionId}:${userId}`,userId,actorId,kind:event.kind,revision:Number(event.eventId),readAt:null}));
  }
  if(['connection_accepted','call','post_like','post_reply','post_mention','alert'].includes(String(event.kind))){
    const notice=await rows('notifications').findOne({_id:String(event.eventId),userId,readAt:null});if(!notice)return false;
    if(await isPersonHidden(userId,actorId))return false;
    if(notice.alertType==='security_login'||notice.alertType==='security_credential')return false;
    if(notice.ruleId&&!await rows('notificationRules').findOne({_id:String(notice.ruleId),userId,enabled:true},{projection:{_id:1}}))return false;
    if(event.kind==='post_like'||event.kind==='post_reply'||event.kind==='post_mention')return Boolean(await rows('posts').findOne({_id:connectionId,deletedAt:{$exists:false},moderatedAt:{$exists:false}},{projection:{_id:1}}));
    if(event.kind==='alert'){
      if(notice.resourceType==='space')return Boolean(await rows('spaces').findOne({_id:connectionId,status:'live'},{projection:{_id:1}}));
      if(notice.resourceType==='post')return Boolean(await rows('posts').findOne({_id:connectionId,deletedAt:{$exists:false},moderatedAt:{$exists:false}},{projection:{_id:1}}));
      if(notice.resourceType==='person')return notice.alertType==='birthday'?Boolean(await rows('connections').findOne({members:{$all:[userId,actorId]},status:'accepted'},{projection:{_id:1}})):Boolean(await users().findOne({_id:actorId,discoverable:true,suspendedAt:null},{projection:{_id:1}})&&await rows('circlePairs').findOne({_id:[userId,actorId].sort().join(':'),mutualCount:{$gt:0}},{projection:{_id:1}}));
      if(notice.resourceType==='log'){const {logEntryFor}=await import('./log');try{return Boolean(await logEntryFor(userId,connectionId));}catch{return false;}}
      return true;
    }
    return Boolean(await rows('connections').findOne({_id:connectionId,members:userId},{projection:{_id:1}}));
  }
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
  const actor = notificationActor(await users().findOne({ _id: event.actorId }, { projection: { handle: 1, name: 1 } }));
  let title='New Drugs',body='';
  if (event.kind === 'log_added' || event.kind === 'log_invitation' || event.kind === 'log_update') {
    const { logEntryFor } = await import('./log');
    // Resolve current authorized metadata instead of sending a stale stored title.
    let entry;
    try { entry = await logEntryFor(event.userId, event.connectionId); }
    catch (error) { if(error instanceof AppError&&[403,404].includes(error.status)){await finish('skipped');return;}throw error; }
    title = logNotificationText(event.kind, actor, entry.title);
  } else {
    if(event.kind==='dinder_match'||event.kind==='dinder_message'){const notice=await rows('notifications').findOne({_id:String(event.eventId),userId:String(event.userId)},{projection:{text:1}});title=event.kind==='dinder_match'?`Cook ${String(notice?.text||'dinner')} with ${actor}`:`Dinder message from ${actor}`;body='';}
    else if(event.kind==='alert'||event.kind==='iou'){const notice=await rows('notifications').findOne({_id:String(event.eventId),userId:String(event.userId)},{projection:{title:1,text:1}});title=String(notice?.title||'IOU update');body=String(notice?.text||'');}
    else if(event.kind==='automation_status'){const notice=await rows('notifications').findOne({_id:String(event.eventId),userId:String(event.userId)},{projection:{title:1,text:1}});title=String(notice?.title||'Automation update');body=String(notice?.text||'');}
    else if(event.kind==='agent_update'){const item=await rows('agentInbox').findOne({_id:String(event.eventId),userId:String(event.userId)},{projection:{title:1}});title=String(item?.title||'Agent update');}
    else title=event.kind === 'review'?'Your agent has a change to review':event.kind === 'invitation' ? `${actor} invited you to connect` : event.kind==='connection_accepted'?`${actor} accepted your invitation` : event.kind==='call'?`Video call from ${actor}` : event.kind==='post_like'?`${actor} liked your post` : event.kind==='post_reply'?`${actor} replied to your post` : event.kind==='post_mention'?`${actor} mentioned you` : event.kind==='quiz'?`${actor} sent you a quiz` : `${actor} sent you a message`;
    if(event.kind==='post_mention'){const notice=await rows('notifications').findOne({_id:String(event.eventId),userId:String(event.userId)},{projection:{text:1}});body=String(notice?.text||'');}
  }
  const devices = await rows('pushSubscriptions').find({ userId: event.userId, revokedAt: null }).limit(8).toArray();
  let retry = false;
  for (const device of devices) {
    if ((event.delivered as string[]).includes(device._id)) continue;
    if (!await rows('pushSubscriptions').findOne({ _id: device._id, userId: event.userId, revokedAt: null, sessionId: device.sessionId })) continue;
    if (!await rows('sessions').findOne({ _id: String(device.sessionId), userId: event.userId, expiresAt: { $gt: new Date() } })) { await revokePush(String(event.userId), String(device.deviceId)); continue; }
    if (!await pushStillRelevant(event)) break;
    try {
      const target=event.kind==='alert'?String((await rows('notifications').findOne({_id:event.eventId},{projection:{resourceType:1}}))?.resourceType||''):'',section=event.kind==='dinder_match'||event.kind==='dinder_message'?'dinder':event.kind==='iou'?'ious':event.kind==='quiz'?'quizzes':['log_invitation','log_added','log_update'].includes(event.kind)?'log':event.kind==='automation_status'?'automations':event.kind==='agent_update'?'inbox':event.kind==='review'?'chat':['post_like','post_reply','post_mention'].includes(event.kind)?'posts':event.kind==='alert'?target==='space'?'spaces':target==='post'?'posts':target==='person'?'people':target==='log'?'log':target==='credits'?'billing':target==='storage'?'storage':target==='account'?'account':'agents':'messages';
      const alert=event.kind==='alert'?await rows('notifications').findOne({_id:event.eventId},{projection:{photoId:1}}):null;
      await send({ endpoint: String(device.endpoint), keys: device.keys as { p256dh: string; auth: string } }, JSON.stringify({ title, body,kind:event.kind,url: section==='chat'?'/':['billing','storage','agents','account'].includes(section)?`/${section}`:`/${section}/${encodeURIComponent(String(event.kind==='quiz'?event.actorId:event.connectionId))}`, tag: `notice-${hash(`${event.kind}:${String(event.connectionId)}`).slice(0, 24)}`,...(alert?.photoId?{icon:`/api/files/${encodeURIComponent(String(alert.photoId))}`}:{}) }), { vapidDetails: { subject: config.VAPID_SUBJECT, publicKey: config.VAPID_PUBLIC_KEY, privateKey: config.VAPID_PRIVATE_KEY }, timeout: 10000, TTL: 3600, urgency: 'normal', topic: hash(String(event.connectionId)).slice(0, 32) });
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
