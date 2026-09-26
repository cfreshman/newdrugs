import { semanticCandidate } from './ranking';
import { randomUUID } from 'node:crypto';
import type { ClientSession } from 'mongodb';
import { rows, transaction, type Row } from '../db';
import { users, type Actor } from '../auth';
import { AppError, requireValue } from '../errors';
import { config } from '../config';
import { embed } from './embeddings';
import { DIMENSIONS, EMBEDDING_MODEL } from './model';
import { dot, hashText, words } from './ranking';
import type { ChatSearchInput, ChatSearchResult } from '../../shared/chatSearch';

export const CHAT_INDEX_VERSION = `private-chat-v1:${EMBEDDING_MODEL}:${DIMENSIONS}`;
interface Job { _id: string; userId: string; messageId: string; revision: string; attempts: number; availableAt: number; lease?: string; error?: string }
interface Chunk { _id: string; userId: string; messageId: string; sourceHash: string; offset: number; text: string; role: 'user' | 'assistant'; createdAt: string; vector: number[]; indexVersion: string }
const jobs = () => rows<Job>('chatSearchJobs');
const chunks = () => rows<Chunk>('chatSearchChunks');
export const chatMessageHash = (message: Row) => hashText(JSON.stringify([CHAT_INDEX_VERSION, message.userId, message.role, message.text]));
export function chatPassages(text: string) {
  const parts: { offset: number; text: string }[] = [];
  for (let offset = 0; offset < text.length;) {
    const end = Math.min(text.length, offset + 2000);
    parts.push({ offset, text: text.slice(offset, end) });
    if (end === text.length) break;
    offset = end - 200;
  }
  return parts;
}
function searchable(message: Row | null): message is Row {
  return Boolean(message && ['user', 'assistant'].includes(String(message.role)) && message.kind !== 'introduction' && typeof message.text === 'string' && message.text.trim() && !['pending', 'failed'].includes(String(message.status)));
}
export async function enqueueChatSearch(userId: string, messageId: string, session?: ClientSession) {
  await jobs().updateOne({ _id: hashText(`${userId}:${messageId}`) }, { $set: { userId, messageId, revision: randomUUID(), attempts: 0, availableAt: Date.now() }, $unset: { lease: '', error: '' } }, { session, upsert: true });
}
export async function indexChatMessage(embedding = embed) {
  const lease = randomUUID();
  const job = await jobs().findOneAndUpdate({ availableAt: { $lte: Date.now() } }, { $set: { lease, availableAt: Date.now() + 300000 }, $inc: { attempts: 1 } }, { sort: { availableAt: 1 }, returnDocument: 'after' });
  if (!job) return false;
  try {
    const owner = await users().findOne({ _id: job.userId });
    const source = owner && await rows('messages').findOne({ _id: job.messageId, userId: job.userId });
    const sourceHash = source ? chatMessageHash(source) : '';
    const existing = await chunks().find({ userId: job.userId, messageId: job.messageId }).toArray();
    const next: Chunk[] = [];
    if (searchable(source)) for (const part of chatPassages(String(source.text))) {
      const previous = existing.find(chunk => chunk.offset === part.offset && chunk.text === part.text && chunk.indexVersion === CHAT_INDEX_VERSION);
      const vector = previous?.vector || await embedding(part.text, 'document', `chat:${job.userId}`);
      if (vector.length !== DIMENSIONS || !vector.every(Number.isFinite)) throw Error('embedding_invalid');
      next.push({ _id: hashText(`${job.userId}:${source._id}:${part.offset}`), userId: job.userId, messageId: source._id, sourceHash, ...part, role: source.role as Chunk['role'], createdAt: String(source.createdAt), vector, indexVersion: CHAT_INDEX_VERSION });
      const held = await jobs().updateOne({ _id: job._id, revision: job.revision, lease }, { $set: { availableAt: Date.now() + 300000 } });
      if (!held.matchedCount) return true;
    }
    await transaction(async session => {
      const owned = await jobs().deleteOne({ _id: job._id, revision: job.revision, lease }, { session });
      if (!owned.deletedCount) return;
      const current = await rows('messages').findOne({ _id: job.messageId, userId: job.userId }, { session });
      if ((current ? chatMessageHash(current) : '') !== sourceHash) { await enqueueChatSearch(job.userId, job.messageId, session); return; }
      await chunks().deleteMany({ userId: job.userId, messageId: job.messageId }, { session });
      if (next.length) await chunks().insertMany(next, { session });
    });
  } catch (error) {
    const message = error instanceof Error && /^embedding_/.test(error.message) ? error.message : 'index_failure';
    await jobs().updateOne({ _id: job._id, revision: job.revision, lease }, { $set: { error: message, availableAt: Date.now() + Math.min(3600000, 2000 * 2 ** Math.min(job.attempts, 11)) }, $unset: { lease: '' } });
    console.error('Private chat indexing retry', { error: message });
  }
  return true;
}
export async function backfillChatSearch() {
  const state = await rows('chatSearchMeta').findOne({ _id: CHAT_INDEX_VERSION });
  if (state?.done) return;
  const messages = await rows('messages').find({ ...(state?.cursor ? { _id: { $gt: String(state.cursor) } } : {}), kind: { $ne: 'introduction' } }).sort({ _id: 1 }).limit(50).toArray();
  await transaction(async session => {
    for (const message of messages) if (searchable(message) && !await chunks().findOne({ userId: String(message.userId), messageId: message._id, indexVersion: CHAT_INDEX_VERSION }, { session }) && !await jobs().findOne({ userId: String(message.userId), messageId: message._id }, { session })) await enqueueChatSearch(String(message.userId), message._id, session);
    await rows('chatSearchMeta').updateOne({ _id: CHAT_INDEX_VERSION }, { $set: { cursor: messages.at(-1)?._id || state?.cursor || '', done: messages.length < 50 } }, { session, upsert: true });
  });
}
export function startChatSearchWorker() {
  let stopped = false, pending: Promise<void> | undefined, cycles = 0;
  const tick = () => { if (stopped || pending || !config.aiEnabled) return; pending = (async () => {
    if (cycles++ % 10 === 0) await backfillChatSearch();
    for (let i = 0; i < 4 && !stopped && await indexChatMessage(); i++);
  })().catch(error => console.error('Chat search worker:', error.name)).finally(() => { pending = undefined; }); };
  const timer = setInterval(tick, 2000); tick();
  return async () => { stopped = true; clearInterval(timer); await pending; };
}
interface Ranked { messageId: string; sourceHash: string; offset: number; score: number }
interface Snapshot { _id: string; userId: string; identity: string; ranked: Ranked[]; mode: 'hybrid' | 'keyword'; indexing: boolean; notices: string[]; expiresAt: Date }
const snapshots = () => rows<Snapshot>('chatSearchResults');
export async function searchChat(input: ChatSearchInput, actor: Actor, embedding = embed): Promise<ChatSearchResult> {
  requireValue(await users().findOne({ _id: actor.userId, handle: { $type: 'string' } }), 'Create an account to search your chat.');
  const userId = actor.userId, limit = input.limit || 20, identity = hashText(JSON.stringify([input.query.trim(), input.role || 'all']));
  let snapshot: Snapshot, offset = 0;
  if (input.cursor) {
    const [id, position] = input.cursor.split('.'); offset = Number(position);
    snapshot = requireValue(await snapshots().findOne({ _id: id, userId, expiresAt: { $gt: new Date() } }), 'This search expired. Search again.');
    if (snapshot.identity !== identity || !Number.isSafeInteger(offset) || offset < 0 || offset > snapshot.ranked.length) throw new AppError(409, 'search_changed', 'Start this search again without a cursor.');
  } else {
    const rateId = `chat:${userId}:${Math.floor(Date.now() / 60000)}`;
    const rate = await rows<{ _id: string; count: number }>('searchRates').findOneAndUpdate({ _id: rateId }, { $inc: { count: 1 }, $set: { expiresAt: new Date(Date.now() + 120000) } }, { upsert: true, returnDocument: 'after' });
    if (rate && rate.count > 20) throw new AppError(429, 'search_rate', 'Give search a moment before trying again.');
    let vector: number[] | undefined;
    const notices: string[] = [];
    try { vector = await embedding(input.query, 'query', `chat:${userId}`); } catch { notices.push('Semantic search is temporarily unavailable. Showing keyword matches.'); }
    const terms = [...new Set(words(input.query))];
    const lexical = (text: string) => { const tokens = new Set(words(text)); return terms.length ? terms.filter(term => tokens.has(term)).length / terms.length : 0; };
    const scores = new Map<string, Ranked>();
    const offer = (rank: Ranked) => {
      if (!scores.has(rank.messageId) || scores.get(rank.messageId)!.score < rank.score) scores.set(rank.messageId, rank);
      if (scores.size > 200) { const best = [...scores.values()].sort((a, b) => b.score - a.score || a.messageId.localeCompare(b.messageId)).slice(0, 100); scores.clear(); best.forEach(rank => scores.set(rank.messageId, rank)); }
    };
    const role = input.role && input.role !== 'all' ? { role: input.role } : {};
    // Stream only this owner's vectors. No shared ANN graph can accidentally expose private chat.
    const cursor = chunks().find({ userId, indexVersion: CHAT_INDEX_VERSION, ...role }).batchSize(32).maxTimeMS(15000);
    for await (const chunk of cursor) {
      const dense = vector ? dot(vector, chunk.vector) : 0, lex = lexical(chunk.text);
      if (!semanticCandidate(dense, lex) && !lex) continue;
      offer({ messageId: chunk.messageId, sourceHash: chunk.sourceHash, offset: chunk.offset, score: vector ? .9 * Math.max(0, dense) + .1 * lex : lex });
    }
    // Fresh text remains findable while its durable embedding job is pending.
    if (terms.length) {
      const pattern = terms.slice(0, 20).map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      const fresh = await rows('messages').find({ userId, ...role, kind: { $ne: 'introduction' }, text: { $regex: pattern, $options: 'i' } }).sort({ createdAt: -1, _id: -1 }).limit(100).toArray();
      for (const message of fresh) if (searchable(message) && !scores.has(message._id)) offer({ messageId: message._id, sourceHash: chatMessageHash(message), offset: Math.max(0, String(message.text).toLowerCase().search(new RegExp(pattern, 'i')) - 100), score: vector ? .1 * lexical(String(message.text)) : lexical(String(message.text)) });
    }
    const indexing = Boolean(await jobs().findOne({ userId })) || !Boolean((await rows('chatSearchMeta').findOne({ _id: CHAT_INDEX_VERSION }))?.done);
    if (indexing) notices.push('Older or recent messages are still being indexed.');
    snapshot = { _id: randomUUID(), userId, identity, ranked: [...scores.values()].sort((a, b) => b.score - a.score || a.messageId.localeCompare(b.messageId)).slice(0, 100), mode: vector ? 'hybrid' : 'keyword', indexing, notices, expiresAt: new Date(Date.now() + 600000) };
    await snapshots().insertOne(snapshot);
    const old = await snapshots().find({ userId }).sort({ expiresAt: -1 }).skip(20).project({ _id: 1 }).toArray();
    if (old.length) await snapshots().deleteMany({ userId, _id: { $in: old.map(row => row._id) } });
  }
  const items: ChatSearchResult['items'] = [];
  while (offset < snapshot.ranked.length && items.length < limit) {
    const ranked = snapshot.ranked.slice(offset, offset + limit - items.length); offset += ranked.length;
    const source = await rows('messages').find({ userId, _id: { $in: ranked.map(rank => rank.messageId) } }).toArray();
    for (const rank of ranked) {
      const message = source.find(message => message._id === rank.messageId);
      if (!message || !searchable(message) || chatMessageHash(message) !== rank.sourceHash) continue;
      items.push({ id: message._id, role: message.role as 'user' | 'assistant', text: String(message.text).slice(rank.offset, rank.offset + 500), createdAt: String(message.createdAt), score: rank.score });
    }
  }
  return { items, nextCursor: offset < snapshot.ranked.length ? `${snapshot._id}.${offset}` : null, mode: snapshot.mode, indexing: snapshot.indexing, notices: snapshot.notices };
}
