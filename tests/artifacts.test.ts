import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  ARTIFACT_MAX_ACCOUNT_COUNT, ARTIFACT_MAX_ACCOUNT_TEXT_BYTES, ARTIFACT_MAX_ACCOUNT_VERSIONS, ARTIFACT_MAX_INPUT_BYTES,
  artifactCreateOutput, artifactGetOutput, artifactListOutput, artifactPresentOutput, artifactUpdateOutput, publicArtifactSchema,
  type ArtifactSummary,
} from '../shared/artifacts';
import { artifactOperation, artifacts, artifactUsage, artifactVersions, applyArtifactDataPatches, publicArtifact, publicArtifactImage, publicArtifactState, publicArtifactSummary, type ArtifactDoc } from '../server/artifacts';
import { connectDatabase, db, mongo, rows } from '../server/db';
import { users, type Actor, type User } from '../server/auth';
import { uploads, type Upload } from '../server/uploads';
import { executeOperation } from '../server/operations';

const owners = new Set<string>();
beforeAll(async () => { await connectDatabase('newdrugs_test'); if (db().databaseName !== 'newdrugs_test') throw Error('An isolated database is required.'); });
afterEach(async () => {
  const ids = [...owners];
  for (const collection of ['artifacts', 'artifactVersions', 'uploads', 'tokens', 'receipts', 'runs']) await rows(collection).deleteMany({ userId: { $in: ids } });
  await rows('recordEvents').deleteMany({ userIds: { $in: ids } });
  await rows('attachmentReferences').deleteMany({ ownerId: { $in: ids } });
  await artifactUsage().deleteMany({ _id: { $in: ids } });
  await users().deleteMany({ _id: { $in: ids } });
  owners.clear();
});
afterAll(async () => { await mongo.close(); });

async function owner(): Promise<Actor> {
  const id = randomUUID(); owners.add(id);
  const user: User = { _id: id, handle: `a${id.replaceAll('-', '').slice(0, 20)}`, name: 'Artifact test', city: '', cityKey: '', bio: '', interests: [], discoverable: false, balanceNanos: 1e9, reservedNanos: 0, createdAt: new Date().toISOString() };
  await users().insertOne(user);
  return { userId: id, source: 'browser', scope: 'write' };
}
const call = (actor: Actor, name: string, input: Record<string, unknown> = {}) => artifactOperation(name, input, actor) as Promise<any>;
const create = (actor: Actor, input: Record<string, unknown> = {}) => call(actor, 'artifacts.create', { title: 'An artifact', bodyHtml: '<main>Hello</main>', ...input });
async function image(actor: Actor, changes: Partial<Upload> = {}) {
  const file: Upload = { _id: randomUUID(), userId: actor.userId, name: 'image.webp', purpose: 'agent_input', expectedBytes: 8, sourceHash: '0'.repeat(64), bytes: 8, mime: 'image/webp', sha256: '1'.repeat(64), ready: true, createdAt: new Date().toISOString(), ...changes };
  await uploads().insertOne(file); return file;
}

describe('private artifact domain', () => {
  it('persists plain HTML and keeps visibility separate from presentation and exact access', async () => {
    const me = await owner(), other = await owner();
    const saved = artifactCreateOutput.parse(await create(me));
    const hidden = artifactCreateOutput.parse(await create(me, { title: 'Only in chat', ephemeral: true }));
    expect(saved).toMatchObject({ ephemeral: false, revision: 1, contentRevision: 1 });
    expect(hidden).toMatchObject({ ephemeral: true });
    expect(saved).not.toHaveProperty('reference'); expect(hidden).not.toHaveProperty('reference');
    const list = artifactListOutput.parse(await call(me, 'artifacts.list'));
    expect(list.items.map(item => item.id)).toEqual([saved.id]);
    expect(list.items[0]).not.toHaveProperty('bodyHtml'); expect(list.items[0]).not.toHaveProperty('data'); expect(list.items[0]).not.toHaveProperty('refreshInstruction');
    expect((await call(me, 'artifacts.list', { includeEphemeral: true })).items).toHaveLength(2);
    expect(artifactGetOutput.parse(await call(me, 'artifacts.get', { artifactId: hidden.id }))).toMatchObject({ id: hidden.id, data: {}, assets: [], refreshInstruction: null });
    expect(artifactPresentOutput.parse(await call(me, 'artifacts.present', { artifactId: hidden.id, presentation: 'inline' }))).toEqual({ artifactId: hidden.id, presentation: 'inline', presentedRevision: 1, contentRevision: 1, title: hidden.title });
    await expect(call(other, 'artifacts.get', { artifactId: saved.id })).rejects.toMatchObject({ status: 404 });
    expect(await call(other, 'artifacts.present', { artifactId: saved.id })).toEqual({ artifactId: saved.id, presentation: 'link', presentedRevision: 1, contentRevision: 1, title: saved.title });
    expect(await artifactUsage().findOne({ _id: me.userId })).toMatchObject({ count: 2 });
  });

  it('keeps render revisions stable for metadata while making partial edits atomic', async () => {
    const me = await owner();
    const saved = await create(me, { data: { rows: [{ value: 1 }], old: true }, refreshInstruction: 'Read current values. Return rows with numeric value.' });
    const renamed = artifactUpdateOutput.parse(await call(me, 'artifacts.update', { artifactId: saved.id, revision: 1, title: 'Renamed', ephemeral: true, refreshInstruction: null }));
    expect(renamed).toMatchObject({ revision: 2, contentRevision: 1, ephemeral: true, hasRefreshInstruction: false, contentUpdatedAt: saved.contentUpdatedAt, dataUpdatedAt: saved.dataUpdatedAt });
    await expect(call(me, 'artifacts.update', { artifactId: saved.id, revision: 1, data: {} })).rejects.toMatchObject({ code: 'artifact_changed' });
    const patched = await call(me, 'artifacts.update', { artifactId: saved.id, revision: 2, dataPatches: [{ op: 'set', path: ['rows', 1], value: { value: 2 } }, { op: 'remove', path: ['old'] }] });
    expect(patched).toMatchObject({ revision: 3, contentRevision: 2 });
    expect(patched.dataUpdatedAt).not.toBe(renamed.dataUpdatedAt);
    expect(await call(me, 'artifacts.get', { artifactId: saved.id })).toMatchObject({ data: { rows: [{ value: 1 }, { value: 2 }] }, refreshInstruction: null });
    await expect(call(me, 'artifacts.update', { artifactId: saved.id, revision: 3, title: 'Must roll back', dataPatches: [{ op: 'remove', path: ['missing'] }] })).rejects.toMatchObject({ code: 'artifact_patch' });
    expect(await call(me, 'artifacts.get', { artifactId: saved.id })).toMatchObject({ title: 'Renamed', revision: 3 });
    const whole = await call(me, 'artifacts.update', { artifactId: saved.id, revision: 3, data: { replacement: true } });
    expect(whole).toMatchObject({ revision: 4, contentRevision: 3 });
    const current = await artifacts().findOne({ _id: saved.id });
    expect(await artifactUsage().findOne({ _id: me.userId })).toMatchObject({ count: 1, versionCount: 3, textBytes: current!.textBytes + current!.historyTextBytes! });
    const events = await rows('recordEvents').find({ userIds: me.userId }).toArray();
    expect(events).toHaveLength(4); expect(events.every(event => JSON.stringify(event.userIds) === JSON.stringify([me.userId]))).toBe(true);
  });

  it('bounds source slices and rejects the combined serialized input before writing', async () => {
    const me = await owner(), bodyHtml = '<main>' + 'a'.repeat(70_000) + '</main>', data = { text: '</script><script>doNotExecute()</script>\u2028\u2029' };
    const saved = await create(me, { bodyHtml, data, refreshInstruction: 'Keep the data shape.' });
    let offset = 0, complete = '';
    while (true) { const result = artifactGetOutput.parse(await call(me, 'artifacts.get', { artifactId: saved.id, section: 'bodyHtml', offset, length: 25_000 })); if (!('source' in result)) throw Error('Source slice missing'); complete += result.source.content; expect(result).not.toHaveProperty('data'); if (result.source.nextOffset === null) break; offset = result.source.nextOffset; }
    expect(complete).toBe(bodyHtml);
    expect(await call(me, 'artifacts.get', { artifactId: saved.id })).toMatchObject({ data });
    const large = { title: 'Escaped input', bodyHtml: '<p>' + '\\'.repeat(100_000) + '</p>', data: { text: '\\'.repeat(40_000) } };
    expect(Buffer.byteLength(JSON.stringify(large))).toBeGreaterThan(ARTIFACT_MAX_INPUT_BYTES);
    await expect(call(me, 'artifacts.create', large)).rejects.toMatchObject({ code: 'artifact_input_size' });
    expect(await artifacts().countDocuments({ userId: me.userId })).toBe(1);
  });

  it('uses exact revision checks for concurrent edits and stable keyset pagination after a cursor record is deleted', async () => {
    const me = await owner(), first = await create(me, { title: 'First' });
    const results = await Promise.allSettled([call(me, 'artifacts.update', { artifactId: first.id, revision: 1, title: 'One' }), call(me, 'artifacts.update', { artifactId: first.id, revision: 1, title: 'Two' })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'artifact_changed' } });
    await create(me, { title: 'Second' }); await create(me, { title: 'Third' });
    const page = await call(me, 'artifacts.list', { limit: 1 });
    await call(me, 'artifacts.delete', { artifactId: page.items[0].id, revision: page.items[0].revision });
    const following = await call(me, 'artifacts.list', { limit: 50, cursor: page.nextCursor });
    expect(following.items).toHaveLength(2); expect(following.nextCursor).toBeNull();
    await expect(call(me, 'artifacts.list', { cursor: page.nextCursor, includeEphemeral: true })).rejects.toMatchObject({ code: 'artifact_cursor' });
  });

  it('validates readable raster assets, permits replacements and releases no upload bytes on deletion', async () => {
    const me = await owner(), other = await owner(), first = await image(me), replacement = await image(me, { purpose: 'profile_photo' });
    const saved = await create(me, { bodyHtml: '<img src="nd-asset:photo">', assets: [{ id: 'photo', fileId: first._id }] });
    expect(await uploads().findOne({ _id: first._id })).toMatchObject({ retained: true });
    const updated = await call(me, 'artifacts.update', { artifactId: saved.id, revision: 1, assets: [{ id: 'photo', fileId: replacement._id }] });
    expect(updated).toMatchObject({ contentRevision: 2, revision: 2 });
    const invalid = [await image(me, { ready: false }), await image(me, { mime: 'image/svg+xml' }), await image(me, { bytes: 4 * 1024 * 1024 + 1 })];
    for (const file of invalid) await expect(create(me, { assets: [{ id: 'invalid', fileId: file._id }] })).rejects.toMatchObject({ status: 422 });
    const expired = await image(me, { retained: false, expiresAt: new Date(Date.now() - 1000) });
    await expect(create(me, { assets: [{ id: 'expired', fileId: expired._id }] })).rejects.toMatchObject({ code: 'artifact_asset' });
    await call(me, 'artifacts.update', { artifactId: saved.id, revision: 2, assets: [], bodyHtml: '<main>No image</main>' });
    await call(me, 'artifacts.delete', { artifactId: saved.id, revision: 3 });
    expect(await uploads().findOne({ _id: first._id })).toMatchObject({ retained: true, bytes: 8, ready: true });
    expect(await uploads().findOne({ _id: replacement._id })).toMatchObject({ retained: true, bytes: 8, ready: true });
    expect(await artifactUsage().findOne({ _id: me.userId })).toMatchObject({ count: 0, textBytes: 0 });
    await expect(call(me, 'artifacts.get', { artifactId: saved.id })).rejects.toMatchObject({ status: 404 });
  });


  it('reuses Log photos and bearer image IDs without copying bytes or taking ownership', async () => {
    const me=await owner(),other=await owner(),entryId=randomUUID();
    const ownLog=await image(me,{purpose:'log_media',logEntryId:entryId,retained:true});
    const sharedLog=await image(other,{purpose:'log_media',logEntryId:entryId,retained:true,expiresAt:new Date(Date.now()+60000)});
    await rows('attachmentReferences').insertOne({_id:randomUUID(),ownerId:me.userId,fileId:ownLog._id,kind:'hangouts',sourceId:entryId});
    const before=await uploads().findOne({_id:sharedLog._id});
    const saved=await create(me,{bodyHtml:'<img src="nd-asset:mine"><img src="nd-asset:shared">',assets:[{id:'mine',fileId:ownLog._id},{id:'shared',fileId:sharedLog._id}]});
    expect((await publicArtifact(saved.id)).assets.map(asset=>asset.id)).toEqual(['mine','shared']);
    expect(await uploads().findOne({_id:sharedLog._id})).toEqual(before);
    expect(await uploads().countDocuments({userId:{$in:[me.userId,other.userId]}})).toBe(2);
    expect((await publicArtifactImage(saved.id,'shared',1))._id).toBe(sharedLog._id);
    await users().updateOne({_id:other.userId},{$set:{suspendedAt:new Date().toISOString()}});
    expect((await publicArtifactState(saved.id,1)).assets.map(asset=>asset.id)).toEqual(['mine']);
    expect((await publicArtifactState(saved.id)).assets.map(asset=>asset.id)).toEqual(['mine']);
    await expect(publicArtifactImage(saved.id,'shared',1)).rejects.toMatchObject({status:404});
    await users().updateOne({_id:other.userId},{$unset:{suspendedAt:''}});
    expect((await publicArtifactState(saved.id)).assets.map(asset=>asset.id)).toEqual(['mine','shared']);
    await uploads().updateOne({_id:ownLog._id},{$set:{deletedAt:new Date().toISOString(),ready:false}});
    expect((await publicArtifact(saved.id,1)).assets.map(asset=>asset.id)).toEqual(['shared']);
    await expect(publicArtifactImage(saved.id,'mine',1)).rejects.toMatchObject({status:404});
  });

  it('charges both visibility values to one count limit and serializes the final available slot', async () => {
    const me = await owner(), first = await create(me), template = (await artifacts().findOne({ _id: first.id }))!;
    const copies = Array.from({ length: ARTIFACT_MAX_ACCOUNT_COUNT - 2 }, (_, index) => ({ ...template, _id: randomUUID(), ephemeral: index % 2 === 0 }));
    await artifacts().insertMany(copies); await artifactUsage().updateOne({ _id: me.userId }, { $set: { count: ARTIFACT_MAX_ACCOUNT_COUNT - 1, versionCount: ARTIFACT_MAX_ACCOUNT_COUNT - 1, textBytes: template.textBytes * (ARTIFACT_MAX_ACCOUNT_COUNT - 1) } });
    const last = await Promise.allSettled([create(me), create(me, { ephemeral: true })]);
    expect(last.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(last.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'artifact_limit' } });
    expect(await artifacts().countDocuments({ userId: me.userId })).toBe(ARTIFACT_MAX_ACCOUNT_COUNT);
    expect(await artifactUsage().findOne({ _id: me.userId })).toMatchObject({ count: ARTIFACT_MAX_ACCOUNT_COUNT });
  });

  it('bounds account text independently of image storage and restores the allowance after deletion', async () => {
    const me = await owner(), first = await create(me, { bodyHtml: '<p>' + 'x'.repeat(110_000) + '</p>', data: { text: 'y'.repeat(90_000) } }), template = (await artifacts().findOne({ _id: first.id }))!;
    const count = Math.floor(ARTIFACT_MAX_ACCOUNT_TEXT_BYTES / template.textBytes);
    const copies: ArtifactDoc[] = Array.from({ length: count - 1 }, () => ({ ...template, _id: randomUUID(), ephemeral: true }));
    await artifacts().insertMany(copies); await artifactUsage().updateOne({ _id: me.userId }, { $set: { count, versionCount: count, textBytes: count * template.textBytes } });
    const remaining = ARTIFACT_MAX_ACCOUNT_TEXT_BYTES - count * template.textBytes;
    await expect(create(me, { bodyHtml: '<p>' + 'z'.repeat(Math.min(119_990, remaining + 1)) + '</p>', data: { text: 'z'.repeat(90_000) } })).rejects.toMatchObject({ code: 'artifact_limit' });
    await call(me, 'artifacts.delete', { artifactId: first.id, revision: 1 });
    expect(await create(me, { bodyHtml: '<p>' + 'z'.repeat(100_000) + '</p>' })).toMatchObject({ revision: 1 });
    const usage = await artifactUsage().findOne({ _id: me.userId }); expect(usage!.textBytes).toBeLessThanOrEqual(ARTIFACT_MAX_ACCOUNT_TEXT_BYTES);
    const actual = await artifacts().find({ userId: me.userId }, { projection: { textBytes: 1 } }).toArray();
    expect(usage).toMatchObject({ count: actual.length, textBytes: actual.reduce((total, record) => total + record.textBytes, 0) });
  });

  it('derives producer identity and enforces the same private/read-write authority for hidden records', async () => {
    const me = await owner(), credentialId = randomUUID();
    await rows('tokens').insertOne({ _id: credentialId, userId: me.userId, name: 'A connected assistant', scope: 'write', revokedAt: null, expiresAt: null });
    const external = { ...me, source: 'external' as const, credentialId };
    expect(await create(external, { ephemeral: true })).toMatchObject({ producer: { kind: 'external', name: 'A connected assistant', id: credentialId } });
    const runId = randomUUID(); await rows('runs').insertOne({ _id: runId, userId: me.userId, status: 'running', purpose: 'automation', automationId: 'automation-id', automationName: 'Weekly report' });
    expect(await create({ ...me, source: 'agent', runId, background: true, privateAccess: true })).toMatchObject({ producer: { kind: 'automation', name: 'Weekly report', id: 'automation-id' } });
    for (const ephemeral of [true, false]) {
      await expect(create({ ...me, scope: 'read' }, { ephemeral })).rejects.toMatchObject({ code: 'scope' });
      await expect(create({ ...me, source: 'agent', runId, background: true, privateAccess: false }, { ephemeral })).rejects.toMatchObject({ code: 'private_access_required' });
    }
    await expect(call({ ...me, background: true, privateAccess: false }, 'artifacts.list', { includeEphemeral: true })).rejects.toMatchObject({ code: 'private_access_required' });
    await expect(create(me, { producer: { kind: 'external', name: 'Spoofed' } })).rejects.toThrow();
  });

  it('uses shared receipts for one artifact and exact confirmed deletion without duplicating retained files', async () => {
    const me = await owner(), key = randomUUID(), photo = await image(me), input = { title: 'Shared operation', bodyHtml: '<img src="nd-asset:photo">', assets: [{ id: 'photo', fileId: photo._id }], ephemeral: true };
    const saved = artifactCreateOutput.parse(await executeOperation('artifacts.create', input, me, key));
    expect(await executeOperation('artifacts.create', input, me, key)).toEqual(saved);
    expect(await artifacts().countDocuments({ userId: me.userId })).toBe(1);
    expect(await rows('attachmentReferences').countDocuments({ ownerId: me.userId, kind: 'artifacts', sourceId: saved.id })).toBe(1);
    await expect(executeOperation('artifacts.create', { ...input, title: 'Different' }, me, key)).rejects.toMatchObject({ code: 'idempotency_conflict' });
    await expect(executeOperation('artifacts.delete', { artifactId: saved.id, revision: 1 }, me, randomUUID())).rejects.toMatchObject({ code: 'confirmation_required' });
    expect(await executeOperation('artifacts.delete', { artifactId: saved.id, revision: 1 }, me, randomUUID(), { confirmed: true })).toEqual({ deleted: true, artifactId: saved.id });
    expect(await rows('attachmentReferences').countDocuments({ ownerId: me.userId, sourceId: saved.id })).toBe(0);
    expect(await uploads().findOne({ _id: photo._id })).toMatchObject({ bytes: 8, ready: true, retained: true });
  });

  it('opens either visibility value by its unguessable ID without exposing owner-only metadata or management', async () => {
    const me = await owner(), other = await owner(), credentialId = randomUUID();
    await rows('tokens').insertOne({ _id: credentialId, userId: me.userId, name: 'Private producer name', scope: 'write', revokedAt: null, expiresAt: null });
    for (const ephemeral of [false, true]) {
      const saved = await create({ ...me, source: 'external', credentialId }, { ephemeral, data: { total: 7 }, refreshInstruction: 'Owner-only retrieval instructions.' });
      const view = publicArtifactSchema.parse(await publicArtifact(saved.id));
      expect(view).toMatchObject({ id: saved.id, title: saved.title, bodyHtml: '<main>Hello</main>', data: { total: 7 }, assets: [], revision: 1, contentRevision: 1 });
      expect(Object.keys(view).sort()).toEqual(['assets', 'bodyHtml', 'contentRevision', 'contentUpdatedAt', 'data', 'id', 'revision', 'title', 'updatedAt']);
      const serialized = JSON.stringify(view);
      for (const secret of [me.userId, credentialId, 'Private producer name', 'Owner-only retrieval instructions.']) expect(serialized).not.toContain(secret);
      expect(await publicArtifactSummary(saved.id)).toEqual({ id: saved.id, title: saved.title });
      for (const name of ['artifacts.get', 'artifacts.update', 'artifacts.delete']) await expect(call(other, name, { artifactId: saved.id, ...(name === 'artifacts.update' ? { revision: 1, title: 'Not mine' } : name === 'artifacts.delete' ? { revision: 1 } : {}) })).rejects.toMatchObject({ status: 404 });
      expect(await call(other, 'artifacts.present', { artifactId: saved.id })).toMatchObject({ artifactId: saved.id, contentRevision: 1, title: saved.title });
    }
    expect((await call(me, 'artifacts.list')).items).toHaveLength(1);
    expect((await call(other, 'artifacts.list', { includeEphemeral: true })).items).toHaveLength(0);
    expect(await artifactUsage().findOne({ _id: me.userId })).toMatchObject({ count: 2 });
    await expect(publicArtifact('guessable-short-id')).rejects.toMatchObject({ status: 404 });
  });

  it('provides the same render-only shared capability read without granting private account access', async () => {
    const me = await owner(), saved = await create(me, { ephemeral: true, refreshInstruction: 'Private instruction.' });
    const holder: Actor = { userId: 'no-account-identity', source: 'external', scope: 'read', background: true, privateAccess: false };
    const view = await call(holder, 'artifacts.view', { artifactId: saved.id });
    expect(publicArtifactSchema.parse(view)).toEqual(await publicArtifact(saved.id));
    expect(view).not.toHaveProperty('refreshInstruction'); expect(view).not.toHaveProperty('producer'); expect(view).not.toHaveProperty('ephemeral');
    const shown = await call(holder, 'artifacts.present', { artifactId: saved.id, contentRevision: 1, presentation: 'inline' });
    expect(shown).toEqual({ artifactId: saved.id, title: saved.title, contentRevision: 1, presentedRevision: 1, presentation: 'inline' });
    expect(Object.keys(shown).sort()).toEqual(['artifactId', 'contentRevision', 'presentation', 'presentedRevision', 'title']);
    await expect(call(holder, 'artifacts.list')).rejects.toMatchObject({ code: 'private_access_required' });
    await expect(call(holder, 'artifacts.get', { artifactId: saved.id })).rejects.toMatchObject({ code: 'private_access_required' });
    await users().updateOne({ _id: me.userId }, { $set: { suspendedAt: new Date().toISOString() } });
    await expect(call(holder, 'artifacts.present', { artifactId: saved.id, contentRevision: 1 })).rejects.toMatchObject({ status: 404 });
    await users().updateOne({ _id: me.userId }, { $unset: { suspendedAt: '' } });
    await call(me, 'artifacts.delete', { artifactId: saved.id, revision: 1 });
    await expect(call(holder, 'artifacts.view', { artifactId: saved.id })).rejects.toMatchObject({ status: 404 });
    await expect(call(holder, 'artifacts.present', { artifactId: saved.id, contentRevision: 1 })).rejects.toMatchObject({ status: 404 });
  });

  it('exposes readable ready image references including Log photos and other upload owners', async () => {
    const me = await owner(), other = await owner(), allowed = await image(me), profile = await image(me, { purpose: 'profile_photo' });
    const saved = await create(me, { assets: [{ id: 'photo', fileId: allowed._id }, { id: 'profile', fileId: profile._id }] });
    const candidates = [await image(other), await image(me, { ready: false }), await image(me, { mime: 'image/svg+xml' }), await image(me, { purpose: 'log_media' }), await image(me, { logEntryId: randomUUID() }), await image(me, { deletedAt: new Date().toISOString() }), await image(me), await image(me)];
    await uploads().updateOne({ _id: candidates[6]._id }, { $set: { moderatedAt: new Date().toISOString() } });
    await rows('attachmentReferences').insertOne({ _id: randomUUID(), ownerId: me.userId, fileId: candidates[7]._id, kind: 'hangouts', sourceId: randomUUID() });
    // Simulate stale references left between a file's revocation and cleanup.
    const allAssets = [{ id: 'photo', fileId: allowed._id }, { id: 'profile', fileId: profile._id }, ...candidates.map((file, index) => ({ id: `stale-${index}`, fileId: file._id }))];
    await artifacts().updateOne({ _id: saved.id }, { $set: { assets: allAssets } });
    const expected = [{ id: 'photo', url: `/api/artifacts/${saved.id}/assets/photo`, mime: allowed.mime, bytes: allowed.bytes, sha256: allowed.sha256 }, { id: 'profile', url: `/api/artifacts/${saved.id}/assets/profile`, mime: profile.mime, bytes: profile.bytes, sha256: profile.sha256 }];
    const allowedIndices=[0,3,4,7];
    expected.push(...allowedIndices.map(index=>({id:`stale-${index}`,url:`/api/artifacts/${saved.id}/assets/stale-${index}`,mime:candidates[index].mime,bytes:candidates[index].bytes,sha256:candidates[index].sha256})));
    expect((await publicArtifact(saved.id)).assets).toEqual(expected);
    expect((await publicArtifactImage(saved.id, 'photo'))._id).toBe(allowed._id);
    expect((await publicArtifactImage(saved.id, 'profile'))._id).toBe(profile._id);
    for (let index = 0; index < candidates.length; index++) {if(allowedIndices.includes(index))expect((await publicArtifactImage(saved.id,`stale-${index}`))._id).toBe(candidates[index]._id);else await expect(publicArtifactImage(saved.id, `stale-${index}`)).rejects.toMatchObject({ status: 404 });}
    const unrelated = await image(me);
    await expect(publicArtifactImage(saved.id, unrelated._id)).rejects.toMatchObject({ status: 404 });
    await uploads().updateOne({ _id: allowed._id }, { $set: { deletedAt: new Date().toISOString() } });
    expect((await publicArtifact(saved.id)).assets).toEqual(expected.slice(1));
    await expect(publicArtifactImage(saved.id, 'photo')).rejects.toMatchObject({ status: 404 });
  });

  it('revokes display and scoped image access after artifact deletion or owner suspension/removal', async () => {
    const me = await owner(), photo = await image(me), saved = await create(me, { assets: [{ id: 'photo', fileId: photo._id }] });
    expect((await publicArtifact(saved.id)).id).toBe(saved.id);
    await users().updateOne({ _id: me.userId }, { $set: { suspendedAt: new Date().toISOString() } });
    await expect(publicArtifact(saved.id)).rejects.toMatchObject({ status: 404 });
    await expect(publicArtifactImage(saved.id, 'photo')).rejects.toMatchObject({ status: 404 });
    await expect(publicArtifactSummary(saved.id)).rejects.toMatchObject({ status: 404 });
    await users().updateOne({ _id: me.userId }, { $unset: { suspendedAt: '' } });
    await call(me, 'artifacts.delete', { artifactId: saved.id, revision: 1 });
    await expect(publicArtifact(saved.id)).rejects.toMatchObject({ status: 404 });
    await expect(publicArtifactImage(saved.id, 'photo')).rejects.toMatchObject({ status: 404 });
    await expect(publicArtifactSummary(saved.id)).rejects.toMatchObject({ status: 404 });
    const orphan = await create(me);
    await users().deleteOne({ _id: me.userId });
    await expect(publicArtifact(orphan.id)).rejects.toMatchObject({ status: 404 });
  });

  it('detects stale image revocation through bounded shared state without an owner event subscriber', async () => {
    const me = await owner(), photo = await image(me), kept = await image(me);
    const assets = [{ id: 'photo', fileId: photo._id }, { id: 'kept', fileId: kept._id }];
    const saved = await executeOperation('artifacts.create', { title: 'Saved', bodyHtml: '<p>body stays private to render reads</p>', assets }, me, randomUUID()) as ArtifactSummary;
    const hidden = await executeOperation('artifacts.create', { title: 'Hidden', bodyHtml: '<p>render body</p>', assets, ephemeral: true }, me, randomUUID()) as ArtifactSummary;
    const usage = await artifactUsage().findOne({ _id: me.userId });
    const unchanged = await publicArtifactState(saved.id);
    expect(unchanged).toEqual({ id: saved.id, revision: 1, contentRevision: 1, updatedAt: saved.updatedAt, assets: [{ id: 'photo', sha256: photo.sha256 }, { id: 'kept', sha256: kept.sha256 }] });
    expect(Object.keys(unchanged).sort()).toEqual(['assets', 'contentRevision', 'id', 'revision', 'updatedAt']);

    // Direct moderation can happen with no liveState watcher running.
    await uploads().updateOne({ _id: photo._id }, { $set: { moderatedAt: new Date().toISOString() } });
    const revoked = await publicArtifactState(saved.id);
    expect(revoked).toMatchObject({ id: saved.id, revision: 2, contentRevision: 1, assets: [{ id: 'kept', sha256: kept.sha256 }] });
    expect(revoked.updatedAt).not.toBe(saved.updatedAt);
    for (const id of [saved.id, hidden.id]) {
      expect(await artifacts().findOne({ _id: id })).toMatchObject({ revision: 2, contentRevision: 1, assets: [assets[1]] });
      expect((await publicArtifact(id)).assets.map(asset => asset.id)).toEqual(['kept']);
      await expect(publicArtifactImage(id, 'photo')).rejects.toMatchObject({ status: 404 });
    }
    expect(await rows('attachmentReferences').countDocuments({ ownerId: me.userId, fileId: photo._id, kind: 'artifacts' })).toBe(0);
    const events = await rows('recordEvents').countDocuments({ userIds: me.userId });
    expect(events).toBe(4); // Two creates and one revocation per artifact.
    expect(await publicArtifactState(saved.id)).toEqual(revoked);
    expect(await publicArtifactState(hidden.id)).toMatchObject({ revision: 2, contentRevision: 1 });
    expect(await rows('recordEvents').countDocuments({ userIds: me.userId })).toBe(events);
    expect(await artifactUsage().findOne({ _id: me.userId })).toEqual(usage);
    expect(await uploads().findOne({ _id: photo._id })).toMatchObject({ bytes: photo.bytes, retained: true, ready: true });
    await users().updateOne({ _id: me.userId }, { $set: { suspendedAt: new Date().toISOString() } });
    await expect(publicArtifactState(saved.id)).rejects.toMatchObject({ status: 404 });
  });

  it('keeps earlier content immutable and presents an updated version only through an explicit read', async () => {
    const me = await owner(), other = await owner();
    const saved = await create(me, { title: 'Original title', data: { value: 1 }, refreshInstruction: 'Private instruction' });
    const original = await artifactVersions().findOne({ artifactId: saved.id, contentRevision: 1 });
    expect(saved).not.toHaveProperty('reference');
    expect(await call(me, 'artifacts.present', { artifactId: saved.id, presentation: 'inline' })).toMatchObject({ presentedRevision: 1, contentRevision: 1 });
    const metadata = await call(me, 'artifacts.update', { artifactId: saved.id, revision: 1, title: 'New title', ephemeral: true, refreshInstruction: 'New private instruction' });
    expect(metadata).not.toHaveProperty('reference');
    expect(await artifactVersions().countDocuments({ artifactId: saved.id })).toBe(1);
    const updated = await call(me, 'artifacts.update', { artifactId: saved.id, revision: 2, data: { value: 2 } });
    expect(updated).not.toHaveProperty('reference');
    expect(await call(me, 'artifacts.present', { artifactId: saved.id, presentation: 'inline' })).toEqual({ artifactId: saved.id, title: 'New title', presentation: 'inline', presentedRevision: 3, contentRevision: 2 });
    expect(await artifactVersions().findOne({ artifactId: saved.id, contentRevision: 1 })).toEqual(original);
    expect(await publicArtifact(saved.id, 1)).toMatchObject({ title: 'Original title', data: { value: 1 }, revision: 1, contentRevision: 1, updatedAt: saved.updatedAt });
    expect(await publicArtifact(saved.id)).toMatchObject({ title: 'New title', data: { value: 2 }, revision: 3, contentRevision: 2 });
    expect(await call(me, 'artifacts.get', { artifactId: saved.id, contentRevision: 1 })).toMatchObject({ title: 'Original title', data: { value: 1 }, revision: 1, refreshInstruction: 'New private instruction' });
    expect(await call(me, 'artifacts.present', { artifactId: saved.id, contentRevision: 1, presentation: 'link' })).toMatchObject({ presentedRevision: 1, contentRevision: 1, presentation: 'link' });
    const source = await call(me, 'artifacts.get', { artifactId: saved.id, contentRevision: 1, section: 'data', length: 5 });
    expect(source.source).toMatchObject({ content: '{"val', nextOffset: 5 });
    await expect(call(other, 'artifacts.get', { artifactId: saved.id, contentRevision: 1 })).rejects.toMatchObject({ status: 404 });
    const publicHolder: Actor = { userId: 'unrelated', source: 'external', scope: 'read', background: true, privateAccess: false };
    expect(await call(publicHolder, 'artifacts.view', { artifactId: saved.id, contentRevision: 1 })).toEqual(await publicArtifact(saved.id, 1));
    expect(original).not.toHaveProperty('refreshInstruction'); expect(original).not.toHaveProperty('producer');
    expect(JSON.stringify(await publicArtifact(saved.id, 1))).not.toContain('Private instruction');

    const identical = await call(me, 'artifacts.update', { artifactId: saved.id, revision: 3, data: { value: 2 }, assets: [] });
    expect(identical).toMatchObject({ revision: 4, contentRevision: 2 }); expect(identical).not.toHaveProperty('reference');
    expect(await artifactVersions().countDocuments({ artifactId: saved.id })).toBe(2);
    const linked = await call(me, 'artifacts.update', { artifactId: saved.id, revision: 4, bodyHtml: '<p>Changed</p>' });
    expect(linked).not.toHaveProperty('reference');
    expect(await call(me, 'artifacts.present', { artifactId: saved.id, presentation: 'link' })).toMatchObject({ presentation: 'link', presentedRevision: 5, contentRevision: 3 });
    await expect(publicArtifact(saved.id, 4)).rejects.toMatchObject({ status: 404 });
    const final = await artifacts().findOne({ _id: saved.id });
    expect(await artifactUsage().findOne({ _id: me.userId })).toMatchObject({ count: 1, versionCount: 3, textBytes: final!.textBytes + final!.historyTextBytes! });
    await call(me, 'artifacts.delete', { artifactId: saved.id, revision: 5 });
    expect(await artifactVersions().countDocuments({ artifactId: saved.id })).toBe(0);
    expect(await artifactUsage().findOne({ _id: me.userId })).toMatchObject({ count: 0, versionCount: 0, textBytes: 0 });
    await expect(publicArtifact(saved.id, 1)).rejects.toMatchObject({ status: 404 });
  });

  it('materializes only available legacy source and freezes missing-version references before future edits', async () => {
    const me = await owner(), saved = await create(me, { title: 'Last known title', bodyHtml: '<p>Last known content</p>', data: { day: 10 } });
    await artifactVersions().deleteMany({ artifactId: saved.id });
    await artifacts().updateOne({ _id: saved.id }, { $set: { revision: 9, contentRevision: 7 }, $unset: { versionCount: '', historyTextBytes: '', legacyContentRevision: '' } });
    await artifactUsage().updateOne({ _id: me.userId }, { $unset: { versionCount: '' } });
    const legacy = await publicArtifact(saved.id, 'legacy');
    expect(legacy).toMatchObject({ title: 'Last known title', bodyHtml: '<p>Last known content</p>', data: { day: 10 }, revision: 9, contentRevision: 7 });
    expect(await publicArtifactState(saved.id, 'legacy')).toMatchObject({ revision: 9, contentRevision: 7 });
    expect(await artifactVersions().countDocuments({ artifactId: saved.id })).toBe(1);
    expect(await artifacts().findOne({ _id: saved.id })).toMatchObject({ legacyContentRevision: 7 });
    for (const version of [1, 6, 8]) await expect(publicArtifact(saved.id, version)).rejects.toMatchObject({ status: 404 });
    await call(me, 'artifacts.update', { artifactId: saved.id, revision: 9, title: 'Current title' });
    const updated = await call(me, 'artifacts.update', { artifactId: saved.id, revision: 10, data: { day: 11 } });
    expect(updated).not.toHaveProperty('reference');
    expect(await call(me, 'artifacts.present', { artifactId: saved.id, presentation: 'inline' })).toMatchObject({ presentedRevision: 11, contentRevision: 8 });
    expect(await publicArtifact(saved.id, 'legacy')).toEqual(legacy);
    expect(await publicArtifact(saved.id)).toMatchObject({ title: 'Current title', data: { day: 11 }, contentRevision: 8 });
    expect(await publicArtifactSummary(saved.id, 'legacy')).toEqual({ id: saved.id, title: 'Last known title' });
    expect(await call(me, 'artifacts.get', { artifactId: saved.id, contentRevision: 'legacy' })).toMatchObject({ contentRevision: 7, data: { day: 10 } });
    expect(await artifactUsage().findOne({ _id: me.userId })).toMatchObject({ count: 1, versionCount: 2 });
    // Another legacy record freezes at the first update even without a prior read.
    const unread = await create(me, { data: { day: 4 } });
    await artifactVersions().deleteMany({ artifactId: unread.id });
    await artifacts().updateOne({ _id: unread.id }, { $set: { contentRevision: 4 }, $unset: { legacyContentRevision: '' } });
    await call(me, 'artifacts.update', { artifactId: unread.id, revision: 1, data: { day: 5 } });
    expect(await publicArtifact(unread.id, 'legacy')).toMatchObject({ data: { day: 4 }, contentRevision: 4 });
    expect(await publicArtifact(unread.id)).toMatchObject({ data: { day: 5 }, contentRevision: 5 });
  });

  it('pins image aliases to their saved version while reauthorizing uploads and the live root', async () => {
    const me = await owner(), first = await image(me), next = await image(me, { sha256: '2'.repeat(64) });
    const saved = await executeOperation('artifacts.create', { title: 'Photos', bodyHtml: '<img src="nd-asset:photo">', assets: [{ id: 'photo', fileId: first._id }] }, me, randomUUID()) as ArtifactSummary;
    await executeOperation('artifacts.update', { artifactId: saved.id, revision: 1, assets: [{ id: 'photo', fileId: next._id }] }, me, randomUUID());
    expect((await publicArtifact(saved.id, 1)).assets[0]).toMatchObject({ url: `/api/artifacts/${saved.id}/assets/photo?version=1`, sha256: first.sha256 });
    expect((await publicArtifact(saved.id, 2)).assets[0]).toMatchObject({ url: `/api/artifacts/${saved.id}/assets/photo?version=2`, sha256: next.sha256 });
    expect((await publicArtifactImage(saved.id, 'photo', 1))._id).toBe(first._id);
    expect((await publicArtifactImage(saved.id, 'photo', 2))._id).toBe(next._id);
    expect(await rows('attachmentReferences').countDocuments({ ownerId: me.userId, kind: 'artifacts', sourceId: saved.id })).toBe(2);
    const originalState = await publicArtifactState(saved.id, 1);
    await uploads().updateOne({ _id: first._id }, { $set: { moderatedAt: new Date().toISOString() } });
    expect(await publicArtifactState(saved.id, 1)).toEqual({ ...originalState, assets: [] });
    expect((await publicArtifact(saved.id, 1)).assets).toEqual([]);
    expect((await publicArtifact(saved.id, 2)).assets).toHaveLength(1);
    await expect(publicArtifactImage(saved.id, 'photo', 1)).rejects.toMatchObject({ status: 404 });
    expect(await artifactVersions().findOne({ artifactId: saved.id, contentRevision: 1 })).toMatchObject({ assets: [{ id: 'photo', fileId: first._id }] });
    await users().updateOne({ _id: me.userId }, { $set: { suspendedAt: new Date().toISOString() } });
    await expect(publicArtifact(saved.id, 1)).rejects.toMatchObject({ status: 404 });
    await expect(publicArtifactImage(saved.id, 'photo', 2)).rejects.toMatchObject({ status: 404 });
  });

  it('rejects new versions at the owner count cap without evicting an earlier version', async () => {
    const me = await owner(), saved = await create(me), first = (await artifactVersions().findOne({ artifactId: saved.id }))!;
    const copies = Array.from({ length: ARTIFACT_MAX_ACCOUNT_VERSIONS - 1 }, (_, index) => ({ ...first, _id: `${saved.id}:${index + 2}`, contentRevision: index + 2, revision: index + 2 }));
    await artifactVersions().insertMany(copies);
    const historyTextBytes = first.textBytes * (ARTIFACT_MAX_ACCOUNT_VERSIONS - 1);
    await artifacts().updateOne({ _id: saved.id }, { $set: { revision: ARTIFACT_MAX_ACCOUNT_VERSIONS, contentRevision: ARTIFACT_MAX_ACCOUNT_VERSIONS, versionCount: ARTIFACT_MAX_ACCOUNT_VERSIONS, historyTextBytes } });
    const current = (await artifacts().findOne({ _id: saved.id }))!;
    await artifactUsage().updateOne({ _id: me.userId }, { $set: { versionCount: ARTIFACT_MAX_ACCOUNT_VERSIONS, textBytes: current.textBytes + historyTextBytes } });
    await expect(call(me, 'artifacts.update', { artifactId: saved.id, revision: ARTIFACT_MAX_ACCOUNT_VERSIONS, data: { new: true } })).rejects.toMatchObject({ code: 'artifact_limit' });
    expect(await artifactVersions().countDocuments({ artifactId: saved.id })).toBe(ARTIFACT_MAX_ACCOUNT_VERSIONS);
    expect(await publicArtifact(saved.id, 1)).toMatchObject({ data: {}, contentRevision: 1 });
    const metadata = await call(me, 'artifacts.update', { artifactId: saved.id, revision: ARTIFACT_MAX_ACCOUNT_VERSIONS, title: 'Still editable' });
    expect(metadata).not.toHaveProperty('reference');
    await call(me, 'artifacts.delete', { artifactId: saved.id, revision: ARTIFACT_MAX_ACCOUNT_VERSIONS + 1 });
    expect(await artifactUsage().findOne({ _id: me.userId })).toMatchObject({ count: 0, versionCount: 0, textBytes: 0 });
    expect(await create(me)).toMatchObject({ contentRevision: 1 });
  });

  it('counts earlier source against the same byte budget and atomically rejects a version that cannot fit', async () => {
    const me = await owner(), saved = await create(me, { bodyHtml: '<p>' + 'x'.repeat(110_000) + '</p>', data: { text: 'y'.repeat(90_000) } });
    const first = (await artifactVersions().findOne({ artifactId: saved.id }))!, count = Math.floor(ARTIFACT_MAX_ACCOUNT_TEXT_BYTES / first.textBytes);
    await artifactVersions().insertMany(Array.from({ length: count - 1 }, (_, index) => ({ ...first, _id: `${saved.id}:${index + 2}`, contentRevision: index + 2, revision: index + 2 })));
    await artifacts().updateOne({ _id: saved.id }, { $set: { revision: count, contentRevision: count, versionCount: count, historyTextBytes: first.textBytes * (count - 1) } });
    await artifactUsage().updateOne({ _id: me.userId }, { $set: { versionCount: count, textBytes: first.textBytes * count } });
    const before = await artifacts().findOne({ _id: saved.id }), usage = await artifactUsage().findOne({ _id: me.userId });
    await expect(call(me, 'artifacts.update', { artifactId: saved.id, revision: count, data: { text: 'z'.repeat(90_000) } })).rejects.toMatchObject({ code: 'artifact_limit' });
    expect(await artifacts().findOne({ _id: saved.id })).toEqual(before);
    expect(await artifactUsage().findOne({ _id: me.userId })).toEqual(usage);
    expect(await artifactVersions().countDocuments({ artifactId: saved.id })).toBe(count);
    expect((await publicArtifact(saved.id, 1)).data.text).toBe('y'.repeat(90_000));
    await call(me, 'artifacts.delete', { artifactId: saved.id, revision: count });
    expect(await artifactUsage().findOne({ _id: me.userId })).toMatchObject({ count: 0, versionCount: 0, textBytes: 0 });
  });
});

describe('artifact patch application', () => {
  it('does not mutate source data or permit array gaps, container crossing or prototype pollution', () => {
    const original = { rows: [{ value: 1 }], keep: true };
    expect(applyArtifactDataPatches(original, [{ op: 'set', path: ['rows', 1], value: { value: 2 } }, { op: 'remove', path: ['rows', 0] }])).toEqual({ rows: [{ value: 2 }], keep: true });
    expect(original).toEqual({ rows: [{ value: 1 }], keep: true });
    for (const path of [['rows', 4], ['keep', 'child'], ['rows', 'value'], ['__proto__', 'polluted']] as (string | number)[][]) expect(() => applyArtifactDataPatches(original, [{ op: 'set', path, value: true }])).toThrow();
  });
});
