import {queueLedgerActivity} from './ledgerActivity';
import {syncSourceAttachments} from './attachmentReferences';
import {resolvePageContext} from './pageContext';
import { resolveRecordContexts } from './recordContext';
import { automationNotice } from './automationNotices';
import { automationAuthorized, automations } from './automations';
import { inboxContext, publishInbox } from './inbox';
import { enqueueChatSearch } from './search/chat';
import { starterAvailable } from './starterPool';
import type { ResponseUsage } from 'openai/resources/responses/responses';
import { rows, transaction } from './db';
import { currentUser, users, hash } from './auth';
import { AppError, requireValue } from './errors';
import type { Wallet } from '../shared/types';
import type { RunRecord } from './runTypes';
import type { ClientSession } from 'mongodb';
import type { User } from './auth';
import type { TokenUsage } from 'openai/resources/beta/agents/agents';
import { retainUploads } from './uploads';

// USD nanodollars, exact integer arithmetic. Standard tier, short context, US endpoint.
// https://developers.openai.com/api/docs/pricing (verified 2026-09-24).
export const RATE = { model: 'gpt-6-luna', input: 100, cached: 10, cacheWrite: 125, output: 500, version: '2026-09-24' };
export const runs = () => rows<RunRecord>('runs');
export function usageCost(usage: ResponseUsage) {
  const cached = usage.input_tokens_details.cached_tokens || 0;
  const writes = usage.input_tokens_details.cache_write_tokens || 0;
  const fresh = usage.input_tokens - cached - writes;
  if ([fresh, cached, writes, usage.output_tokens].some(n => !Number.isSafeInteger(n) || n < 0)) {
    throw new Error('Unsupported usage shape; leave this request for billing reconciliation.');
  }
  return fresh * RATE.input + cached * RATE.cached + writes * RATE.cacheWrite + usage.output_tokens * RATE.output;
}

/** Cumulative provider reports are replacements, not additional charges. */
export async function recordTurnUsage(runId: string, turnId: string, usage: TokenUsage | null, searches = 0, lease?: string) {
  await transaction(async session => {
    const run = requireValue(await runs().findOne({ _id: runId, providerTurnId: turnId }, { session }));
    if (lease && (run.lease !== lease || run.status !== 'running' || (run.leaseUntil || 0) <= Date.now())) throw new AppError(409, 'stale_run', 'This worker no longer owns the task.');
    const prior = await rows('usage').findOne({ _id: turnId }, { session });
    const recorded = usage || prior?.usage as TokenUsage | null || null;
    const searchCount = Math.max(searches, Number(prior?.searches || 0));
    // Agents API reports omit cache-write counts. Charge only the reported
    // token categories at the saved rate; the operator absorbs unknown extras.
    const rate = (prior?.rate || run.billingRate || RATE) as typeof RATE;
    let modelCost = 0;
    if (recorded) {
      const cached = recorded.input_tokens_details.cached_tokens;
      const fresh = recorded.input_tokens - cached;
      if ([fresh, cached, recorded.output_tokens].some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('Invalid reported usage.');
      modelCost = fresh * rate.input + cached * rate.cached + recorded.output_tokens * rate.output;
    }
    const costNanos = modelCost + searchCount * 10_000_000;
    if (!Number.isSafeInteger(costNanos)) throw new Error('Usage charge exceeds supported precision.');
    const nextCost = Math.max(0, run.costNanos + costNanos - Number(prior?.costNanos || 0));
    const ledger = await rows('ledger').findOne({ _id: `usage:${runId}` }, { session });
    const paid = run.chargedNanos ?? Math.max(0, -Number(ledger?.amountNanos || 0));
    const owner = requireValue(await users().findOne({ _id: run.userId }, { session }));
    const billable = run.purpose === 'automation' ? Math.min(nextCost, run.budgetNanos || 0) : nextCost;
    const available = Math.max(0, owner.balanceNanos - owner.reservedNanos + run.reservedNanos);
    const delta = billable >= paid ? Math.min(billable - paid, available) : billable - paid;
    const chargedNanos = paid + delta;
    const active = run.purpose === 'automation' ? !['completed','cancelled','failed'].includes(run.status) : owner.activeRun === runId;
    const remainingReserve = active ? Math.max(0, (run.purpose === 'automation' ? run.budgetNanos || 0 : RUN_RESERVE) - chargedNanos) : 0;
    const reserveDelta = active ? remainingReserve - run.reservedNanos : 0;
    const now = new Date().toISOString();
    if (delta || reserveDelta) await users().updateOne({ _id: run.userId }, { $inc: { balanceNanos: -delta, reservedNanos: reserveDelta } }, { session });
    await rows('usage').updateOne({ _id: turnId }, { $set: { userId: run.userId, runId, usage: recorded, searches: searchCount, costNanos, rate, status: recorded ? 'reported' : 'pending', updatedAt: now } }, { session, upsert: true });
    await runs().updateOne({ _id: runId }, { $set: { costNanos: nextCost, chargedNanos, reservedNanos: remainingReserve, billingRate: rate, usagePending: !recorded, ...(run.purpose === 'automation' && nextCost >= (run.budgetNanos || Infinity) ? { cancelRequested: true } : {}) }, $addToSet: { responseIds: turnId } }, { session });
    if (chargedNanos || ledger) {await rows('ledger').updateOne({ _id: `usage:${runId}` }, { $set: { userId: run.userId, amountNanos: -chargedNanos, label: run.purpose === 'automation' ? `Automation: ${run.automationName}` : 'Agent usage', details: { model: rate.model, rateVersion: rate.version, status: recorded ? 'reported' : 'pending', providerTurnId: turnId }, updatedAt: now }, $setOnInsert: { createdAt: now } }, { session, upsert: true });await queueLedgerActivity(run.userId,`usage:${runId}`,session);}
  });
}
export async function wallet(userId: string, session?: ClientSession, owner?: User): Promise<Wallet> {
  const user = owner || await currentUser(userId);
  const entries = await rows('ledger').find({ userId }, { session }).sort({ createdAt: -1 }).limit(30).toArray();
  return { starterAvailableNanos: await starterAvailable(user, session), balanceNanos: user.balanceNanos, reservedNanos: user.reservedNanos, availableNanos: user.balanceNanos - user.reservedNanos,
    entries: entries.map(e => ({ id: e._id, amountNanos: Number(e.amountNanos), label: String(e.label), createdAt: String(e.createdAt), details: e.details as Record<string, unknown> | undefined })) };
}

// Holds are extended before each paid model call and released when the run settles.
export const RUN_RESERVE = 60_000_000; // $0.06, unused amount is always released.
export async function reserveRun(userId: string, runId: string, text: string, options: { pageContext?:import('../shared/pageContext').PageContextCandidate; inputContext?:import('../shared/chatInputContext').ChatInputContext; clientId: string; timezone: string; fileIds: string[]; inboxIds?: string[]; recordRefs?:import('../shared/recordContext').RecordReference[] } = { clientId: '', timezone: 'America/New_York', fileIds: [] }) {
  const pageContext=await resolvePageContext(userId,options.pageContext);
  const inbox = await inboxContext(userId, options.inboxIds || []);
  const records=await resolveRecordContexts(userId,options.recordRefs);
  return transaction(async session => {
    const user = await users().findOne({ _id: userId }, { session });
    requireValue(user);
    const fingerprint = hash(JSON.stringify({ text, fileIds: options.fileIds, ...(options.inboxIds?.length ? { inboxIds: options.inboxIds } : {}),...(options.recordRefs?.length?{recordRefs:options.recordRefs}:{}),...(options.pageContext?{pageContext:options.pageContext}:{}),...(options.inputContext?{inputContext:options.inputContext}:{}) }));
    const prior = await runs().findOne({ _id: runId, userId }, { session });
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new AppError(409, 'submission_conflict', 'This submission id belongs to a different message.');
      return prior;
    }
    if (user!.activeRun) {
      const sleeping = await runs().findOne({ _id: user!.activeRun, userId, status: 'sleeping' }, { session });
      if (sleeping) {
        await runs().updateOne({ _id: sleeping._id, status: 'sleeping' }, { $set: { status: 'queued', superseded: true, cancelRequested: true, nextAttempt: 0, reservedNanos: 0 } }, { session });
        await users().updateOne({ _id: userId, activeRun: sleeping._id }, { $inc: { reservedNanos: -sleeping.reservedNanos }, $unset: { activeRun: '' } }, { session });
        await rows('agentSessions').updateOne({ _id: userId }, { $unset: { sessionId: '' } }, { session });
        await rows('agentCredentials').updateMany({ userId, runId: sleeping._id }, { $set: { revokedAt: new Date().toISOString() } }, { session });
        user!.activeRun = null;
      }
    }
    if (user!.activeRun) throw new AppError(409, 'busy', 'Your agent is still replying.');
    const updated = await users().updateOne({ _id: userId, $expr: { $gte: [{ $subtract: ['$balanceNanos', '$reservedNanos'] }, RUN_RESERVE] } },
      { $inc: { reservedNanos: RUN_RESERVE }, $set: { activeRun: runId } }, { session });
    if (!updated.modifiedCount) throw new AppError(402, 'credit_required', 'Add credit to continue. A reply needs $0.06 available; you only pay its actual cost.');
    const now = new Date().toISOString();
    const run: RunRecord = { _id: runId, userId, text, ...options, pageContext, fingerprint, status: 'queued', reservedNanos: RUN_RESERVE, costNanos: 0, chargedNanos: 0, billingRate: RATE, usagePending: true, responseIds: [], createdAt: now, updatedAt: now,
      draft: '', progress: [], approvals: [], revision: 0, attempts: 0, failures: 0 };
    const files = await retainUploads(userId, options.fileIds, 'agent_input', session);
    await runs().insertOne(run, { session });
    await rows('messages').insertOne({ _id: `${runId}:user`, userId, role: 'user', text, files, ...(records.attachments.length?{records:records.attachments}:{}), ...(inbox.length ? { inbox: inbox.map(item => ({ id: item.id, title: item.title })) } : {}), source: 'app', createdAt: now }, { session });
    if(files.length)await syncSourceAttachments('chat',`${runId}:user`,session);
    if (text.trim()) await enqueueChatSearch(userId, `${runId}:user`, session);
    return run;
  });
}
export async function guardSpend(runId: string, lease: string, maximumCost: number) {
  await transaction(async session => {
    const run = requireValue(await runs().findOne({ _id: runId, lease, status: 'running', cancelRequested: { $ne: true }, leaseUntil: { $gt: Date.now() } }, { session }), 'The task has stopped.');
    const extra = Math.max(0, run.costNanos + maximumCost - run.reservedNanos);
    if (!extra) return;
    const updated = await users().updateOne({ _id: run.userId, activeRun: runId, $expr: { $gte: [{ $subtract: ['$balanceNanos', '$reservedNanos'] }, extra] } }, { $inc: { reservedNanos: extra } }, { session });
    if (!updated.modifiedCount) throw new AppError(402, 'credit_required', 'Add credit to continue this task.');
    await runs().updateOne({ _id: runId, lease }, { $inc: { reservedNanos: extra } }, { session });
  });
}
export async function recordUsage(runId: string, responseId: string, usage: ResponseUsage, searchCalls = 0) {
  const costNanos = usageCost(usage) + searchCalls * 10_000_000;
  await transaction(async session => {
    const run = requireValue(await runs().findOne({ _id: runId }, { session }));
    if ((run.responseIds as string[]).includes(responseId)) return;
    await runs().updateOne({ _id: runId }, { $inc: { costNanos }, $push: { responseIds: responseId } }, { session });
    await rows('usage').insertOne({ _id: responseId, runId, userId: run.userId, usage, searchCalls, searchCallNanos: 10_000_000, costNanos, rate: RATE, createdAt: new Date().toISOString() }, { session });
  });
  return costNanos;
}
export async function finishRun(runId: string, lease: string, text: string, status: 'completed' | 'cancelled' | 'failed', error?: string) {
  await transaction(async session => {
    const run = requireValue(await runs().findOne({ _id: runId }, { session }));
    if (run.status !== 'running' || run.lease !== lease || (run.leaseUntil ?? 0) <= Date.now()) throw new AppError(409, 'stale_run', 'This worker no longer owns the task.');
    error ||= typeof run.error === 'string' ? run.error : undefined;
    const owner = requireValue(await users().findOne({ _id: run.userId }, { session }));
    const cost = Math.min(Math.max(0, Math.min(run.costNanos, run.purpose === 'automation' ? run.budgetNanos || 0 : Infinity) - (run.chargedNanos || 0)), Math.max(0, owner.balanceNanos - owner.reservedNanos + run.reservedNanos));
    const chargedNanos = (run.chargedNanos || 0) + cost;
    let message = text || error || (status === 'cancelled' ? 'Stopped.' : '');
    const now = new Date().toISOString();
    if (run.purpose === 'automation') {
      const allowed = !run.cancelRequested && await automationAuthorized(run, session);
      if (status === 'completed' && allowed && run.delivery?.outcome === 'publish') {
        const fence = await automations().updateOne({ _id: run.automationId, userId: run.userId, generation: run.automationGeneration, status: 'active' }, { $inc: { effectRevision: 1 } }, { session });
        if (fence.matchedCount) {
          const delivery = await publishInbox(run.userId, run.delivery, { kind: 'automation', name: run.automationName || 'Your automation', id: run.automationId }, session, { automationId: run.automationId!, runId, automationGeneration: run.automationGeneration });
          await runs().updateOne({ _id: runId }, { $set: { inboxId: delivery.id } }, { session });
        }
      }
      if (status === 'completed' && !run.delivery) { status = 'failed'; error = 'The agent did not return a delivery decision.'; }
      if (!allowed) status = 'cancelled';
      if (status==='failed' || status==='cancelled'&&(Boolean(error)||run.costNanos>=(run.budgetNanos||Infinity))) await automationNotice(run.userId,run.automationId!,`run:${runId}`,`${run.automationName || 'Automation'} needs attention`,error || 'The run reached its spending limit. Review its history and limits before trying again.',session);
      await users().updateOne({ _id: run.userId }, { $inc: { balanceNanos: -cost, reservedNanos: -run.reservedNanos } }, { session });
      const definition = await automations().findOne({ _id: run.automationId, userId: run.userId, generation: run.automationGeneration, status: 'active', nextRunAt: null }, { session });
      if (definition?.schedule.kind === 'once') await automations().updateOne({ _id: definition._id, generation: definition.generation }, { $set: { status: 'paused', blockedReason: status === 'completed' ? 'Completed.' : 'The one-time run did not complete.' }, $inc: { revision: 1, generation: 1 } }, { session });
      message = '';
    } else {
      await users().updateOne({ _id: run.userId }, { $inc: { balanceNanos: -cost, reservedNanos: -run.reservedNanos } }, { session });
      await users().updateOne({ _id: run.userId, activeRun: runId }, { $unset: { activeRun: '' } }, { session });
      if (run.superseded) message = '';
    }
    await runs().updateOne({ _id: runId }, { $set: { status, draft: text, error, chargedNanos, reservedNanos: 0, usageCheckAt: Date.now() + 1000, updatedAt: now }, $unset: { lease: '', leaseUntil: '' }, $inc: { revision: 1 } }, { session });
    if (cost) {await rows('ledger').updateOne({ _id: `usage:${runId}` }, { $set: { userId: run.userId, amountNanos: -chargedNanos, label: 'Agent usage',
      details: { model: RATE.model, responseIds: run.responseIds, rateVersion: RATE.version, status: 'reported' } }, $setOnInsert: { createdAt: now } }, { session, upsert: true });await queueLedgerActivity(run.userId,`usage:${runId}`,session);}
    if (message) await rows('messages').insertOne({ _id: `${runId}:assistant`, userId: run.userId, role: 'assistant', text: message,
      source: 'app', status: status === 'completed' ? 'complete' : 'interrupted', createdAt: now }, { session });
    if (message) await enqueueChatSearch(run.userId, `${runId}:assistant`, session);
  });
}
