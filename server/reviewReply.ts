import { resolveRecordContexts } from './recordContext';
import { inboxContext } from './inbox';
import { enqueueChatSearch } from './search/chat';
import { rows, transaction } from './db';
import { hash, users } from './auth';
import { runs } from './wallet';
import { retainUploads } from './uploads';
import { AppError, requireValue } from './errors';

/** Save the correction and decline pending writes together, with one retry identity. */
export async function replyToReview(userId: string, review: { runId: string; revision: number }, reply: { requestId: string; text: string; fileIds: string[]; inboxIds?: string[];recordRefs?:import('../shared/recordContext').RecordReference[] }) {
  const records=await resolveRecordContexts(userId,reply.recordRefs);
  const inbox = await inboxContext(userId, reply.inboxIds || []);
  return transaction(async session => {
    const id = `${userId}:${reply.requestId}:user`, fingerprint = hash(JSON.stringify({ review, text: reply.text, fileIds: reply.fileIds, inboxIds: reply.inboxIds || [],...(reply.recordRefs?.length?{recordRefs:reply.recordRefs}:{}) }));
    const prior = await rows('messages').findOne({ _id: id, userId }, { session });
    if (prior) {
      if (prior.reviewFingerprint !== fingerprint) throw new AppError(409, 'submission_conflict', 'This submission id belongs to a different message.');
      return requireValue(await runs().findOne({ _id: review.runId, userId }, { session }));
    }
    const run = await runs().findOne({ _id: review.runId, userId, revision: review.revision, status: 'waiting_for_approval', cancelRequested: { $ne: true } }, { session });
    const owner = await users().findOne({ _id: userId, activeRun: review.runId }, { session });
    if (!run || !owner) throw new AppError(409, 'review_changed', 'The review changed before your reply arrived. Check the current actions and send your reply again.');
    const pending = run.approvals.filter(action => action.human && action.kind === 'write' && action.status === 'pending');
    if (!pending.length) throw new AppError(409, 'review_changed', 'There are no pending actions to reject.');
    const files = await retainUploads(userId, reply.fileIds, 'agent_input', session);
    for (const action of pending) action.status = 'rejected';
    const now = new Date().toISOString();
    await rows('messages').insertOne({ _id: id, userId, role: 'user', text: reply.text, files, ...(records.attachments.length?{records:records.attachments}:{}), source: 'app', createdAt: now, reviewFingerprint: fingerprint, ...(inbox.length ? { inbox: inbox.map(item => ({ id: item.id, title: item.title })) } : {}) }, { session });
    if (reply.text.trim()) await enqueueChatSearch(userId, id, session);
    return requireValue(await runs().findOneAndUpdate({ _id: run._id, revision: review.revision }, { $set: { ...(reply.inboxIds?.length ? { inboxIds: reply.inboxIds } : {}), approvals: run.approvals, status: 'queued', nextAttempt: 0, draft: '', outputComplete: false, updatedAt: now },
      $push: { reviewReplies: { id, text: reply.text, files, ...(reply.recordRefs?.length?{recordRefs:reply.recordRefs}:{}), actionIds: pending.map(action => action.id) } }, $inc: { revision: 1 } }, { session, returnDocument: 'after' }));
  });
}
