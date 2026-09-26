import { z } from 'zod';
import type { ClientSession } from 'mongodb';
import { rows, transaction } from './db';
import { runs } from './wallet';
import { users } from './auth';
import { automationAuthorized } from './automations';
import { AppError, requireValue } from './errors';
export const sleepSchema = z.strictObject({ until: z.iso.datetime().nullish(), seconds: z.number().int().min(10).max(604800).nullish(), reason: z.string().trim().min(1).max(300) }).refine(value => Number(Boolean(value.until)) + Number(value.seconds != null) === 1, 'Provide until or seconds, not both.');
export function sleepDeadline(input: z.infer<typeof sleepSchema>, now = Date.now()) {
  const until = input.until ? Date.parse(input.until) : now + input.seconds! * 1000;
  if (!Number.isFinite(until) || until < now + 10000 || until > now + 7 * 86400000) throw new AppError(422, 'sleep_time', 'Sleep from 10 seconds up to seven days.');
  return until;
}
export async function wakeRun(userId: string, runId: string, manual = false, session?: ClientSession): Promise<{ resumed: boolean }> {
  if (!session) return transaction(session => wakeRun(userId, runId, manual, session));
  const run = requireValue(await runs().findOne({ _id: runId, userId }, { session }));
  if (run.status !== 'sleeping' || !run.sleep || run.cancelRequested || run.superseded) return { resumed: false };
  if (run.purpose === 'automation' && !await automationAuthorized(run, session)) { await runs().updateOne({ _id: runId, status: 'sleeping' }, { $set: { status: 'queued', cancelRequested: true, nextAttempt: 0 } }, { session }); return { resumed: false }; }
  if (!manual && run.sleep.until > Date.now()) return { resumed: false };
  if (run.purpose !== 'automation' && !(await users().findOne({ _id: userId, activeRun: runId }, { session }))) return { resumed: false };
  const updated = await runs().updateOne({ _id: runId, userId, status: 'sleeping', revision: run.revision }, { $set: { status: 'queued', nextAttempt: 0, failures: 0, 'sleep.wokeAt': Date.now(), updatedAt: new Date().toISOString() }, $inc: { revision: 1 } }, { session });
  return { resumed: Boolean(updated.modifiedCount) };
}
export async function wakeDueRuns() { for (const run of await runs().find({ status: 'sleeping', 'sleep.until': { $lte: Date.now() } }).limit(20).toArray()) await wakeRun(run.userId, run._id); }
