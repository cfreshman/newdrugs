import type { Request, Response } from 'express';
import type { ChangeStream, ChangeStreamDocument, Document } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { db, rows, transaction } from './db';
import { browserActor, hash, profile, users } from './auth';
import { config } from './config';
import { runs, wallet } from './wallet';
import { runView } from './agent';
import { conversation } from './operations';
import { AppError, requireValue } from './errors';
import type { LiveChange, LiveTopic } from '../shared/liveState';
import { notificationState } from './notifications';

const topics: LiveTopic[] = ['user', 'wallet', 'messages', 'run', 'notifications'];
type Subscriber = { userId: string; sessionId: string; dirty(topics: LiveTopic[]): void; records(keys: string[]): void; close(): void };
const subscribers = new Set<Subscriber>();
let watcher: ChangeStream | undefined;
let starting: Promise<void> | undefined;

async function changed(event: ChangeStreamDocument<Document>) {
  if (!('ns' in event) || !('coll' in event.ns)) { for (const listener of subscribers) listener.close(); return; }
  const collection = event.ns.coll;
  const document = 'fullDocument' in event ? event.fullDocument : null;
  const key = 'documentKey' in event ? String(event.documentKey._id) : '';
  let members = document?.members as string[] | undefined;
  if (collection === 'directMessages' && document?.connectionId) members = (await rows('connections').findOne({ _id: String(document.connectionId) }, { projection: { members: 1 } }))?.members as string[] | undefined;
  if (collection === 'blocks' && !members) members = key.split(':');
  for (const listener of subscribers) {
    if (collection === 'searchDocuments') { listener.records(['people','posts']); continue; }
    if (collection === 'posts' || collection === 'postLikes') { listener.records(['posts']); continue; }
    if (['connections', 'directMessages', 'blocks'].includes(collection)) {
      if (members?.includes(listener.userId)) { listener.dirty(['notifications']); listener.records(['connections', 'messages', 'people', 'posts']); }
      continue;
    }
    if (collection === 'uploads') { if (document?.userId === listener.userId || !document) listener.records(['storage']); continue; }
    if (collection === 'notifications') { if (document?.userId === listener.userId || !document) listener.dirty(['notifications']); continue; }
    if (collection === 'users') {
      const publicFields = 'updateDescription' in event ? Object.keys(event.updateDescription.updatedFields || {}) : [];
      if (publicFields.some(field => /^(name|handle|photos)(\.|$)/.test(field))) listener.records(['posts']);
      if (document?.discoverable || publicFields.includes('discoverable')) {
        if (event.operationType === 'insert' || publicFields.some(field => /^(name|handle|bio|interests|photos|area|discoverable)(\.|$)/.test(field))) listener.records(['people']);
      }
    }
    if (collection === 'sessions') { if (key === listener.sessionId) listener.dirty(topics); continue; }
    const owner = collection === 'users' ? key : document?.userId;
    if (owner && owner !== listener.userId) continue;
    // Deletes contain only a key. Refetch the listener's own projection, never
    // pass a database document or someone else's payload through to a client.
    if (!owner || collection === 'users' || collection === 'messages' || collection === 'runs' && ['completed', 'cancelled', 'failed'].includes(document?.status)) listener.dirty(topics);
    else {
      listener.dirty([collection === 'ledger' ? 'wallet' : 'run']);
      if (collection === 'runs' && 'updateDescription' in event && Object.keys(event.updateDescription.updatedFields || {}).some(key => key === 'status' || key.startsWith('approvals'))) listener.dirty(['notifications']);
    }
  }
}
async function startWatch() {
  if (starting) return starting;
  starting = (async () => {
    const stream = db().watch([{ $match: { 'ns.coll': { $in: ['users', 'runs', 'messages', 'ledger', 'sessions', 'connections', 'directMessages', 'blocks', 'posts', 'postLikes', 'notifications', 'uploads', 'searchDocuments'] } } }], { fullDocument: 'updateLookup', maxAwaitTimeMS: 1000 });
    watcher = stream;
    // Establish the cursor before taking a snapshot. All later changes either
    // appear in that snapshot or cause a fresh projection (often both).
    try {
      const first = await stream.tryNext(); if (first) await changed(first);
    } catch (error) { starting = undefined; watcher = undefined; await stream.close(); throw error; }
    void (async () => {
      try { for await (const event of stream) await changed(event); }
      catch (error) { if (watcher === stream) console.error('Live state connection interrupted', { name: error instanceof Error ? error.name : 'Error' }); }
      finally { if (watcher === stream) { watcher = undefined; starting = undefined; for (const listener of subscribers) listener.close(); } }
    })();
  })();
  return starting;
}

export async function readLiveState(userId: string, requested: LiveTopic[] = topics): Promise<LiveChange> {
  return transaction(async session => {
    const owner = requireValue(await users().findOne({ _id: userId }, { session }));
    const result: LiveChange = {};
    if (requested.includes('user')) result.user = profile(owner);
    if (requested.includes('wallet')) result.wallet = await wallet(userId, session, owner);
    if (requested.includes('messages')) result.messages = await conversation(userId, 60, undefined, session);
    if (requested.includes('notifications')) result.notifications = await notificationState(userId, session);
    if (requested.includes('run')) { const active = owner.activeRun && await runs().findOne({ _id: owner.activeRun, userId }, { session }); result.run = active ? runView(active) : null; }
    return result;
  });
}

export async function streamLiveState(req: Request, res: Response) {
  const actor = browserActor(req), userId = actor.userId;
  if (subscribers.size >= 128 || [...subscribers].filter(listener => listener.userId === userId).length >= 8) throw new AppError(429, 'live_limit', 'Too many live connections.');
  const sessionId = hash(req.cookies[config.SESSION_COOKIE]);
  let closed = false, flushing = false, sequence = 0;
  let timer: ReturnType<typeof setTimeout> | undefined, heartbeat: ReturnType<typeof setInterval> | undefined;
  const dirty = new Set<LiveTopic>(topics), sent = new Map<LiveTopic, string>(), epoch = randomUUID();
  const close = () => { if (closed) return; closed = true; clearTimeout(timer); clearInterval(heartbeat); subscribers.delete(listener); if (!res.writableEnded) res.end(); };
  const schedule = (changed: LiveTopic[]) => {
    if (closed) return;
    changed.forEach(topic => dirty.add(topic));
    if (!timer && !flushing) timer = setTimeout(() => { timer = undefined; void flush(); }, 20);
  };
  const listener: Subscriber = { userId, sessionId, dirty: schedule, records: keys => { if (!closed) res.write(`event: records\ndata: ${JSON.stringify({ keys })}\n\n`); }, close };
  const flush = async () => {
    if (closed || flushing) return;
    if (res.writableLength > 1_000_000) { close(); return; }
    flushing = true;
    try {
      const credential = await rows('sessions').findOne({ _id: sessionId, userId, expiresAt: { $gt: new Date() } });
      if (!credential) { if (!closed) res.write('event: auth-changed\ndata: {}\n\n'); close(); return; }
      const requested = [...dirty]; dirty.clear();
      const current = await readLiveState(userId, requested), change: LiveChange = {};
      for (const topic of requested) {
        const serialized = JSON.stringify(current[topic]);
        if (sent.get(topic) !== serialized) { Object.assign(change, { [topic]: current[topic] }); sent.set(topic, serialized); }
      }
      if (!closed && Object.keys(change).length) res.write(`event: state\ndata: ${JSON.stringify({ userId, epoch, sequence: ++sequence, change })}\n\n`);
    } catch (error) { console.error('Live projection interrupted', { name: error instanceof Error ? error.name : 'Error' }); close(); }
    finally { flushing = false; if (dirty.size && !closed) schedule([]); }
  };
  res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
  res.flushHeaders(); res.write('retry: 1000\n\n');
  res.on('close', close);
  subscribers.add(listener);
  try { await startWatch(); if (!closed) await flush(); }
  catch { close(); return; }
  heartbeat = setInterval(() => { if (!closed) { res.write(': heartbeat\n\n'); schedule([]); } }, 15000);
}

export async function stopLiveState() {
  for (const listener of subscribers) listener.close();
  const stream = watcher; watcher = undefined; starting = undefined;
  await stream?.close();
}
