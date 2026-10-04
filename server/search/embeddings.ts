import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import { rows } from '../db';
import { config } from '../config';
import { hashText, normalize } from './ranking';
import { DIMENSIONS, EMBEDDING_MODEL, INDEX_VERSION } from './model';

const inflight = new Map<string, Promise<number[]>>();
export async function embed(text: string, kind: 'document' | 'query', namespace = 'public'): Promise<number[]> {
  const key = hashText(`${namespace}:${INDEX_VERSION}:${EMBEDDING_MODEL}:${text}`);
  if (inflight.has(key)) return inflight.get(key)!;
  const work = (async () => {
    if (kind === 'query') { const cached = await rows<{ _id: string; vector: number[]; expiresAt: Date }>('searchQueryVectors').findOne({ _id: key, expiresAt: { $gt: new Date() } }); if (cached) return cached.vector; }
    if (!config.aiEnabled) throw new Error('embedding_unavailable');
    // UTF-8 byte count is a conservative token upper bound. Reserve before the call.
    const reserved = (Buffer.byteLength(text) + 32) * 20, day = new Date().toISOString().slice(0, 10);
    const budget = rows<{ _id: string; spentNanos: number }>('searchBudget');
    await budget.updateOne({ _id: day }, { $setOnInsert: { spentNanos: 0 } }, { upsert: true });
    const allowed = await budget.updateOne({ _id: day, spentNanos: { $lte: config.SEARCH_DAILY_BUDGET_NANOS - reserved } }, { $inc: { spentNanos: reserved } });
    if (!allowed.modifiedCount) throw new Error('embedding_budget');
    const client = new OpenAI({ apiKey: config.OPENAI_API_KEY, timeout: 30000, maxRetries: 0 });
    // On an ambiguous provider failure keep the reservation: do not assume it was free.
    const response = await client.embeddings.create({ model: EMBEDDING_MODEL, dimensions: DIMENSIONS, encoding_format: 'float', input: text });
    const vector = response.data[0]?.embedding;
    if (!vector || vector.length !== DIMENSIONS || !vector.every(Number.isFinite)) throw new Error('embedding_invalid');
    const costNanos = response.usage.total_tokens * 20;
    await budget.updateOne({ _id: day }, { $inc: { spentNanos: costNanos - reserved } });
    await rows('platformUsage').insertOne({ _id: randomUUID(), feature: namespace === 'public' ? 'social_search' : namespace.startsWith('log:') ? 'log_search' : namespace.startsWith('dm:')?'dm_search':namespace.startsWith('global:')?'global_search':'chat_search', kind, model: EMBEDDING_MODEL, tokens: response.usage.total_tokens, costNanos, createdAt: new Date().toISOString() });
    const normalized = normalize(vector);
    if (kind === 'query') await rows('searchQueryVectors').updateOne({ _id: key }, { $set: { vector: normalized, expiresAt: new Date(Date.now() + 86400000) } }, { upsert: true });
    return normalized;
  })();
  inflight.set(key, work); try { return await work; } finally { inflight.delete(key); }
}
