import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import sharp from 'sharp';
import { connectDatabase, db, mongo, rows } from '../server/db';
import { createGuest, currentUser, users, hash, profile, registerAccount, type Actor } from '../server/auth';
import { executeOperation } from '../server/operations';
import { ensureStarterPool, ensureStarter, starterClaimKey, pools, starterPoolStatus, setStarterBudget } from '../server/starterPool';
import { reserveRun, runs, recordTurnUsage, finishRun, wallet } from '../server/wallet';
import { replyToReview } from '../server/reviewReply';
import { decideApprovals, completeSurface } from '../server/agent';
import { localMcp } from '../server/mcp';
import { signInAdmin, adminIdentity } from '../server/admin';
import { searchOperations } from '../server/operationSearch';
import type { Request, Response } from 'express';
import { nearestCoarseCell, coarsePoint } from '../shared/geo';
import { acceptUpload, readUpload } from '../server/uploads';
import type { UploadRef } from '../shared/uploads';
import { streamLiveState, stopLiveState } from '../server/liveState';
import { config } from '../server/config';
import { applyCharge } from '../server/payments';

beforeAll(async () => { await connectDatabase(); if (db().databaseName !== 'newdrugs_test') throw new Error('Tests require the isolated cloud newdrugs_test database.'); });
async function clean() { if (db().databaseName !== 'newdrugs_test') throw new Error('Refusing to clean a non-test database.'); for (const collection of await db().collections()) await collection.deleteMany({}); }
beforeEach(async () => { await stopLiveState(); await clean(); await ensureStarterPool(); });
afterAll(async () => { await stopLiveState(); await clean(); await mongo.close(); });
const cell = nearestCoarseCell(41.824, -71.413);
async function area() { await rows('locationAreas').updateOne({ _id: cell }, { $set: { label: 'Providence area', point: coarsePoint(cell) } }, { upsert: true }); return cell; }
async function person(registered = true) {
  const user = await createGuest();
  if (registered) { await users().updateOne({ _id: user._id }, { $set: { handle: `test_${randomUUID().slice(0,8)}`, starterClaimKey: hash(randomUUID()) } }); await ensureStarter(user._id); }
  return { userId: user._id, source: 'external', scope: 'write' } as Actor;
}
describe('starter pool and owner', () => {
  it('issues one dollar once and honors the shared limit under concurrent signups', async () => {
    await pools().updateOne({ _id: 'starter' }, { $set: { budgetNanos: 1_000_000_000 } });
    const people = await Promise.all([createGuest(), createGuest(), createGuest()]);
    expect(people.reduce((n,u) => n + u.balanceNanos, 0)).toBe(0);
    await Promise.all(people.map((u, i) => registerAccount(u._id, `starter_${i}`, 'test-password-hash', `192.0.2.${i+1}`)));
    await Promise.all(people.map(u => ensureStarter(u._id)));
    expect((await starterPoolStatus()).grantedNanos).toBe(1_000_000_000);
    await setStarterBudget('owner', 3_000_000_000);
    await Promise.all(people.map(u => ensureStarter(u._id)));
    expect((await starterPoolStatus()).remainingNanos).toBe(0);
    for (const u of people) expect((await currentUser(u._id)).balanceNanos).toBe(1_000_000_000);
    await expect(setStarterBudget('owner', 2_000_000_000)).rejects.toMatchObject({ code: 'allocated_budget' });
  });
  it('separates owner sign-in from social accounts and prevents owner replacement', async () => {
    const trusted = { cookies: {}, get: (name: string) => name === 'X-NewDrugs-Dev-Key' ? 'isolated-test-setup' : undefined } as unknown as Request;
    const anonymous = { cookies: {}, get: () => undefined } as unknown as Request;
    let cookieName = '', secret = '';
    const response = { cookie: (name: string, value: string) => { cookieName = name; secret = value; } } as unknown as Response;
    await expect(signInAdmin(anonymous, response, 'intruder', 'password1')).rejects.toMatchObject({ code: 'setup_required' });
    await signInAdmin(trusted, response, 'owner', 'password1');
    expect(await users().countDocuments()).toBe(0);
    expect(await adminIdentity({ cookies: { [cookieName]: secret } } as Request)).toEqual({ id: 'owner', username: 'owner' });
    await expect(signInAdmin(trusted, response, 'replacement', 'password2')).rejects.toMatchObject({ code: 'credentials' });
    await signInAdmin(anonymous, response, 'owner', 'password1');
  });
});
describe('canonical operations', () => {
  it('filters discovery by authority and rejects cursors from a different query', async () => {
    const actor = await person();
    const page = await searchOperations({ query: '', mode: 'keyword', limit: 2 }, { ...actor, scope: 'read' });
    expect(page.matches.every(o => o.kind === 'read')).toBe(true);
    expect(page.matches.every(o => o.name !== 'profile.update')).toBe(true);
    expect(page.nextCursor).not.toBeNull();
    await expect(searchOperations({ query:'messages',mode:'keyword',cursor:page.nextCursor },{...actor,scope:'read'})).rejects.toMatchObject({code:'search_changed'});
    const next = await searchOperations({query:'',mode:'keyword',limit:2,cursor:page.nextCursor},{...actor,scope:'read'});
    expect(next.matches.some(o=>page.matches.some(p=>p.name===o.name))).toBe(false);
  });
  it('requires exact publishing confirmation, without the invented profile gate', async () => {
    const actor = await person(); const key = randomUUID();
    const areaCell = await area();
    await expect(executeOperation('posts.create', { text: 'A test post', areaCell }, actor, key)).rejects.toMatchObject({ code: 'confirmation_required' });
    const post = await executeOperation('posts.create', { text: 'A test post', areaCell }, actor, key, { confirmed: true });
    expect(post).toMatchObject({ text: 'A test post', city: 'Providence area', userId: actor.userId });
    expect((await currentUser(actor.userId)).discoverable).toBe(false);
    expect(await executeOperation('posts.create', { areaCell, text: 'A test post' }, actor, key, { confirmed: true })).toEqual(post);
    expect(await rows('posts').countDocuments()).toBe(1);
    await expect(executeOperation('posts.create', { text: 'Changed' }, actor, key, { confirmed: true })).rejects.toMatchObject({ code: 'idempotency_conflict' });
  });
  it('keeps profiles human-authored, including idempotent replays, and projects secrets out', async () => {
    const actor = await person(); const key = randomUUID();
    await executeOperation('profile.update', { bio: 'My own words' }, { ...actor, source: 'browser' }, key);
    await expect(executeOperation('profile.update', { bio: 'My own words' }, actor, key)).rejects.toMatchObject({ code: 'human_authored' });
    const me = await executeOperation('identity.get', {}, actor);
    expect(me).not.toHaveProperty('passwordHash'); expect(me).not.toHaveProperty('balanceNanos');
  });
  it('keeps independent actions independent when one fails', async () => {
    const actor = await person(); const connection = await localMcp(actor, {});
    try {
      const [success, failure] = await Promise.all([
        connection.client.callTool({name:'newdrugs_execute',arguments:{operation:'posts.create',input:{text:'Only one post'},idempotencyKey:randomUUID(),confirmed:true}}),
        connection.client.callTool({name:'newdrugs_execute',arguments:{operation:'posts.delete',input:{postId:'not-my-post'},idempotencyKey:randomUUID(),confirmed:true}}),
      ]);
      expect(success.structuredContent).toMatchObject({ok:true}); expect(failure.isError).toBe(true);
      expect((await connection.client.listTools()).tools.some(t=>t.name.includes('batch'))).toBe(false);
      expect(await rows('posts').countDocuments()).toBe(1);
    } finally { await connection.close(); }
  });
});
describe('durable task boundaries', () => {
  it('accepts a duplicate submission once and binds it to the same text', async () => {
    const actor = await person(); const id = `${actor.userId}:${randomUUID()}`;
    await reserveRun(actor.userId, id, 'hello'); await reserveRun(actor.userId, id, 'hello');
    expect(await rows('messages').countDocuments({ userId: actor.userId })).toBe(1);
    expect((await currentUser(actor.userId)).reservedNanos).toBe(60_000_000);
    await expect(reserveRun(actor.userId, id, 'different')).rejects.toMatchObject({ code: 'submission_conflict' });
  });
  it('fences writes after cancellation and validates a grouped decision before applying any of it', async () => {
    const actor = await person(); const id = `${actor.userId}:${randomUUID()}`; await reserveRun(actor.userId, id, 'post');
    await runs().updateOne({ _id: id }, { $set: { status: 'running', lease: 'test-lease', leaseUntil: Date.now() + 60000, cancelRequested: true } });
    await expect(executeOperation('posts.create', { text: 'Do not publish' }, { ...actor, source: 'agent' }, randomUUID(), { runId: id, lease: 'test-lease', confirmed: true })).rejects.toMatchObject({ code: 'stale_run' });
    expect(await rows('posts').countDocuments()).toBe(0);
    await runs().updateOne({ _id: id }, { $set: { status: 'waiting_for_approval', revision: 4, approvals: [{ id: 'one', operation: 'posts.create', input: {text:'hi'}, version:'test', digest:'digest', title:'Post', detail:'Publish', kind:'write', human:true, status:'pending', expiresAt:Date.now()+60000 }] } });
    await expect(decideApprovals(actor.userId,id,4,[{id:'one',approved:true},{id:'missing',approved:true}])).rejects.toBeDefined();
    expect((await runs().findOne({_id:id}))!.approvals[0].status).toBe('pending');
  });
  it('returns actual saved profile data when an editor completes', async () => {
    const actor = await person(); const id = `${actor.userId}:${randomUUID()}`; await reserveRun(actor.userId,id,'edit profile');
    await runs().updateOne({_id:id},{$set:{status:'waiting_for_input',surface:{id:'editor',view:'profile',waiting:true},approvals:[{id:'editor',operation:'app.open',input:{view:'profile'},version:'test',digest:'digest',title:'Profile',detail:'',kind:'input',human:true,status:'pending',expiresAt:Date.now()+60000}]}});
    await executeOperation('profile.update',{locationCell:await area()},{...actor,source:'browser'},randomUUID());
    await completeSurface(actor.userId,id,'editor',true);
    const run=(await runs().findOne({_id:id}))!;expect(run.status).toBe('queued');expect(run.approvals[0].result).toMatchObject({saved:true,profile:{city:'Providence area'}});
  });
});

describe('reported usage and reactive state', () => {
  const usage = (output: number) => ({ input_tokens: 1000, input_tokens_details: { cached_tokens: 100 }, output_tokens: output, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 1000 + output });
  async function running() {
    const actor = await person(), id = `${actor.userId}:${randomUUID()}`;
    await reserveRun(actor.userId, id, 'Test usage');
    await runs().updateOne({ _id: id }, { $set: { providerTurnId: 'turn', status: 'running', lease: 'lease', leaseUntil: Date.now() + 60000 } });
    return { actor, id };
  }
  it('debits returned usage immediately, only charges cumulative increases, and never charges it twice at completion', async () => {
    const { actor, id } = await running();
    await recordTurnUsage(id, 'turn', usage(100), 0, 'lease');
    expect((await wallet(actor.userId)).balanceNanos).toBe(1e9 - 141000);
    await recordTurnUsage(id, 'turn', usage(100), 0, 'lease');
    expect((await wallet(actor.userId)).balanceNanos).toBe(1e9 - 141000);
    await recordTurnUsage(id, 'turn', usage(200), 0, 'lease');
    await finishRun(id, 'lease', 'Done', 'completed');
    expect(await wallet(actor.userId)).toMatchObject({ balanceNanos: 1e9 - 191000, reservedNanos: 0 });
    expect(await rows('ledger').countDocuments({ _id: `usage:${id}` })).toBe(1);
  });
  it('handles missing and late reports, including downward correction and replay', async () => {
    const { actor, id } = await running();
    await recordTurnUsage(id, 'turn', null, 0, 'lease');
    expect((await runs().findOne({ _id: id }))?.usagePending).toBe(true);
    await finishRun(id, 'lease', 'Done', 'completed');
    expect((await wallet(actor.userId)).balanceNanos).toBe(1e9);
    await recordTurnUsage(id, 'turn', usage(200));
    await recordTurnUsage(id, 'turn', null);
    expect((await wallet(actor.userId)).balanceNanos).toBe(1e9 - 191000);
    await recordTurnUsage(id, 'turn', usage(100));
    expect((await wallet(actor.userId)).balanceNanos).toBe(1e9 - 141000);
    await recordTurnUsage(id, 'turn', usage(100));
    expect((await wallet(actor.userId)).balanceNanos).toBe(1e9 - 141000);
  });
  it('streams committed wallet/run updates, isolates accounts, and closes on session revocation', async () => {
    const { actor, id } = await running(), other = await person();
    const secret = randomUUID();
    await rows('sessions').insertOne({ _id: hash(secret), userId: actor.userId, expiresAt: new Date(Date.now() + 60000) });
    const chunks: string[] = [];
    const emitter = new EventEmitter();
    const response = Object.assign(emitter, { writableLength: 0, writableEnded: false,
      status() { return this; }, set() { return this; }, flushHeaders() {},
      write(chunk: string) { chunks.push(chunk); return true; }, end() { this.writableEnded = true; emitter.emit('close'); } });
    await streamLiveState({ actor: { ...actor, source: 'browser' }, cookies: { [config.SESSION_COOKIE]: secret } } as unknown as Request, response as unknown as Response);
    const state = () => chunks.filter(chunk => chunk.startsWith('event: state')).map(chunk => JSON.parse(chunk.split('data: ')[1]));
    expect(state()[0].change.user.id).toBe(actor.userId);
    const count = state().length;
    await users().updateOne({ _id: other.userId }, { $set: { name: 'Other private name' } });
    await recordTurnUsage(id, 'turn', usage(100), 0, 'lease');
    await vi.waitFor(() => expect(state().some(event => event.change.wallet?.balanceNanos === 1e9 - 141000)).toBe(true), { timeout: 5000 });
    expect(chunks.join('')).not.toContain('Other private name');
    expect(state().length).toBeGreaterThan(count);
    expect(state().map(event => event.sequence)).toEqual([...new Set(state().map(event => event.sequence))].sort((a: any, b: any) => a - b));
    await rows('sessions').deleteOne({ _id: hash(secret) });
    await vi.waitFor(() => expect(response.writableEnded).toBe(true), { timeout: 5000 });
  });
  it('preserves the selected credit amount and reconciles duplicate/refund events without double credit', async () => {
    const actor = await person();
    const payment = { id: 'test-charge', userId: actor.userId, amount: 546, fee: 60, refunded: 0, creditCents: 500 };
    await applyCharge(payment); await applyCharge(payment);
    expect((await wallet(actor.userId)).balanceNanos).toBe(6e9);
    expect((await rows('payments').findOne({ _id: payment.id }))?.operatorCoveredCents).toBe(14);
    await applyCharge({ ...payment, refunded: 546 }); await applyCharge(payment);
    expect((await wallet(actor.userId)).balanceNanos).toBe(1e9);
  });
});

describe('human profile photos and real areas', () => {
  it('uses a fixed coarse point for nearby results and excludes blocked people', async () => {
    const actor = await person(), neighbor = await person(); await area();
    for (const p of [actor, neighbor]) await executeOperation('profile.update', { locationCell: cell, discoverable: true }, { ...p, source: 'browser' }, randomUUID());
    const nearby = await executeOperation('people.search', { radiusMiles: 25 }, actor) as { items: { id: string; area: unknown }[] };
    expect(nearby.items.map(p => p.id)).toContain(neighbor.userId);
    expect(nearby.items[0].area).toMatchObject({ cell, point: coarsePoint(cell) });
    expect(nearby.items[0]).toMatchObject({ sameArea: true, distanceLabel: 'In your approximate area' });
    expect(nearby.items[0]).not.toHaveProperty('approximateMiles');
    await executeOperation('people.block', { personId: neighbor.userId, blocked: true }, actor, randomUUID());
    expect((await executeOperation('people.search', { radiusMiles: 25 }, actor) as { items: unknown[] }).items).toHaveLength(0);
  });
  it('uploads a real photo, strips metadata, checks ownership, and makes only chosen discoverable photos public', async () => {
    const actor = { ...await person(), source: 'browser' as const }, other = await person();
    const bytes = await sharp({ create: { width: 12, height: 12, channels: 3, background: '#123456' } }).withMetadata().jpeg().toBuffer();
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const prepared = await executeOperation('files.prepare', { name: 'test.jpg', bytes: bytes.length, sha256, purpose: 'profile_photo' }, actor, randomUUID()) as UploadRef;
    await expect(acceptUpload(other, prepared.id, bytes)).rejects.toBeDefined();
    await expect(acceptUpload(actor, prepared.id, Buffer.from('wrong bytes'))).rejects.toMatchObject({ code: 'file_mismatch' });
    const uploaded = await acceptUpload(actor, prepared.id, bytes);
    expect(uploaded).toMatchObject({ ready: true, mime: 'image/webp' });
    const saved = await readUpload(actor, uploaded.id);
    expect((await sharp(saved.bytes).metadata()).exif).toBeUndefined();
    await expect(readUpload(other, uploaded.id, true)).rejects.toMatchObject({ code: 'not_found' });
    await executeOperation('profile.update', { photos: [uploaded.id], discoverable: true }, actor, randomUUID());
    expect((await readUpload(other, uploaded.id, true)).file._id).toBe(uploaded.id);
    await expect(executeOperation('profile.update', { photos: [uploaded.id] }, { ...other, source: 'browser' }, randomUUID())).rejects.toBeDefined();
  });
});

describe('manual social flow shared with agents', () => {
  it('reads a stable context window around one authorized human message',async()=>{
    const sender=await person(),recipient=await person(),outsider=await person();
    await users().updateOne({_id:recipient.userId},{$set:{discoverable:true,name:'Recipient'}});
    const invitation=await executeOperation('connections.request',{personId:recipient.userId,note:'Hello'},sender,randomUUID(),{confirmed:true}) as {id:string};
    await executeOperation('connections.respond',{connectionId:invitation.id,accept:true},recipient,randomUUID(),{confirmed:true});
    const messages=Array.from({length:45},(_,index)=>({_id:(index+1).toString(16).padStart(24,'0'),connectionId:invitation.id,fromId:index%2?recipient.userId:sender.userId,text:`Message ${index+1}`,createdAt:new Date(1_700_000_000_000+index).toISOString()}));
    await rows('directMessages').insertMany(messages);
    const window=await executeOperation('messages.window',{messageId:messages[22]._id},sender) as any;
    expect(window.items).toHaveLength(41);expect(window.items[20]).toMatchObject({id:messages[22]._id,text:'Message 23'});
    expect(window.items.map((message:any)=>message.id)).toEqual(messages.slice(2,43).map(message=>message._id));
    expect(window).toMatchObject({targetId:messages[22]._id,olderCursor:messages[2]._id,newerCursor:messages[42]._id,connection:{id:invitation.id,status:'accepted'}});
    expect(window.people).toHaveLength(2);
    await expect(executeOperation('messages.window',{messageId:messages[22]._id},outsider)).rejects.toThrow();
  });
  it('reviews invitations, sends requested DMs without review, and keeps unread state and blocks authoritative', async () => {
    const sender = await person(), recipient = await person(), stranger = await person();
    await users().updateOne({ _id: recipient.userId }, { $set: { discoverable: true, name: 'Recipient' } });
    await expect(executeOperation('connections.request', { personId: recipient.userId, note: 'coffee?' }, sender, randomUUID())).rejects.toMatchObject({ code: 'confirmation_required' });
    const invitation = await executeOperation('connections.request', { personId: recipient.userId, note: 'coffee?' }, sender, randomUUID(), { confirmed: true }) as { id: string };
    const notifications = await executeOperation('notifications.list', {}, recipient) as { unread: number; items: { link: { url: string; targetKind: string } }[] };
    expect(notifications.unread).toBe(1); expect(notifications.items[0].link).toMatchObject({ targetKind: 'exact' });
    expect(notifications.items[0].link.url).toContain(encodeURIComponent(invitation.id));
    await expect(executeOperation('messages.send', { connectionId: invitation.id, text: 'too soon' }, sender, randomUUID())).rejects.toBeDefined();
    await expect(executeOperation('connections.respond', { connectionId: invitation.id, accept: true }, stranger, randomUUID(), { confirmed: true })).rejects.toBeDefined();
    await executeOperation('connections.respond', { connectionId: invitation.id, accept: true }, recipient, randomUUID(), { confirmed: true });
    const key = randomUUID(), input = { connectionId: invitation.id, text: 'hey, 6 works for me' };
    const message = await executeOperation('messages.send', input, sender, key) as { id: string };
    expect(await executeOperation('messages.send', input, sender, key)).toEqual(message);
    expect(await rows('directMessages').countDocuments()).toBe(1);
    expect(await executeOperation('connections.list', {}, recipient)).toMatchObject({ items: [{ unread: true, lastMessage: { text: input.text } }] });
    expect(await executeOperation('notifications.list', {}, recipient)).toMatchObject({ unread: 1 });
    await executeOperation('messages.mark_read', { connectionId: invitation.id, throughMessageId: message.id }, recipient, randomUUID());
    expect(await executeOperation('notifications.list', {}, recipient)).toMatchObject({ unread: 0 });
    await executeOperation('people.block', { personId: sender.userId, blocked: true }, recipient, randomUUID());
    await expect(executeOperation('messages.send', { ...input, text: 'blocked' }, sender, randomUUID())).rejects.toBeDefined();
    expect(await executeOperation('connections.list', {}, sender)).toMatchObject({ items: [] });
    expect(await executeOperation('notifications.list', {}, sender)).toMatchObject({ unread: 0 });
    expect(await executeOperation('people.blocked', {}, recipient)).toMatchObject({ items: [{ personId: sender.userId }] });
    expect(await executeOperation('people.blocked', {}, sender)).toMatchObject({ items: [] });
    await executeOperation('people.block', { personId: sender.userId, blocked: false }, recipient, randomUUID());
    expect(await executeOperation('connections.get', { connectionId: invitation.id }, sender)).toMatchObject({ connection: { status: 'accepted' } });
  });
  it('withdraws only an owned pending invitation and removes its notification', async () => {
    const sender = await person(), recipient = await person();
    await users().updateOne({ _id: recipient.userId }, { $set: { discoverable: true } });
    const invitation = await executeOperation('connections.request', { personId: recipient.userId, note: 'hi' }, sender, randomUUID(), { confirmed: true }) as { id: string };
    await expect(executeOperation('connections.withdraw', { connectionId: invitation.id }, recipient, randomUUID())).rejects.toBeDefined();
    expect(await executeOperation('connections.withdraw', { connectionId: invitation.id }, sender, randomUUID())).toMatchObject({ status: 'withdrawn' });
    expect(await executeOperation('notifications.list', {}, recipient)).toMatchObject({ unread: 0 });
    await expect(executeOperation('connections.respond', { connectionId: invitation.id, accept: true }, recipient, randomUUID(), { confirmed: true })).rejects.toBeDefined();
  });
});

describe('verified chat attachments and continuity', () => {
  it('resumes the exact upload request with owned verified files and retained contents', async () => {
    const actor = { ...await person(), source: 'browser' as const }, other = await person(), id = `${actor.userId}:${randomUUID()}`;
    await reserveRun(actor.userId, id, 'read the file');
    await runs().updateOne({ _id: id }, { $set: { status: 'waiting_for_input', surface: { id: 'upload-request', view: 'uploads', waiting: true }, approvals: [{ id: 'upload-request', operation: 'app.open', input: { view: 'uploads' }, version: 'test', digest: 'digest', title: 'Upload', detail: '', kind: 'input', human: true, status: 'pending', expiresAt: Date.now() + 60000 }] } });
    const bytes = Buffer.from('A human-chosen test file.');
    const prepared = await executeOperation('files.prepare', { name: 'notes.txt', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), purpose: 'agent_input', requestId: 'upload-request' }, actor, randomUUID()) as UploadRef;
    await expect(completeSurface(actor.userId, id, 'upload-request', true, [prepared.id])).rejects.toMatchObject({ code: 'file_not_ready' });
    await acceptUpload(actor, prepared.id, bytes);
    await expect(completeSurface(other.userId, id, 'upload-request', true, [prepared.id])).rejects.toBeDefined();
    const { fileInput } = await import('../server/uploads');
    await expect(fileInput(actor.userId, prepared.id)).rejects.toMatchObject({ code: 'file_not_attached' });
    await completeSurface(actor.userId, id, 'upload-request', true, [prepared.id]);
    await completeSurface(actor.userId, id, 'upload-request', true, [prepared.id]);
    expect(await runs().findOne({ _id: id })).toMatchObject({ status: 'queued', fileIds: [prepared.id], approvals: [{ result: { saved: true, files: [{ id: prepared.id }] } }] });
    expect(JSON.stringify(await fileInput(actor.userId, prepared.id))).toContain('human-chosen');
    await expect(executeOperation('files.discard', { fileId: prepared.id }, actor, randomUUID())).rejects.toMatchObject({ code: 'file_in_use' });
    expect(await rows('messages').countDocuments({ _id: `${id}:upload:upload-request` })).toBe(1);
  });
  it('rebuilds a new provider session from owned history and completed receipts, without replaying them', async () => {
    const actor = await person(), other = await person();
    await executeOperation('conversation.append', { role: 'user', text: 'yo sounds good' }, actor, randomUUID());
    await executeOperation('conversation.append', { role: 'user', text: 'Private other-account message' }, other, randomUUID());
    await executeOperation('posts.create', { text: 'Already published' }, actor, randomUUID(), { confirmed: true });
    const id = `${actor.userId}:${randomUUID()}`; await reserveRun(actor.userId, id, 'what happened before?');
    const { sessionInput } = await import('../server/sessionContext');
    const input = JSON.stringify(await sessionInput((await runs().findOne({ _id: id }))!));
    expect(input).toContain('yo sounds good'); expect(input).toContain('Already published'); expect(input).not.toContain('Private other-account message');
    expect(await rows('posts').countDocuments()).toBe(1);
  });
});

it('honors no-expiry, expired, read-only and revoked external tokens', async () => {
  const actor = await person();
  const { authenticate } = await import('../server/auth');
  const token = `nd_${'x'.repeat(44)}`;
  await rows('tokens').insertOne({ _id: randomUUID(), userId: actor.userId, hash: hash(token), expiresAt: null, revokedAt: null, scope: 'read' });
  const check = async () => { const request = { get: (name: string) => name === 'Authorization' ? `Bearer ${token}` : undefined, cookies: {} } as unknown as Request; let failure: unknown; await authenticate(request, {} as Response, error => { failure = error; }); return { request, failure }; };
  expect((await check()).request.actor).toMatchObject({ userId: actor.userId, scope: 'read' });
  await expect(executeOperation('messages.send', { connectionId: 'none', text: 'no' }, { ...actor, scope: 'read' }, randomUUID())).rejects.toMatchObject({ code: 'scope' });
  await rows('tokens').updateOne({ hash: hash(token) }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  expect((await check()).failure).toMatchObject({ code: 'unauthorized' });
  await rows('tokens').updateOne({ hash: hash(token) }, { $set: { expiresAt: null, revokedAt: new Date().toISOString() } });
  expect((await check()).failure).toMatchObject({ code: 'unauthorized' });
});

it('downscales every image, enforces the free quota, and lets people reclaim owned storage', async () => {
  const actor = { ...await person(), source: 'browser' as const }, other = await person();
  const bytes = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#456789' } }).jpeg().toBuffer();
  const prepared = await executeOperation('files.prepare', { name: 'large.jpg', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), purpose: 'profile_photo' }, actor, randomUUID()) as UploadRef;
  const uploaded = await acceptUpload(actor, prepared.id, bytes);
  const metadata = await sharp((await readUpload(actor, prepared.id)).bytes).metadata();
  expect(Math.min(metadata.width!, metadata.height!)).toBe(512);
  await executeOperation('profile.update', { photos: [prepared.id] }, actor, randomUUID());
  expect(await executeOperation('storage.list', {}, actor)).toMatchObject({ usedBytes: uploaded.bytes, limitBytes: 64 * 1024 * 1024, items: [{ id: prepared.id, inProfile: true }] });
  expect(await executeOperation('storage.list', {}, other)).toMatchObject({ usedBytes: 0, items: [] });
  await expect(executeOperation('files.delete', { fileId: prepared.id }, actor, randomUUID())).rejects.toMatchObject({ code: 'confirmation_required' });
  await expect(executeOperation('files.delete', { fileId: prepared.id }, { ...actor, source: 'external' }, randomUUID(), { confirmed: true })).rejects.toMatchObject({ code: 'human_authored' });
  const key = randomUUID();
  await executeOperation('files.delete', { fileId: prepared.id }, actor, key, { confirmed: true });
  await executeOperation('files.delete', { fileId: prepared.id }, actor, key, { confirmed: true });
  expect(await executeOperation('storage.list', {}, actor)).toMatchObject({ usedBytes: 0, items: [] });
  expect((await currentUser(actor.userId)).photos).toEqual([]);
  await expect(readUpload(actor, prepared.id)).rejects.toBeDefined();
  const { expireUploads } = await import('../server/uploads'); await expireUploads();
  expect(await rows('uploads').countDocuments()).toBe(0);
  await users().updateOne({ _id: actor.userId }, { $set: { storageBytes: 64 * 1024 * 1024 } });
  await expect(executeOperation('files.prepare', { name: 'full.txt', bytes: 1, sha256: 'a'.repeat(64), purpose: 'agent_input' }, actor, randomUUID())).rejects.toMatchObject({ code: 'storage_limit' });
});

it('supports retry-safe likes, reviewed public replies, thread deletion and block filtering', async () => {
  const author = await person(), reader = await person(), stranger = await person();
  const post = await executeOperation('posts.create', { text: 'coffee outside later?' }, author, randomUUID(), { confirmed: true }) as { id: string };
  const key = randomUUID();
  const liked = await executeOperation('posts.like', { postId: post.id, liked: true }, reader, key);
  expect(liked).toMatchObject({ liked: true, likeCount: 1 });
  expect(await executeOperation('posts.like', { postId: post.id, liked: true }, reader, key)).toEqual(liked);
  expect(await rows('postLikes').countDocuments()).toBe(1);
  expect(await executeOperation('notifications.list', {}, author)).toMatchObject({ items: [{ kind: 'post_like', link: { targetKind: 'exact', resourceId: post.id } }] });
  await expect(executeOperation('posts.reply', { postId: post.id, text: 'yeah im in' }, reader, randomUUID())).rejects.toMatchObject({ code: 'confirmation_required' });
  const reply = await executeOperation('posts.reply', { postId: post.id, text: 'yeah im in' }, reader, randomUUID(), { confirmed: true }) as { id: string };
  expect(await executeOperation('posts.get', { postId: post.id }, author)).toMatchObject({ replyCount: 1, likeCount: 1 });
  expect(await executeOperation('posts.replies', { postId: post.id }, author)).toMatchObject({ items: [{ id: reply.id, parentId: post.id, text: 'yeah im in' }] });
  const feed = await executeOperation('posts.list', { scope: 'public' }, author) as { items: { id: string }[] };
  expect(feed.items.map(item => item.id)).toEqual([post.id]);
  await executeOperation('posts.like', { postId: post.id, liked: false }, reader, randomUUID());
  expect(await executeOperation('posts.get', { postId: post.id }, author)).toMatchObject({ likeCount: 0 });
  await executeOperation('people.block', { personId: reader.userId, blocked: true }, author, randomUUID());
  expect(await executeOperation('posts.replies', { postId: post.id }, author)).toMatchObject({ items: [] });
  await expect(executeOperation('posts.like', { postId: post.id, liked: true }, reader, randomUUID())).rejects.toBeDefined();
  await expect(executeOperation('posts.reply', { postId: post.id, text: 'blocked' }, reader, randomUUID(), { confirmed: true })).rejects.toBeDefined();
  await expect(executeOperation('posts.delete', { postId: post.id }, stranger, randomUUID(), { confirmed: true })).rejects.toBeDefined();
  await executeOperation('posts.delete', { postId: post.id }, author, randomUUID(), { confirmed: true });
  expect(await executeOperation('posts.get', { postId: post.id }, stranger)).toMatchObject({ deleted: true, text: '' });
  expect(await executeOperation('posts.replies', { postId: post.id }, stranger)).toMatchObject({ items: [{ id: reply.id }] });
});

it('profile removal releases the stored bytes in the same saved change', async () => {
  const actor = { ...await person(), source: 'browser' as const };
  const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#abc123' } }).png().toBuffer();
  const file = await executeOperation('files.prepare', { name: 'photo.png', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), purpose: 'profile_photo' }, actor, randomUUID()) as UploadRef;
  await acceptUpload(actor, file.id, bytes);
  await executeOperation('profile.update', { photos: [file.id] }, actor, randomUUID());
  await executeOperation('profile.update', { photos: [] }, actor, randomUUID());
  expect(await executeOperation('storage.list', {}, actor)).toMatchObject({ usedBytes: 0, items: [] });
  await expect(readUpload(actor, file.id)).rejects.toBeDefined();
});

it('opens an agent-selected post feed in exact order and rechecks visibility on every read',async()=>{
 const reader=await person(),author=await person(),hidden=await person();
 const one=await executeOperation('posts.create',{text:'first selected post'},author,randomUUID(),{confirmed:true}) as {id:string};
 const two=await executeOperation('posts.create',{text:'second selected post'},author,randomUUID(),{confirmed:true}) as {id:string};
 const blocked=await executeOperation('posts.create',{text:'not for this viewer'},hidden,randomUUID(),{confirmed:true}) as {id:string};
 await executeOperation('people.block',{personId:hidden.userId,blocked:true},reader,randomUUID());
 const postIds=[two.id,blocked.id,one.id,two.id,'missing'];
 const selected=await executeOperation('posts.list',{scope:'selected',postIds},reader) as {items:{id:string}[]};expect(selected.items.map(post=>post.id)).toEqual([two.id,one.id]);
 expect(await executeOperation('app.open',{view:'post_list',postIds},reader)).toMatchObject({open:'post_list',postIds:[two.id,one.id]});
 await executeOperation('posts.delete',{postId:two.id},author,randomUUID(),{confirmed:true});
 expect(await executeOperation('posts.list',{scope:'selected',postIds},reader)).toMatchObject({items:[{id:one.id}]});
 await expect(executeOperation('app.open',{view:'post_list'},reader)).rejects.toMatchObject({code:'posts_required'});
});

describe('photo posts and typed review rejection', () => {
  async function photo(actor: Actor) {
    const bytes = await sharp({ create: { width: 720, height: 1000, channels: 3, background: '#447733' } }).jpeg().toBuffer();
    const file = await executeOperation('files.prepare', { name: 'plant.jpg', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), purpose: 'agent_input' }, actor, randomUUID()) as UploadRef;
    return acceptUpload(actor, file.id, bytes);
  }
  it('publishes only owned ready images, keeps idempotency, and hides deleted/blocked photos', async () => {
    const actor = await person(), other = await person(), file = await photo(actor);
    await expect(readUpload(other, file.id, true)).rejects.toMatchObject({ code: 'not_found' });
    await expect(executeOperation('posts.create', { text: 'Stolen photo', fileIds: [file.id] }, other, randomUUID(), { confirmed: true })).rejects.toBeDefined();
    await expect(executeOperation('posts.create', { text: 'No review', fileIds: [file.id] }, actor, randomUUID())).rejects.toBeDefined();
    const key = randomUUID(), input = { text: 'check out this plant', fileIds: [file.id], areaCell: await area() };
    const post = await executeOperation('posts.create', input, actor, key, { confirmed: true }) as any;
    expect(post.photos).toEqual([{ id: file.id, name: 'plant.webp', url: `/api/files/${file.id}` }]);
    for (const filter of [{ scope: 'own' }, { scope: 'public' }, { scope: 'selected', postIds: [post.id] }, { scope: 'public', near: cell, radiusMiles: 25 }]) {
      const listed = await executeOperation('posts.list', filter, actor) as any;
      expect(listed.items.find((item: any) => item.id === post.id)?.photos, JSON.stringify(filter)).toEqual(post.photos);
    }
    expect((await executeOperation('posts.create', input, actor, key, { confirmed: true }) as any).id).toBe(post.id);
    const publicFile = await readUpload(other, file.id, true); expect((await sharp(publicFile.bytes).metadata()).width).toBe(512);
    expect(await rows('posts').countDocuments()).toBe(1);
    const reply = await executeOperation('posts.reply', { postId: post.id, text: 'another view', fileIds: [file.id] }, actor, randomUUID(), { confirmed: true }) as any;
    expect(reply.photos[0].id).toBe(file.id);
    expect((await executeOperation('posts.replies', { postId: post.id }, actor) as any).items[0].photos).toEqual(post.photos);
    await executeOperation('people.block', { personId: other.userId, blocked: true }, actor, randomUUID());
    await expect(readUpload(other, file.id, true)).rejects.toMatchObject({ code: 'not_found' });
    await executeOperation('people.block', { personId: other.userId, blocked: false }, actor, randomUUID());
    await executeOperation('posts.delete', { postId: post.id }, actor, randomUUID(), { confirmed: true });
    expect((await executeOperation('posts.get', { postId: post.id }, actor) as any).photos).toEqual([]);
    await readUpload(other, file.id, true); // Still attached to the reply.
    await executeOperation('files.delete', { fileId: file.id }, actor, randomUUID(), { confirmed: true });
    await expect(readUpload(other, file.id, true)).rejects.toBeDefined();
    expect((await executeOperation('posts.get', { postId: reply.id }, actor) as any).photos).toEqual([]);
  });
  it('declines pending actions and saves the correction once, without a second credit hold', async () => {
    const actor = await person(), other = await person(), id = `${actor.userId}:${randomUUID()}`;
    await reserveRun(actor.userId, id, 'Publish these');
    const approval = { operation: 'posts.create', input: { text: 'Draft' }, version: 'test', digest: 'test', title: 'Post', detail: 'Publish', human: true, kind: 'write' as const, expiresAt: Date.now() + 60000 };
    await runs().updateOne({ _id: id }, { $set: { status: 'waiting_for_approval', revision: 4, approvals: [{ ...approval, id: 'a', status: 'pending' }, { ...approval, id: 'b', status: 'pending' }, { ...approval, id: 'done', status: 'approved', result: { ok: true } }] } });
    const review = { runId: id, revision: 4 }, reply = { requestId: randomUUID(), text: 'nah use tomorrow', fileIds: [] };
    await expect(replyToReview(other.userId, review, reply)).rejects.toMatchObject({ code: 'review_changed' });
    const next = await replyToReview(actor.userId, review, reply);
    expect(next.status).toBe('queued'); expect(next.approvals.map(action => action.status)).toEqual(['rejected', 'rejected', 'approved']);
    expect(next.reviewReplies?.[0]).toMatchObject({ text: reply.text, actionIds: ['a', 'b'] });
    await replyToReview(actor.userId, review, reply);
    expect(await rows('messages').countDocuments({ userId: actor.userId, text: reply.text })).toBe(1);
    expect((await wallet(actor.userId)).reservedNanos).toBe(60000000);
    await expect(replyToReview(actor.userId, review, { ...reply, text: 'different' })).rejects.toMatchObject({ code: 'submission_conflict' });
    await expect(decideApprovals(actor.userId, id, 4, [{ id: 'a', approved: true }])).rejects.toBeDefined();
    await expect(replyToReview(actor.userId, review, { ...reply, requestId: randomUUID() })).rejects.toMatchObject({ code: 'review_changed' });
    expect(await rows('posts').countDocuments()).toBe(0);
  });
});

describe('notification history', () => {
  it('marks existing notifications and invitation notices read while leaving later arrivals unread',async()=>{
    const sender=await person(),recipient=await person();
    await users().updateOne({_id:recipient.userId},{$set:{discoverable:true}});
    const invitation=await executeOperation('connections.request',{personId:recipient.userId,note:'Hi'},sender,randomUUID(),{confirmed:true}) as any;
    const earlier=new Date(Date.now()-60_000).toISOString(),later=new Date(Date.now()+60_000).toISOString();
    await rows('notifications').insertMany([
      {_id:randomUUID(),userId:recipient.userId,actorId:sender.userId,kind:'alert',resourceType:'credits',resourceId:'credit',title:'Earlier',text:'',createdAt:earlier,readAt:null},
      {_id:randomUUID(),userId:recipient.userId,actorId:sender.userId,kind:'alert',resourceType:'credits',resourceId:'credit',title:'Later',text:'',createdAt:later,readAt:null},
    ]);
    await executeOperation('notifications.read_all',{},recipient,randomUUID());
    const state=await executeOperation('notifications.list',{},recipient) as any;
    expect(state.items.find((item:any)=>item.id===`invite:${invitation.id}`)?.read).toBe(true);
    expect(state.items.find((item:any)=>item.title==='Earlier')?.read).toBe(true);
    expect(state.items.find((item:any)=>item.title==='Later')?.read).toBe(false);
    expect((await rows('connections').findOne({_id:invitation.id}))?.status).toBe('pending');
  });
  it('retains read messages and invitations with exact links, restores unread for new messages, and respects blocks', async () => {
    const sender = await person(), recipient = await person(), stranger = await person();
    await users().updateOne({ _id: recipient.userId }, { $set: { discoverable: true } });
    const invitation = await executeOperation('connections.request', { personId: recipient.userId, note: 'original invitation' }, sender, randomUUID(), { confirmed: true }) as any;
    const inviteId = `invite:${invitation.id}`;
    await expect(executeOperation('notifications.read', { notificationId: inviteId }, stranger, randomUUID())).rejects.toBeDefined();
    await executeOperation('notifications.read', { notificationId: inviteId }, recipient, randomUUID());
    const seenInvite = await executeOperation('notifications.list', {}, recipient) as any;
    expect(seenInvite).toMatchObject({ unread: 0, items: [{ id: inviteId, read: true, text: 'original invitation' }] });
    expect((await executeOperation('connections.get', { connectionId: invitation.id }, recipient) as any).connection.status).toBe('pending');
    await executeOperation('connections.respond', { connectionId: invitation.id, accept: true }, recipient, randomUUID(), { confirmed: true });
    const message = await executeOperation('messages.send', { connectionId: invitation.id, text: 'first DM' }, sender, randomUUID()) as any;
    await executeOperation('messages.mark_read', { connectionId: invitation.id, throughMessageId: message.id }, recipient, randomUUID());
    const history = await executeOperation('notifications.list', {}, recipient) as any;
    expect(history.unread).toBe(0); expect(history.items).toHaveLength(2);
    const savedMessage = history.items.find((item: any) => item.kind === 'message');
    expect(savedMessage).toMatchObject({ read: true, text: 'first DM', link: { targetKind: 'exact', resourceId: invitation.id } });
    expect(history.items.find((item: any) => item.id === inviteId)?.read).toBe(true);
    await executeOperation('messages.send', { connectionId: invitation.id, text: 'second DM' }, sender, randomUUID());
    const fresh = await executeOperation('notifications.list', {}, recipient) as any;
    expect(fresh).toMatchObject({ unread: 1, items: [{ id: savedMessage.id, read: false, text: 'second DM' }, { id: inviteId, read: true }] });
    await executeOperation('notifications.read', { notificationId: savedMessage.id }, recipient, randomUUID());
    expect(await executeOperation('notifications.list', {}, recipient)).toMatchObject({ unread: 0 });
    await executeOperation('people.block', { personId: sender.userId, blocked: true }, recipient, randomUUID());
    expect(await executeOperation('notifications.list', {}, recipient)).toMatchObject({ unread: 0, items: [] });
  });
});

describe('profile post pin',()=>{
  it('keeps one active top-level pin separate from chronological posts and clears it on deletion',async()=>{
    const author=await person(),other=await person();
    const older=await executeOperation('posts.create',{text:'Older post'},author,randomUUID(),{confirmed:true}) as any;
    const newer=await executeOperation('posts.create',{text:'Newer post'},author,randomUUID(),{confirmed:true}) as any;
    const pinned=await executeOperation('posts.pin',{postId:older.id,pinned:true},author,randomUUID()) as any;
    expect(pinned.pinned).toBe(true);
    const first=await executeOperation('posts.list',{scope:'public',authorId:author.userId,kind:'posts',limit:1},author) as any;
    expect(first.pinned.id).toBe(older.id);expect(first.items.map((post:any)=>post.id)).toEqual([newer.id]);
    const second=await executeOperation('posts.list',{scope:'public',authorId:author.userId,kind:'posts',limit:1,before:first.nextCursor},author) as any;
    expect(second.items.map((post:any)=>post.id)).toEqual([older.id]);expect(second.pinned).toBeUndefined();
    await executeOperation('posts.pin',{postId:newer.id,pinned:true},author,randomUUID());
    expect((await currentUser(author.userId)).pinnedPostId).toBe(newer.id);
    expect((await executeOperation('posts.get',{postId:older.id},author) as any).pinned).toBe(false);
    await executeOperation('posts.pin',{postId:older.id,pinned:false},author,randomUUID());
    expect((await currentUser(author.userId)).pinnedPostId).toBe(newer.id);
    const reply=await executeOperation('posts.reply',{postId:older.id,text:'A reply'},author,randomUUID(),{confirmed:true}) as any;
    await expect(executeOperation('posts.pin',{postId:reply.id,pinned:true},author,randomUUID())).rejects.toMatchObject({code:'post_unavailable'});
    await expect(executeOperation('posts.pin',{postId:older.id,pinned:true},other,randomUUID())).rejects.toMatchObject({code:'not_found'});
    await executeOperation('posts.delete',{postId:newer.id},author,randomUUID(),{confirmed:true});
    expect((await currentUser(author.userId)).pinnedPostId).toBeUndefined();
    expect((await executeOperation('posts.list',{scope:'public',authorId:author.userId,kind:'posts'},author) as any).pinned).toBeNull();
  });
});

describe('post mentions and polls',()=>{
  it('binds username text to the person at publish time and records one exact vote per person',async()=>{
    const author=await person(),mentioned=await person(),voter=await person();
    const handle=(await currentUser(mentioned.userId)).handle!;
    const preview=await executeOperation('posts.mentions',{handles:[handle]},author) as any;
    expect(preview.items).toMatchObject([{handle,userId:mentioned.userId}]);
    const post=await executeOperation('posts.create',{text:`Hi @${handle}, pick one`,poll:{items:['Yes','No'],duration:'day'}},author,randomUUID(),{confirmed:true}) as any;
    expect(post.mentions).toEqual([{start:3,end:4+handle.length,userId:mentioned.userId}]);
    expect(post.poll).toMatchObject({items:['Yes','No'],counts:[0,0],totalVotes:0,userVoteIndex:null});
    expect((await executeOperation('notifications.list',{},mentioned) as any).items).toMatchObject([{kind:'post_mention',link:{resourceId:post.id}}]);
    await users().updateOne({_id:mentioned.userId},{$set:{handle:`changed_${randomUUID().slice(0,8)}`}});
    const afterRename=await executeOperation('posts.get',{postId:post.id},author) as any;
    expect(afterRename.text).toContain(`@${handle}`);expect(afterRename.mentions[0].userId).toBe(mentioned.userId);
    const voted=await executeOperation('posts.vote',{postId:post.id,optionIndex:1},voter,randomUUID()) as any;
    expect(voted.poll).toMatchObject({counts:[0,1],totalVotes:1,userVoteIndex:1});
    expect((await executeOperation('posts.get',{postId:post.id},author) as any).poll.userVoteIndex).toBeNull();
    await expect(executeOperation('posts.vote',{postId:post.id,optionIndex:0},voter,randomUUID())).rejects.toMatchObject({code:'poll_voted'});
    await expect(executeOperation('posts.vote',{postId:post.id,optionIndex:2},author,randomUUID())).rejects.toMatchObject({code:'poll_option'});
    await executeOperation('posts.delete',{postId:post.id},author,randomUUID(),{confirmed:true});
    expect(await rows('postPollVotes').countDocuments({postId:post.id})).toBe(0);
    expect((await executeOperation('posts.get',{postId:post.id},author) as any).poll).toBeUndefined();
  });
});

describe('IOU payment destinations',()=>{
  it('shares payment usernames only through an authorized pair ledger, never a public profile',async()=>{
    const viewer=await person(),other=await person();
    await users().updateOne({_id:other.userId},{$set:{discoverable:true,paymentHandles:{venmo:'Laura_2',cashApp:'Laura2'}}});
    expect(profile(await currentUser(other.userId))).not.toHaveProperty('paymentHandles');
    expect((await executeOperation('ious.get',{personId:other.userId},viewer) as any).paymentHandles).toEqual({venmo:'',cashApp:''});
    const invitation=await executeOperation('connections.request',{personId:other.userId,note:'Hi'},viewer,randomUUID(),{confirmed:true}) as any;
    await executeOperation('connections.respond',{connectionId:invitation.id,accept:true},other,randomUUID(),{confirmed:true});
    expect((await executeOperation('ious.get',{personId:other.userId},viewer) as any).paymentHandles).toEqual({venmo:'Laura_2',cashApp:'Laura2'});
    await executeOperation('people.block',{personId:other.userId,blocked:true},viewer,randomUUID());
    expect((await executeOperation('ious.get',{personId:other.userId},viewer) as any).paymentHandles).toEqual({venmo:'',cashApp:''});
  });
});

describe('private conversation pagination', () => {
  it('pages to the beginning without gaps or duplicates, including identical timestamps, and rejects foreign cursors', async () => {
    const actor = await person(), other = await person();
    const ids = Array.from({ length: 65 }, (_, index) => `history-${String(index).padStart(3,'0')}`);
    await rows('messages').insertMany(ids.map(id => ({ _id: id, userId: actor.userId, role: 'user', text: id, source: 'app', createdAt: '2026-09-25T00:00:00.000Z' })));
    const pages: string[] = []; let before: string | undefined;
    do {
      const page = await executeOperation('conversation.list', { limit: 30, ...(before ? { before } : {}) }, actor) as { items: { id: string }[]; nextCursor: string | null };
      expect(page.items.map(item => item.id)).toEqual([...page.items.map(item => item.id)].sort());
      pages.unshift(...page.items.map(item => item.id)); before = page.nextCursor || undefined;
    } while (before);
    expect(pages).toEqual(ids);
    await expect(executeOperation('conversation.list', { before: ids[40] }, other)).rejects.toBeDefined();
    const { readLiveState } = await import('../server/liveState');
    const state = await readLiveState(actor.userId, ['messages']);
    expect(state.messages).toHaveLength(60); expect(state.conversationCursor).toBe(ids[5]);
  });
});
