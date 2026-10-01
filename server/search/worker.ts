import { randomUUID } from 'node:crypto';
import { rows, transaction } from '../db';
import { users } from '../auth';
import { sourceDocument } from './sources';
import { embed } from './embeddings';
import { enqueueSearch } from './queue';
import {queueRetrieval} from './replication';
import {retrievalEnabled} from './backend';
import { INDEX_VERSION, MAX_DOCUMENTS, type SearchDocument, type SearchJob } from './model';

export async function indexOne(embedding = embed) {
  const now = Date.now(), lease = randomUUID();
  const jobs = rows<SearchJob>('searchOutbox');
  const job = await jobs.findOneAndUpdate({ $or: [{ status: { $in: ['queued','failed'] }, availableAt: { $lte: now } }, { status: 'working', leaseUntil: { $lt: now } }] },
    { $set: { status: 'working', lease, leaseUntil: now + 60000 }, $inc: { attempts: 1 } }, { sort: { availableAt: 1 }, returnDocument: 'after' });
  if (!job) return false;
  try {
    const source = await sourceDocument(job.kind, job.entityId);
    const previous = await rows<SearchDocument>('searchDocuments').findOne({ _id: job._id });
    if (!retrievalEnabled() && source && !previous && await rows('searchDocuments').countDocuments({}, { limit: MAX_DOCUMENTS }) >= MAX_DOCUMENTS) throw new Error('index_capacity');
    const vector = source ? previous?.sourceHash === source.sourceHash && previous.indexVersion === INDEX_VERSION && previous.vector ? previous.vector : await embedding(source.text, 'document') : undefined;
    await transaction(async session => {
      // This write conflicts with a simultaneous source edit/enqueue, even at snapshot isolation.
      const owned = await jobs.deleteOne({ _id: job._id, revision: job.revision, lease, leaseUntil: { $gt: Date.now() } }, { session });
      if (!owned.deletedCount) return;
      const current = await sourceDocument(job.kind, job.entityId, session);
      if (current?.sourceRevision !== source?.sourceRevision) { await enqueueSearch(job.kind, job.entityId, session); return; }
      if (source) await rows<SearchDocument>('searchDocuments').replaceOne({ _id: job._id }, { ...source, vector, indexedAt: new Date().toISOString() }, { session, upsert: true });
      else await rows('searchDocuments').deleteOne({ _id: job._id }, { session });
      await queueRetrieval('public',job._id,session);
      await rows('searchMeta').updateOne({ _id: 'generation' }, { $set: { revision: randomUUID() } }, { session, upsert: true });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'index_failure';
    await jobs.updateOne({ _id: job._id, revision: job.revision, lease }, { $set: { status: job.attempts >= 8 ? 'failed' : 'queued', availableAt: Date.now() + (job.attempts >= 8 ? 3600000 : Math.min(3600000, 1000 * 2 ** job.attempts)), error: (/^(embedding_|index_capacity)/.test(message)) ? message : 'index_failure' }, $unset: { lease: '', leaseUntil: '' } });
    console.error('Search indexing retry', { kind: job.kind, attempt: job.attempts, error: (/^(embedding_|index_capacity)/.test(message)) ? message : 'index_failure' });
  }
  return true;
}
/** Incremental, bounded backfill. A deploy is safe with existing data and can resume after a crash. */
export async function backfillSearch() {
  for (const kind of ['profiles', 'posts', 'spaces'] as const) {
    const state = await rows('searchMeta').findOne({ _id: `backfill:${INDEX_VERSION}:${kind}` });
    if (state?.done) continue;
    const collection = kind === 'profiles' ? users() : rows(kind==='spaces'?'spaces':'posts');
    const sources = await collection.find({ ...(state?.cursor ? { _id: { $gt: String(state.cursor) } } : {}) }).sort({ _id: 1 }).limit(50).toArray();
    await transaction(async session => {
      for (const source of sources) {
        const key = `${kind}:${source._id}`;
        if (!await rows('searchOutbox').findOne({ _id: key }, { session }) && !await rows('searchDocuments').findOne({ _id: key, indexVersion: INDEX_VERSION }, { session })) await enqueueSearch(kind, source._id, session);
      }
      await rows('searchMeta').updateOne({ _id: `backfill:${INDEX_VERSION}:${kind}` }, { $set: { cursor: sources.at(-1)?._id || state?.cursor || '', done: sources.length < 50 } }, { upsert: true, session });
    });
  }
}
export function startSearchWorker() {
  let stopped = false, busy: Promise<void> | null = null, cycles = 0;
  const tick = () => { if (stopped || busy) return; busy = (async () => {
    if (cycles++ % 30 === 0) await backfillSearch();
    for (let i = 0; i < 8 && !stopped && await indexOne(); i++);
  })().catch(error => console.error('Search worker:', error.name)).finally(() => { busy = null; }); };
  const timer = setInterval(tick, 2000); tick();
  return async () => { stopped = true; clearInterval(timer); await busy; };
}
