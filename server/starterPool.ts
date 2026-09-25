import type { ClientSession } from 'mongodb';
import { mongo, rows, transaction } from './db';
import { config } from './config';
import { users } from './auth';
import { AppError, requireValue } from './errors';
interface Pool { _id: string; budgetNanos: number; grantedNanos: number; updatedAt: string }
export const pools = () => mongo.db(config.STARTER_POOL_DB).collection<Pool>('starterPools');
const grants = () => mongo.db(config.STARTER_POOL_DB).collection<{ _id: string; userId: string; stage: string; amountNanos: number; createdAt: string }>('starterGrants');
const stage = () => config.APP_ENV === 'staging' ? 'dev' : config.APP_ENV === 'production' ? 'prod' : 'test';
export async function ensureStarterPool() {
  await pools().updateOne({ _id: 'starter' }, { $setOnInsert: { budgetNanos: 100_000_000_000, grantedNanos: 0, updatedAt: new Date().toISOString() } }, { upsert: true });
  await grants().createIndex({ createdAt: -1 });
}
export async function grantStarter(userId: string, session: ClientSession) {
  const user = requireValue(await users().findOne({ _id: userId }, { session }));
  if (user.starterGranted) return;
  const now = new Date().toISOString();
  const allocation = await pools().updateOne({ _id: 'starter', $expr: { $lte: [{ $add: ['$grantedNanos', 1_000_000_000] }, '$budgetNanos'] } }, { $inc: { grantedNanos: 1_000_000_000 }, $set: { updatedAt: now } }, { session });
  if (!allocation.modifiedCount) return;
  // Preserve prior development credit without issuing a second dollar.
  const prior = await rows('ledger').findOne({ _id: `welcome:${userId}` }, { session });
  const credit = prior ? 0 : 1_000_000_000;
  await users().updateOne({ _id: userId }, { $set: { starterGranted: true }, $inc: { balanceNanos: credit } }, { session });
  await grants().insertOne({ _id: `${stage()}:${userId}`, userId, stage: stage(), amountNanos: 1_000_000_000, createdAt: now }, { session });
  if (credit) await rows('ledger').insertOne({ _id: `starter:${userId}`, userId, amountNanos: credit, label: 'Starter credit', createdAt: now }, { session });
}
export async function ensureStarter(userId: string) { await transaction(session => grantStarter(userId, session)); }
export async function starterPoolStatus() {
  const pool = requireValue(await pools().findOne({ _id: 'starter' }));
  const recent = await grants().find().sort({ createdAt: -1 }).limit(100).toArray();
  return { budgetNanos: pool.budgetNanos, grantedNanos: pool.grantedNanos, remainingNanos: pool.budgetNanos - pool.grantedNanos,
    grants: recent.map(({ _id, ...grant }) => ({ id: _id, ...grant })) };
}
export async function setStarterBudget(userId: string, budgetNanos: number) {
  return transaction(async session => {
    const before = requireValue(await pools().findOne({ _id: 'starter' }, { session }));
    if (budgetNanos < before.grantedNanos) throw new AppError(409, 'allocated_budget', 'The budget cannot be lower than credit already granted.');
    const now = new Date().toISOString();
    await pools().updateOne({ _id: 'starter' }, { $set: { budgetNanos, updatedAt: now } }, { session });
    await mongo.db(config.STARTER_POOL_DB).collection('starterPoolAudit').insertOne({ userId, stage: stage(), beforeNanos: before.budgetNanos, afterNanos: budgetNanos, createdAt: now }, { session });
    return { ok: true };
  });
}
