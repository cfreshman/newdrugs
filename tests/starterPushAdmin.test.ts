import { beforeAll, beforeEach, afterAll, afterEach, it, expect, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import webpush from 'web-push';
import { connectDatabase, db, mongo, rows, transaction } from '../server/db';
import { createGuest, currentUser, hash, registerAccount, logout, users } from '../server/auth';
import { ensureStarterPool, ensureStarter, starterClaimKey, starterAvailable, pools } from '../server/starterPool';
import { ensureIntroduction } from '../server/onboarding';
import { config } from '../server/config';
import { saveSubscription, enqueuePush, deliverPush, pushDevices, validateSubscription } from '../server/push';
import { adminKeys, authenticateAdminKey, executeAdminOperation } from '../server/adminCli';
import type { Request, Response } from 'express';
async function clean() { if (db().databaseName !== 'newdrugs_test') throw new Error('Isolated cloud database required.'); for (const collection of await db().collections()) await collection.deleteMany({}); }
beforeAll(async () => { await connectDatabase(); });
beforeEach(async () => { await clean(); await ensureStarterPool(); });
afterEach(() => { vi.restoreAllMocks(); config.VAPID_PUBLIC_KEY = ''; config.VAPID_PRIVATE_KEY = ''; });
afterAll(async () => { await clean(); await mongo.close(); });
async function account(ip = '192.0.2.1') { const guest = await createGuest(ip); return registerAccount(guest._id, `u_${randomUUID().slice(0, 8)}`, 'test-hash', ip); }

it('advertises an eligible dollar without giving guests spendable credit, and counts saved people only', async () => {
  const guest = await createGuest('192.0.2.1');
  await createGuest('192.0.2.2'); await account('192.0.2.3');
  expect(guest.balanceNanos).toBe(0); expect(await starterAvailable(guest)).toBe(1e9);
  expect((await pools().findOne({ _id: 'starter' }))?.grantedNanos).toBe(1e9);
  await ensureIntroduction(guest._id);
  expect((await rows('messages').findOne({ _id: `intro:${guest._id}` }))?.text).toContain("I've given you a US dollar to start. Now join 1 other person on New Drugs.");
  await registerAccount(guest._id, 'saved_account', 'test-hash', '192.0.2.1');
  expect((await currentUser(guest._id)).balanceNanos).toBe(1e9);
  expect(await starterAvailable(await createGuest('192.0.2.1'))).toBe(0);
});
it('serializes simultaneous shared-IP claims without blocking any registrations', async () => {
  const accounts = await Promise.all(Array.from({ length: 5 }, () => account()));
  expect(accounts.filter(user => user.handle)).toHaveLength(5);
  expect(accounts.reduce((sum, user) => sum + user.balanceNanos, 0)).toBe(1e9);
  await Promise.all(accounts.map(user => ensureStarter(user._id)));
  expect(await rows('starterClaims').countDocuments()).toBe(1);
  expect(await rows('ledger').countDocuments()).toBe(1);
});
it('normalizes mapped IPv4 and IPv6 /64s and fails closed without an address/key', () => {
  expect(starterClaimKey('192.0.2.1')).toBe(starterClaimKey('::ffff:192.0.2.1'));
  expect(starterClaimKey('2001:db8:abcd:1234::1')).toBe(starterClaimKey('2001:db8:abcd:1234:ffff::2'));
  expect(starterClaimKey('2001:db8:abcd:1235::1')).not.toBe(starterClaimKey('2001:db8:abcd:1234::1'));
  expect(starterClaimKey('192.0.2.1', '')).toBeUndefined(); expect(starterClaimKey('invalid')).toBeUndefined();
});
it('preserves legacy balances and waits for pool replenishment without consuming a claim', async () => {
  await pools().updateOne({ _id: 'starter' }, { $set: { budgetNanos: 0 } });
  const user = await account(); expect(user.balanceNanos).toBe(0); expect(await rows('starterClaims').countDocuments()).toBe(0);
  await pools().updateOne({ _id: 'starter' }, { $set: { budgetNanos: 1e9 } }); await ensureStarter(user._id);
  expect((await currentUser(user._id)).balanceNanos).toBe(1e9);
  await users().updateOne({ _id: user._id }, { $set: { balanceNanos: 370000000 } }); await ensureStarter(user._id);
  expect((await currentUser(user._id)).balanceNanos).toBe(370000000);
});
const subscription = () => ({ deviceId: randomUUID(), endpoint: `https://web.push.apple.com/${randomUUID()}`, keys: { p256dh: Buffer.concat([Buffer.from([4]), randomBytes(64)]).toString('base64url'), auth: randomBytes(16).toString('base64url') } });
async function pushFixture() {
  const keys = webpush.generateVAPIDKeys(); config.VAPID_PUBLIC_KEY = keys.publicKey; config.VAPID_PRIVATE_KEY = keys.privateKey;
  const recipient = await account(), sender = await account('192.0.2.2'), connectionId = [recipient._id, sender._id].sort().join(':');
  const token = randomBytes(32).toString('base64url'), sessionId = hash(token);
  await rows('sessions').insertOne({ _id: sessionId, userId: recipient._id, expiresAt: new Date(Date.now() + 3600000) });
  const device = subscription(); await saveSubscription(recipient._id, sessionId, device);
  await rows('connections').insertOne({ _id: connectionId, fromId: sender._id, toId: recipient._id, members: [recipient._id, sender._id], status: 'pending', createdAt: 'invite-event' });
  await transaction(session => enqueuePush(recipient._id, sender._id, connectionId, 'invitation', 'invite-event', session));
  await rows('pushOutbox').updateMany({}, { $set: { availableAt: 0 } });
  return { recipient, sender, connectionId, token, sessionId, device };
}
it('delivers a generic invitation and revokes expired subscriptions without exposing message content', async () => {
  const fixture = await pushFixture();
  const send = vi.fn().mockResolvedValue({ statusCode: 201 }); await deliverPush(send);
  expect(send).toHaveBeenCalledTimes(1);
  expect(JSON.parse(send.mock.calls[0][1])).toMatchObject({ body: 'You have a new invitation.', url: `/messages/${encodeURIComponent(fixture.connectionId)}` });
  await deliverPush(send); expect(send).toHaveBeenCalledTimes(1);
  await rows('pushOutbox').updateMany({}, { $set: { status: 'pending', availableAt: 0, delivered: [] } });
  send.mockRejectedValue({ statusCode: 410 }); await deliverPush(send);
  expect((await pushDevices(fixture.recipient._id)).items).toHaveLength(0);
});
it.each(['read', 'blocked', 'logout'])('does not deliver stale or unauthorized notifications: %s', async reason => {
  const f = await pushFixture();
  if (reason === 'read') await rows('connections').updateOne({ _id: f.connectionId }, { $set: { notificationReadAt: new Date().toISOString() } });
  if (reason === 'blocked') await rows('blocks').insertOne({ _id: f.connectionId, members: [f.recipient._id, f.sender._id] });
  if (reason === 'logout') await logout({ cookies: { [config.SESSION_COOKIE]: f.token } } as Request, { clearCookie: vi.fn() } as unknown as Response);
  const send = vi.fn(); await deliverPush(send); expect(send).not.toHaveBeenCalled();
});
it('enqueues only committed actions and keeps subscriptions account-owned', async () => {
  const f = await pushFixture();
  await expect(transaction(async session => { await enqueuePush(f.recipient._id, f.sender._id, f.connectionId, 'message', 'rolled-back', session); throw new Error('rollback'); })).rejects.toThrow('rollback');
  expect(await rows('pushOutbox').countDocuments()).toBe(1);
  await expect(saveSubscription(f.sender._id, f.sessionId, subscription())).rejects.toThrow();
  expect(() => validateSubscription({ ...subscription(), endpoint: 'https://127.0.0.1/private' })).toThrow();
});
it('separates operator keys, binds stage access, and audits idempotent report decisions', async () => {
  const token = `nd_admin_${randomBytes(32).toString('base64url')}`;
  const key = { _id: hash(token), label: 'Test operator', stages: ['dev'], createdAt: new Date().toISOString(), revokedAt: null };
  await adminKeys().insertOne(key);
  await expect(authenticateAdminKey(`nd_${randomBytes(32).toString('base64url')}`)).rejects.toMatchObject({ code: 'admin_key' });
  expect((await authenticateAdminKey(token))._id).toBe(key._id);
  await rows('reports').insertOne({ _id: 'report', fromId: 'reporter', personId: 'person', reason: 'spam', status: 'unreviewed' });
  const input = { reportId: 'report', status: 'dismissed', note: 'Reviewed in test' }, requestKey = randomUUID();
  await expect(executeAdminOperation(key, 'reports.review', input, requestKey)).rejects.toMatchObject({ code: 'confirmation_required' });
  const result = await executeAdminOperation(key, 'reports.review', input, requestKey, true);
  expect(await executeAdminOperation(key, 'reports.review', input, requestKey, true)).toEqual(result);
  expect(await rows('adminAudit').countDocuments()).toBe(1);
  await expect(executeAdminOperation(key, 'reports.review', { ...input, note: 'Changed' }, requestKey, true)).rejects.toMatchObject({ code: 'idempotency_conflict' });
  await adminKeys().updateOne({ _id: key._id }, { $set: { stages: ['prod'] } });
  await expect(authenticateAdminKey(token)).rejects.toMatchObject({ code: 'admin_key' });
  await adminKeys().updateOne({ _id: key._id }, { $set: { stages: ['dev'], revokedAt: 'now' } });
  await expect(executeAdminOperation(key, 'reports.review', input, requestKey, true)).rejects.toThrow();
});
