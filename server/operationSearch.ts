import { backgroundCanRead } from './backgroundAuthority';
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from './config';
import { rows } from './db';
import { hash, type Actor } from './auth';
import { operations, describeOperation } from '../shared/catalog';
import { AppError } from './errors';

export const searchSchema = z.strictObject({ query: z.string().trim().max(500).default(''), mode: z.enum(['semantic', 'keyword']).default('semantic'), limit: z.number().int().min(1).max(50).default(12), cursor: z.string().max(1000).optional() });
const model = 'text-embedding-3-small';
const dimensions = 512;
type Vector = { _id: string; vector: number[]; expiresAt?: Date };
const validVector = (vector: unknown): vector is number[] => Array.isArray(vector) && vector.length === dimensions && vector.every(n => typeof n === 'number' && Number.isFinite(n)) && Math.hypot(...vector) > 0;
const inflight = new Map<string, Promise<number[][]>>();
async function vectors(texts: string[], kind: 'catalog' | 'query'): Promise<number[][]> {
  const ids = texts.map(text => hash(`${model}:${dimensions}:${text}`));
  const key = ids.join(':');
  if (inflight.has(key)) return inflight.get(key)!;
  const work = (async () => {
    const collection = rows<Vector>('operationEmbeddings');
    const stored = await collection.find({ _id: { $in: ids }, $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] }).toArray();
    const available = new Map(stored.filter(r => validVector(r.vector)).map(r => [r._id, r.vector]));
    const missing = ids.map((id, index) => ({ id, index })).filter(({ id }) => !available.has(id));
    if (missing.length) {
      if (!config.aiEnabled) throw new Error('Embeddings unavailable.');
      const client = new OpenAI({ apiKey: config.OPENAI_API_KEY, timeout: 5000, maxRetries: 0 });
      const response = await client.embeddings.create({ model, dimensions, encoding_format: 'float', input: missing.map(({ index }) => texts[index]) });
      for (const item of response.data) {
        const entry = missing[item.index]; if (!entry || !validVector(item.embedding)) throw new Error('Invalid discovery vector.');
        available.set(entry.id, item.embedding);
        await collection.updateOne({ _id: entry.id }, { $set: { vector: item.embedding, ...(kind === 'query' ? { expiresAt: new Date(Date.now() + 86400000) } : {}) } }, { upsert: true });
      }
      await rows('platformUsage').insertOne({ _id: randomUUID(), feature: 'operation_discovery', kind, model, tokens: response.usage.total_tokens, costNanos: response.usage.total_tokens * 20, createdAt: new Date().toISOString() });
    }
    return ids.map(id => { const v = available.get(id); if (!v) throw new Error('Incomplete discovery index.'); return v; });
  })();
  inflight.set(key, work);
  try { return await work; } finally { inflight.delete(key); }
}
export function cosine(a: number[], b: number[]) {
  if (a.length !== b.length || !a.length) return 0;
  const denominator = Math.hypot(...a) * Math.hypot(...b);
  return denominator ? a.reduce((n, value, index) => n + value * b[index], 0) / denominator : 0;
}
/** Search meaningful catalog documentation, without JSON validation boilerplate. */
export function operationSearchText(op:{name:string;kind:string;description:string;schema:z.ZodType}){
 const fields:string[]=[];
 const visit=(schema:Record<string,any>,path:string,depth=0)=>{
  if(depth>5)return;
  if(schema.description)fields.push(`${path}: ${schema.description}`);
  if(schema.enum)fields.push(`${path}: ${schema.enum.join(', ')}`);
  for(const [name,value]of Object.entries(schema.properties||{})){fields.push(`${path}.${name}`);visit(value as Record<string,any>,`${path}.${name}`,depth+1);}
  if(schema.items)visit(schema.items,`${path}[]`,depth+1);
  for(const variant of [...(schema.anyOf||[]),...(schema.oneOf||[]),...(schema.allOf||[])])visit(variant,path,depth+1);
 };
 visit(z.toJSONSchema(op.schema),'Input');
 return [`Operation: ${op.name}`,`Kind: ${op.kind}`,op.description,...new Set(fields)].join('\n').slice(0,8000);
}
export async function searchOperations(raw: unknown, actor: Actor) {
  const input = searchSchema.parse(raw);
  const available = operations.filter(o => backgroundCanRead(actor, o.name) && (actor.source === 'browser' || o.name !== 'profile.update') && (actor.source !== 'agent' || o.agent) && (actor.scope === 'write' || o.kind === 'read'));
  const documents = available.map(operationSearchText);
  const identity = hash(JSON.stringify([input.query, input.mode, documents]));
  let offset = 0; let forcedKeyword = false; let requireSemantic=false;
  if (input.cursor) {
    try {
      const cursor = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'));
      if (cursor.identity !== identity || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0) throw new Error();
      offset = cursor.offset; forcedKeyword = cursor.mode === 'keyword'; requireSemantic=cursor.mode==='hybrid';
    } catch { throw new AppError(409, 'search_changed', 'The query or catalog changed. Start discovery again without a cursor.'); }
  }
  const query = input.query.toLowerCase();
  const stopWords = new Set(['the','and','to','a','an','my','me','i','can','how','do','for','of','is','in','on']);
  const words = (query.match(/[\p{L}\p{N}_]+/gu) || []).filter(word => !stopWords.has(word));
  const lexical = available.map((op, i) => {
    const haystack = documents[i].toLowerCase();
    return op.name.toLowerCase() === query ? 2 : words.length ? words.filter(w => haystack.includes(w)).length / words.length : 0;
  });
  let semantic: number[] | null = null;
  if (query && input.mode === 'semantic' && !forcedKeyword) {
    try { const [catalog, [queryVector]] = await Promise.all([vectors(documents, 'catalog'), vectors([query], 'query')]); semantic = catalog.map(v => cosine(v, queryVector)); }
    catch (error) { console.error('Semantic discovery fallback', { name: error instanceof Error ? error.name : 'Error' }); }
  }
  if(requireSemantic&&!semantic)throw new AppError(503,'discovery_unavailable','Semantic discovery is temporarily unavailable. Retry this same page.');
  const ranking = available.map((op, index) => ({ op, score: !query ? 1 : lexical[index] === 2 ? 2 : semantic ? .8 * Math.max(0, semantic[index]) + .2 * lexical[index] : lexical[index] }))
    .filter(({ score }, index) => !query || (semantic ? semantic[index] >= .2 || lexical[index] > 0 : score > 0))
    .sort((a, b) => b.score - a.score || a.op.name.localeCompare(b.op.name));
  const mode = semantic ? 'hybrid' : 'keyword';
  const selected = ranking.slice(offset, offset + input.limit);
  const complete = offset + selected.length >= ranking.length;
  return { matches: selected.map(({ op, score }, index) => ({ name: op.name, kind: op.kind, description: op.description, score,
    ...(offset === 0 && index < 3 ? { definition: describeOperation(op.name) } : {}) })), total: ranking.length, complete,
    nextCursor: complete ? null : Buffer.from(JSON.stringify({ identity, offset: offset + selected.length, mode })).toString('base64url'),
    retrieval: { mode, ...(query && input.mode === 'semantic' && !semantic ? { notice: 'Embeddings unavailable; these are keyword results.' } : {}) } };
}
