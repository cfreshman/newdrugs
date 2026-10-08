import {randomUUID} from 'node:crypto';
import { hash, checkPassword, passwordHash, users, type User } from './auth';
import { rows, transaction } from './db';
import { AppError, requireValue } from './errors';
import { enqueueSearch } from './search/queue';
import { ensureIntroduction } from './onboarding';
import {reservedWebsiteUsername} from '../shared/website';
import {logPersonGrams} from '../shared/logPeople';
export async function verifyAccountPassword(userId: string, password: string) {
  const user = requireValue(await users().findOne({ _id: userId, handle: { $type: 'string' } }));
  if (!await checkPassword(password, user.passwordHash)) throw new AppError(401, 'password', 'Your current password did not match.');
  return user;
}
export async function changeUsername(user: User, handle: string) {
  if(reservedWebsiteUsername(handle))throw new AppError(422,'username_reserved','Usernames cannot begin with u_.');
  return transaction(async session => {
    const saved = requireValue(await users().findOneAndUpdate({ _id: user._id, passwordHash: user.passwordHash }, { $set: { handle,logHandleGrams:logPersonGrams(handle) } }, { session, returnDocument: 'after' }), 'Your account changed. Sign in again.');
    await enqueueSearch('profiles', user._id, session); return saved;
  });
}
export async function changeAccountPassword(user: User, password: string, sessionToken: string) {
  const encoded = await passwordHash(password), sessionId = hash(sessionToken);
  await transaction(async session => {
    requireValue(await users().findOneAndUpdate({ _id: user._id, passwordHash: user.passwordHash }, { $set: { passwordHash: encoded } }, { session }), 'Your account changed. Sign in again.');
    await rows('sessions').deleteMany({ userId: user._id, _id: { $ne: sessionId } }, { session });
    await rows('pushSubscriptions').updateMany({ userId: user._id, sessionId: { $ne: sessionId } }, { $set: { revokedAt: new Date().toISOString() } }, { session });
  });
}
export async function clearAgentChat(userId: string) {
  await transaction(async session => {
    const now = new Date().toISOString();
    const owner=requireValue(await users().findOneAndUpdate({ _id: userId }, { $set: { chatClearedAt: now }, $inc: { chatGeneration: 1 }, $unset: { activeRun: '' } }, { session,returnDocument:'after' }));
    const {queueRetrieval}=await import('./search/replication');await queueRetrieval('chat_purge',userId,session,{userId,generation:Number(owner.chatGeneration||0)});
    await rows('retrievalJobs').updateMany({kind:'chat',userId},{$set:{revision:randomUUID(),availableAt:Date.now()},$unset:{lease:''}},{session});
    const target = { userId, $or: [{ purpose: { $ne: 'automation' } }, { privateAccess: { $ne: false } }] };
    const affected = await rows('runs').find(target, { session, projection: { providerSessionId: 1, reservedNanos: 1, status: 1 } }).toArray();
    const held = affected.filter(run => !['completed','failed','cancelled'].includes(String(run.status))).reduce((total, run) => total + Number(run.reservedNanos || 0), 0);
    if (held) await users().updateOne({ _id: userId }, { $inc: { reservedNanos: -held } }, { session });
    const keys = [userId, ...affected.map(run => run._id)];
    const savedSessions = await rows('agentSessions').find({ _id: { $in: keys } }, { session }).toArray();
    const sessions = [...new Set([...affected.map(run => run.providerSessionId), ...savedSessions.map(record => record.sessionId)].filter((id): id is string => typeof id === 'string'))];
    for (const id of sessions) await rows('agentSessionCleanup').updateOne({ _id: id }, { $setOnInsert: { userId, requestedAt: now, availableAt: Date.now(), attempts: 0 } }, { session, upsert: true });
    await rows('runs').updateMany({ ...target, status: { $nin: ['completed','cancelled','failed'] } }, { $set: { status: 'queued', cancelRequested: true, superseded: true, reservedNanos: 0, nextAttempt: 0, leaseUntil: 0 } }, { session });
    await rows('runs').updateMany(target, { $set: { text: '', draft: '', progress: [], approvals: [], fileIds: [], inboxIds: [], recordRefs:[], reviewReplies: [], recentDeliveries: [], completedSleeps: {}, error: '' }, $unset: { sleep: '', delivery: '', memorySnapshot: '' } }, { session });
    await rows('agentCredentials').updateMany({ userId, $or: [{ runId: { $in: affected.map(run => run._id) } }, { runId: { $exists: false } }] }, { $set: { revokedAt: now } }, { session });
    await rows('agentSessions').deleteMany({ _id: { $in: keys } }, { session });
    await rows('routerStates').deleteMany({userId,purpose:{$ne:'public_automation'}},{session});
    await rows('receipts').updateMany({ userId, operation: 'conversation.append' }, { $set: { 'result.text': '' } }, { session });
    await rows('messages').deleteMany({ userId }, { session });
    const {clearChatAttachmentReferences}=await import('./attachmentReferences');await clearChatAttachmentReferences(userId,session);
    await rows('chatSearchChunks').deleteMany({ userId }, { session });
    await rows('chatSearchJobs').deleteMany({ userId }, { session });
    await rows('chatSearchResults').deleteMany({ userId }, { session });
  });
  await ensureIntroduction(userId);
}
