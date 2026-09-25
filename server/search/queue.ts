import { randomUUID } from 'node:crypto';
import type { ClientSession } from 'mongodb';
import { rows } from '../db';
import type { SearchJob } from './model';

/** Must share the source mutation's transaction: an edit can never lose its indexing job. */
export async function enqueueSearch(kind: SearchJob['kind'], entityId: string, session: ClientSession) {
  await rows<SearchJob>('searchOutbox').updateOne({ _id: `${kind}:${entityId}` }, {
    $set: { kind, entityId, revision: randomUUID(), status: 'queued', attempts: 0, availableAt: Date.now() },
    $unset: { lease: '', leaseUntil: '', error: '' },
  }, { session, upsert: true });
}
