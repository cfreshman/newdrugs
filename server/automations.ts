import { automationNotice } from './automationNotices';
import { textLinks } from '../shared/links';
import { randomUUID } from 'node:crypto';
import type { ClientSession } from 'mongodb';
import { rows, transaction } from './db';
import { users, hash, type Actor } from './auth';
import { config } from './config';
import { AppError, requireValue } from './errors';
import { runs, RATE } from './wallet';
import { nextAutomationTime, scheduleParts } from './automationSchedule';
import { automationConfigSchema, type Automation, type AutomationConfig } from '../shared/automations';
export interface AutomationRow extends AutomationConfig { _id: string; userId: string; revision: number; generation: number; status: Automation['status']; nextRunAt: number | null; createdAt: string; blockedReason?: string; blockedCode?: string; retryAt?: number; credentialId?: string; lastSeenAt?: string }
export const automations = () => rows<AutomationRow>('automations');
// Omit persisted ownership fields when validating a saved configuration.
const definition = (row: AutomationRow): AutomationConfig => ({ name: row.name, instruction: row.instruction, schedule: row.schedule, maxRunNanos: row.maxRunNanos, dailyBudgetNanos: row.dailyBudgetNanos, privateChat: row.privateChat, accountActivity: Boolean(row.accountActivity), webSearch: row.webSearch });
export function viewAutomation(row: AutomationRow): Automation { return { ...definition(row), id: row._id, revision: row.revision, status: row.status, nextRunAt: row.nextRunAt ? new Date(row.nextRunAt).toISOString() : null, createdAt: row.createdAt, ...(row.blockedReason ? { blockedReason: row.blockedReason, blockedCode: row.blockedCode } : {}), ...(row.retryAt ? {retryAt:new Date(row.retryAt).toISOString()} : {}) }; }
export async function ownAutomation(userId: string, id: string, session?: ClientSession, includeDeleted = false) { return requireValue(await automations().findOne({ _id: id, userId, ...(includeDeleted ? {} : { status: { $ne: 'deleted' as const } }) }, { session }), 'This automation is unavailable.'); }
export async function automationAuthorized(run: { userId: string; automationId?: string; automationGeneration?: number }, session?: ClientSession) {
  const row = run.automationId && await automations().findOne({ _id: run.automationId, userId: run.userId, status: 'active', generation: run.automationGeneration }, { session });
  if (!row) return false;
  if (row.credentialId && !await rows('tokens').findOne({ _id: row.credentialId, userId: run.userId, scope: 'write', revokedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }, { session })) return false;
  return true;
}
export async function admitAutomation(row: AutomationRow, occurrence: string, session: ClientSession) {
  const runId = `automation:${row._id}:${hash(occurrence).slice(0, 24)}`;
  const prior = await runs().findOne({ _id: runId, userId: row.userId }, { session }); if (prior) return prior._id;
  if (!await automationAuthorized({ userId: row.userId, automationId: row._id, automationGeneration: row.generation }, session)) throw new AppError(403, 'automation_paused', 'This automation is no longer authorized.');
  if (!config.aiEnabled) throw new AppError(503, 'agent_unavailable', 'The hosted agent is unavailable.');
  const owner = requireValue(await users().findOneAndUpdate({ _id: row.userId, handle: { $type: 'string' } }, { $inc: { automationRevision: 1 } }, { session }));
  if (await runs().findOne({ userId: row.userId, purpose: 'automation', status: { $in: ['queued','running','sleeping'] } }, { session })) throw new AppError(409, 'automation_busy', 'Another automation is still running.');
  const day = new Date().toISOString().slice(0, 10);
  const priorRuns = await runs().find({ userId: row.userId, purpose: 'automation', createdAt: { $gte: day } }, { session }).limit(101).toArray();
  const allocated = (run: typeof priorRuns[number]) => run.usagePending || !['completed','failed','cancelled'].includes(run.status) ? run.budgetNanos || 0 : Math.min(run.budgetNanos || 0, run.costNanos);
  if (priorRuns.length >= 100 || priorRuns.reduce((sum, run) => sum + allocated(run), 0) + row.maxRunNanos > 1e9 || priorRuns.filter(run => run.automationId === row._id).reduce((sum, run) => sum + allocated(run), 0) + row.maxRunNanos > row.dailyBudgetNanos) throw new AppError(409, 'automation_budget', 'The daily automation spending allowance is used.');
  if (owner.balanceNanos - owner.reservedNanos < row.maxRunNanos) throw new AppError(402, 'credit_required', 'Not enough available credit for this automation.');
  await users().updateOne({ _id: owner._id }, { $inc: { reservedNanos: row.maxRunNanos } }, { session });
  const recentDeliveries = await rows('agentInbox').find({ userId: row.userId, automationId: row._id, automationGeneration: row.generation }, { session, projection: { title: 1, links: 1, body: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(10).toArray();
  const now = new Date().toISOString();
  await runs().insertOne({ _id: runId, userId: row.userId, purpose: 'automation', priority: 1, automationId: row._id, automationGeneration: row.generation, automationName: row.name, privateChat: row.privateChat, accountActivity: Boolean(row.accountActivity), webSearch: row.webSearch, budgetNanos: row.maxRunNanos, text: row.instruction, recentDeliveries: recentDeliveries.map(item => ({ title: String(item.title), links: [...(Array.isArray(item.links) ? item.links : []), ...textLinks(String(item.body || '')).map(link => ({ title: 'Previously linked source', url: link.url }))].slice(0, 24), createdAt: String(item.createdAt) })), clientId: '', timezone: row.schedule.kind === 'weekly' ? row.schedule.timeZone : 'UTC', fileIds: [], fingerprint: hash(runId), status: 'queued', reservedNanos: row.maxRunNanos, costNanos: 0, chargedNanos: 0, billingRate: RATE, usagePending: true, responseIds: [], createdAt: now, updatedAt: now, draft: '', progress: [], approvals: [], revision: 0, attempts: 0, failures: 0 }, { session });
  return runId;
}
export async function automationOperation(name: string, data: Record<string, unknown>, actor: Actor, session?: ClientSession) {
  const userId = actor.userId;
  if (name === 'automations.list') return { items: (await automations().find({ userId, status: { $ne: 'deleted' } }, { session }).sort({ createdAt: -1 }).limit(50).toArray()).map(viewAutomation) };
  if (name === 'automations.create') {
    const input = automationConfigSchema.parse(data); nextAutomationTime(input.schedule);
    if (input.dailyBudgetNanos < input.maxRunNanos) throw new AppError(422, 'budget', 'Daily allowance must cover one run.');
    await users().updateOne({ _id: userId }, { $inc: { automationRevision: 1 } }, { session });
    if (await automations().countDocuments({ userId, status: { $ne: 'deleted' } }, { session }) >= 20) throw new AppError(409, 'automation_limit', 'Pause or remove old automations before adding more.');
    const row: AutomationRow = { _id: randomUUID(), userId, ...input, revision: 1, generation: 1, status: 'paused', nextRunAt: null, createdAt: new Date().toISOString(), ...(actor.source === 'external' ? { credentialId: actor.credentialId } : {}) };
    await automations().insertOne(row, { session }); return viewAutomation(row);
  }
  const row = await ownAutomation(userId, String(data.automationId), session, ['automations.get','automations.runs'].includes(name));
  if (name === 'automations.get') return viewAutomation(row);
  if (name === 'automations.runs') {
    const limit = Number(data.limit || 20), before = data.before ? requireValue(await runs().findOne({ _id: String(data.before), userId, automationId: row._id }, { session })) : null;
    const found = await runs().find({ userId, automationId: row._id, ...(before ? { $or: [{ createdAt: { $lt: before.createdAt } }, { createdAt: before.createdAt, _id: { $lt: before._id } }] } : {}) }, { session }).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).toArray();
    return { items: found.slice(0, limit).map(run => ({ id: run._id, status: run.status, outcome: run.delivery?.outcome || (run.status === 'completed' ? 'silent' : undefined), createdAt: run.createdAt, costNanos: run.chargedNanos || 0, usagePending: Boolean(run.usagePending), reason: run.delivery?.outcome === 'silent' ? run.delivery.reason : typeof run.error === 'string' ? run.error : undefined, inboxId: run.inboxId, ...(run.sleep ? { sleep: { until: run.sleep.until, reason: run.sleep.reason } } : {}) })), nextCursor: found.length > limit ? found[limit - 1]._id : null };
  }
  if (row.revision !== data.revision) throw new AppError(409, 'automation_changed', 'This automation changed. Reload before continuing.');
  if (name === 'automations.run_now') { if (!session) throw Error('Transaction required'); return { runId: await admitAutomation(row, `manual:${randomUUID()}`, session) }; }
  if (name === 'automations.update') {
    const input = automationConfigSchema.parse(data.configuration); nextAutomationTime(input.schedule);
    if (input.dailyBudgetNanos < input.maxRunNanos) throw new AppError(422, 'budget', 'Daily allowance must cover one run.');
    Object.assign(row, input); row.status = 'paused';
  } else row.status = name === 'automations.enable' ? 'active' : name === 'automations.delete' ? 'deleted' : 'paused';
  row.revision++; row.generation++; delete row.blockedReason; delete row.blockedCode; delete row.retryAt;
  row.nextRunAt = row.status === 'active' ? nextAutomationTime(row.schedule) : null;
  if (row.status === 'active' && !row.nextRunAt) throw new AppError(422, 'schedule', 'Choose a future time before enabling this automation.');
  if (row.status === 'active' && actor.source === 'browser') delete row.credentialId;
  if (row.status === 'active' && actor.source === 'external') row.credentialId = actor.credentialId;
  await automations().replaceOne({ _id: row._id, userId }, row, { session });
  await runs().updateMany({ userId, automationId: row._id, status: { $in: ['queued','running','sleeping'] } }, { $set: { cancelRequested: true, nextAttempt: 0, status: 'queued' } }, { session });
  return viewAutomation(row);
}
export async function tickAutomations() {
  const due = await automations().find({ status: 'active', nextRunAt: { $ne: null, $lte: Date.now() }, $or:[{retryAt:{$exists:false}},{retryAt:{$lte:Date.now()}}] }).sort({ nextRunAt: 1 }).limit(8).toArray();
  for (const candidate of due) {
    try { await transaction(async session => {
      const row = await automations().findOneAndUpdate({ _id: candidate._id, status: 'active', generation: candidate.generation, nextRunAt: candidate.nextRunAt }, { $inc: { timerClaims: 1 } }, { session, returnDocument: 'after' });
      if (!row) return;
      const at = row.nextRunAt!;
      await admitAutomation(row, `${row.generation}:${at}`, session);
      const next = row.schedule.kind === 'once' ? null : nextAutomationTime(row.schedule, Math.max(at, Date.now()), scheduleParts(at, row.schedule.timeZone).date);
      await automations().updateOne({ _id: row._id }, { $set: { nextRunAt: next }, $unset:{blockedReason:'',blockedCode:'',retryAt:''} }, { session });
      if(row.blockedReason)await automationNotice(row.userId,row._id,`resumed:${row.generation}:${at}`,`${row.name} resumed`,'The waiting task has started. Future scheduled runs remain enabled.',session);
    }); } catch (error) {
      const issue=error instanceof AppError?error:new AppError(503,'temporary_failure','The service could not start this task. It will retry automatically.');
      const retryable=['automation_budget','credit_required','agent_unavailable','automation_busy','temporary_failure'].includes(issue.code);
      const retryAt=issue.code==='automation_budget'?Date.parse(new Date(Date.now()+86400000).toISOString().slice(0,10)):Date.now()+60000;
      await transaction(async session=>{
        const changed=await automations().updateOne({_id:candidate._id,status:'active',generation:candidate.generation},{ $set:{blockedReason:issue.message,blockedCode:issue.code,...(retryable?{retryAt}:{status:'paused',nextRunAt:null})},...(!retryable?{$inc:{revision:1,generation:1}}:{}) },{session});
        if(changed.matchedCount&&issue.code!=='automation_busy')await automationNotice(candidate.userId,candidate._id,`waiting:${candidate.generation}:${candidate.nextRunAt}:${issue.code}`,`${candidate.name}: ${retryable?'waiting':'needs attention'}`,`${issue.message}${retryable?' It remains enabled and will retry automatically.':''}`,session);
      });
      if(!(error instanceof AppError))console.error('Automation admission:',error instanceof Error?error.name:'Error');
    }
  }
}

export async function revokeAutomationCredential(userId: string, credentialId: string) {
  await transaction(async session => {
    await rows('tokens').updateOne({ _id: credentialId, userId }, { $set: { revokedAt: new Date().toISOString() } }, { session });
    const definitions = await automations().find({ userId, credentialId, status: 'active' }, { session }).toArray();
    await automations().updateMany({ userId, credentialId, status: 'active' }, { $set: { status: 'paused', nextRunAt: null, blockedReason: 'The creating agent connection was revoked.' }, $inc: { revision: 1, generation: 1 } }, { session });
    for(const definition of definitions)await automationNotice(userId,definition._id,`revoked:${definition.generation}`,`${definition.name} paused`,'Its connected agent was revoked. Review the automation to enable it with new authority.',session);
    await runs().updateMany({ userId, automationId: { $in: definitions.map(item => item._id) }, status: { $in: ['queued','running','sleeping'] } }, { $set: { status: 'queued', cancelRequested: true, nextAttempt: 0, leaseUntil: 0 } }, { session });
  });
}
