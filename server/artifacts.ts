import { randomUUID } from 'node:crypto';
import type { ClientSession, Filter } from 'mongodb';
import {
  ARTIFACT_MAX_ACCOUNT_COUNT, ARTIFACT_MAX_ACCOUNT_TEXT_BYTES, ARTIFACT_MAX_ACCOUNT_VERSIONS, ARTIFACT_MAX_ASSETS, ARTIFACT_MAX_IMAGE_BYTES, ARTIFACT_MAX_INPUT_BYTES, ARTIFACT_MAX_PATCHES,
  artifactDataPatchSchema, artifactDataSchema, artifactInputs, publicArtifactSchema,
  type ArtifactAsset, type ArtifactCreateInput, type ArtifactData, type ArtifactDataPatch, type ArtifactDetail,
  type ArtifactPresentation, type ArtifactPresentationReference, type ArtifactProducer, type ArtifactSummary, type ArtifactUpdateInput, type ArtifactVersionSelector, type PublicArtifactDetail,
} from '../shared/artifacts';
import { users, type Actor } from './auth';
import { rows, transaction } from './db';
import { AppError, requireValue } from './errors';
import { retainUploads, revokeArtifactUploadReferences, uploads, type Upload } from './uploads';

export interface ArtifactDoc {
  _id: string; userId: string; title: string; bodyHtml: string; data: ArtifactData; refreshInstruction?: string;
  assets: ArtifactAsset[]; ephemeral: boolean; revision: number; contentRevision: number; textBytes: number;
  createdAt: string; updatedAt: string; contentUpdatedAt: string; dataUpdatedAt: string; producer: ArtifactProducer;
  /** The current source is counted once; prior immutable source is additional. */
  versionCount?: number; historyTextBytes?: number; snapshotFence?: number; legacyContentRevision?: number;
}
export interface ArtifactVersionDoc {
  _id: string; artifactId: string; userId: string; title: string; bodyHtml: string; data: ArtifactData; assets: ArtifactAsset[];
  revision: number; contentRevision: number; createdAt: string; updatedAt: string; contentUpdatedAt: string; dataUpdatedAt: string; textBytes: number;
}
interface ArtifactUsage { _id: string; count: number; textBytes: number; versionCount?: number }
type ArtifactMetadata = Omit<ArtifactDoc, 'bodyHtml' | 'data' | 'refreshInstruction' | 'assets' | 'textBytes'> & { refreshInstruction?: string; hasRefreshInstruction?: boolean };
export const artifacts = () => rows<ArtifactDoc>('artifacts');
export const artifactVersions = () => rows<ArtifactVersionDoc>('artifactVersions');
export const artifactUsage = () => rows<ArtifactUsage>('artifactUsage');
const summaryProjection = { _id: 1, userId: 1, title: 1, ephemeral: 1, revision: 1, contentRevision: 1, createdAt: 1, updatedAt: 1, contentUpdatedAt: 1, dataUpdatedAt: 1, producer: 1, hasRefreshInstruction: { $ne: [{ $ifNull: ['$refreshInstruction', null] }, null] } } as const;
const writes = new Set(['artifacts.create', 'artifacts.update', 'artifacts.delete']);

export function artifactTextBytes(record: Pick<ArtifactDoc, 'title' | 'bodyHtml' | 'data' | 'refreshInstruction'>) {
  return Buffer.byteLength(record.title) + Buffer.byteLength(record.bodyHtml) + Buffer.byteLength(JSON.stringify(record.data)) + Buffer.byteLength(record.refreshInstruction || '');
}
function versionFrom(record: ArtifactDoc): ArtifactVersionDoc {
  return { _id: `${record._id}:${record.contentRevision}`, artifactId: record._id, userId: record.userId, title: record.title, bodyHtml: record.bodyHtml,
    data: structuredClone(record.data), assets: structuredClone(record.assets), revision: record.revision, contentRevision: record.contentRevision,
    createdAt: record.createdAt, updatedAt: record.updatedAt, contentUpdatedAt: record.contentUpdatedAt, dataUpdatedAt: record.dataUpdatedAt,
    textBytes: artifactTextBytes({ ...record, refreshInstruction: undefined }) };
}
/** A pre-versioning root already consumes one implicit current version. Materialize
 * only its actual source/version, fencing concurrent metadata/content changes. */
async function ensureSnapshot(record: ArtifactDoc, session: ClientSession) {
  const id = `${record._id}:${record.contentRevision}`, existing = await artifactVersions().findOne({ _id: id, userId: record.userId }, { session });
  if (existing && record.legacyContentRevision !== undefined) return existing;
  const held = await artifacts().updateOne({ _id: record._id, userId: record.userId, revision: record.revision, contentRevision: record.contentRevision }, { $inc: { snapshotFence: 1 }, ...(record.legacyContentRevision === undefined ? { $set: { legacyContentRevision: record.contentRevision } } : {}) }, { session });
  if (!held.matchedCount) throw new AppError(409, 'artifact_changed', 'This artifact changed. Read it again before opening its saved version.');
  if (existing) return existing;
  const snapshot = versionFrom(record);
  await artifactVersions().insertOne(snapshot, { session });
  return snapshot;
}
async function ownedVersion(record: ArtifactDoc, selector: ArtifactVersionSelector, session?: ClientSession): Promise<ArtifactDoc> {
  if (selector === 'legacy' && record.legacyContentRevision === undefined) {
    if (!session) return transaction(async active => ownedVersion(await ownArtifact(record.userId, record._id, active), selector, active));
    await ensureSnapshot(record, session);
  }
  const contentRevision = selector === 'legacy' ? record.legacyContentRevision ?? record.contentRevision : selector;
  const snapshot = await artifactVersions().findOne({ _id: `${record._id}:${contentRevision}`, artifactId: record._id, userId: record.userId }, { session });
  if (snapshot) return { ...record, ...snapshot, _id: record._id, userId: record.userId };
  if (record.contentRevision !== contentRevision) throw new AppError(404, 'not_found', 'This artifact version is unavailable.');
  if (!session) return transaction(async active => ownedVersion(await ownArtifact(record.userId, record._id, active), contentRevision, active));
  return { ...record, ...await ensureSnapshot(record, session), _id: record._id, userId: record.userId };
}
export function artifactSummary(record: ArtifactMetadata): ArtifactSummary {
  return { id: record._id, title: record.title, ephemeral: record.ephemeral, revision: record.revision, contentRevision: record.contentRevision,
    hasRefreshInstruction: record.hasRefreshInstruction ?? Boolean(record.refreshInstruction), createdAt: record.createdAt, updatedAt: record.updatedAt,
    contentUpdatedAt: record.contentUpdatedAt, dataUpdatedAt: record.dataUpdatedAt, producer: record.producer };
}
export function artifactDetail(record: ArtifactDoc): ArtifactDetail {
  return { ...artifactSummary(record), bodyHtml: record.bodyHtml, data: record.data, refreshInstruction: record.refreshInstruction ?? null, assets: record.assets };
}
export async function ownArtifact(userId: string, artifactId: string, session?: ClientSession) {
  return requireValue(await artifacts().findOne({ _id: artifactId, userId }, { session }), 'This artifact is unavailable.');
}
async function artifactByCapability(artifactId: string, projection: Record<string, 1>, session?: ClientSession, selector?: ArtifactVersionSelector): Promise<ArtifactDoc> {
  if (!artifactInputs['artifacts.get'].shape.artifactId.safeParse(artifactId).success) throw new AppError(404, 'not_found', 'This artifact is unavailable.');
  if (selector !== undefined && selector !== 'legacy' && (!Number.isSafeInteger(selector) || selector < 1)) throw new AppError(404, 'not_found', 'This artifact version is unavailable.');
  let record = requireValue(await artifacts().findOne({ _id: artifactId }, { projection: selector === undefined ? projection : { userId: 1, contentRevision: 1, legacyContentRevision: 1 }, session }), 'This artifact is unavailable.');
  if (record.assets && record.assets.length > ARTIFACT_MAX_ASSETS) throw new AppError(404, 'not_found', 'This artifact is unavailable.');
  requireValue(await users().findOne({ _id: record.userId, suspendedAt: null }, { projection: { _id: 1 }, session }), 'This artifact is unavailable.');
  if (selector !== undefined) {
    if (selector === 'legacy' && record.legacyContentRevision === undefined) {
      if (!session) return transaction(active => artifactByCapability(artifactId, projection, active, selector));
      await ensureSnapshot(await ownArtifact(record.userId, artifactId, session), session);
    }
    const contentRevision = selector === 'legacy' ? record.legacyContentRevision ?? record.contentRevision : selector;
    let snapshot = await artifactVersions().findOne({ _id: `${artifactId}:${contentRevision}`, artifactId, userId: record.userId }, { projection, session });
    if (!snapshot) {
      if (record.contentRevision !== contentRevision) throw new AppError(404, 'not_found', 'This artifact version is unavailable.');
      if (!session) return transaction(active => artifactByCapability(artifactId, projection, active, selector));
      await ensureSnapshot(await ownArtifact(record.userId, artifactId, session), session);
      snapshot = requireValue(await artifactVersions().findOne({ _id: `${artifactId}:${contentRevision}`, artifactId, userId: record.userId }, { projection, session }), 'This artifact version is unavailable.');
    }
    record = { ...record, ...snapshot, _id: artifactId, userId: record.userId };
    if (record.assets && record.assets.length > ARTIFACT_MAX_ASSETS) throw new AppError(404, 'not_found', 'This artifact is unavailable.');
  }
  return record;
}
type PublicImageMetadata = Pick<Upload, '_id' | 'ready' | 'deletedAt' | 'purpose' | 'logEntryId' | 'mime' | 'bytes' | 'sha256' | 'retained' | 'expiresAt'> & { moderatedAt?: string };
const publicImageProjection = { ready: 1, deletedAt: 1, moderatedAt: 1, purpose: 1, logEntryId: 1, mime: 1, bytes: 1, sha256: 1, retained: 1, expiresAt: 1 } as const;
function eligiblePublicImage(file: PublicImageMetadata | null): file is PublicImageMetadata {
  return Boolean(file && file.ready && !file.deletedAt && !file.moderatedAt && file.purpose !== 'log_media' && !file.logEntryId &&
    ['image/png', 'image/jpeg', 'image/webp'].includes(file.mime) && Number.isSafeInteger(file.bytes) && file.bytes > 0 && file.bytes <= ARTIFACT_MAX_IMAGE_BYTES &&
    /^[0-9a-f]{64}$/.test(file.sha256) &&
    (file.retained || !file.expiresAt || file.expiresAt > new Date()));
}
async function notHangoutOwned(userId: string, fileId: string, session?: ClientSession) {
  return !await rows('attachmentReferences').findOne({ ownerId: userId, fileId, kind: 'hangouts' }, { projection: { _id: 1 }, session });
}
async function publicImageFiles(record: Pick<ArtifactDoc, 'userId' | 'assets'>, session?: ClientSession) {
  const ids = [...new Set(record.assets.map(asset => asset.fileId))];
  const files = ids.length ? await uploads().find({ _id: { $in: ids }, userId: record.userId, ready: true, deletedAt: { $exists: false }, moderatedAt: { $exists: false } }, { projection: publicImageProjection, session }).limit(ids.length).toArray() : [];
  const eligible = new Set<string>();
  for (const file of files) if (eligiblePublicImage(file) && await notHangoutOwned(record.userId, file._id, session)) eligible.add(file._id);
  return { files, eligible, ids };
}
/** Anonymous render-only access by the existing high-entropy artifact ID. */
export async function publicArtifact(artifactId: string, contentRevision?: ArtifactVersionSelector): Promise<PublicArtifactDetail> {
  const record = await artifactByCapability(artifactId, { userId: 1, title: 1, bodyHtml: 1, data: 1, assets: 1, revision: 1, contentRevision: 1, updatedAt: 1, contentUpdatedAt: 1 }, undefined, contentRevision);
  const { files, eligible } = await publicImageFiles(record);
  const permitted = record.assets.filter(asset => eligible.has(asset.fileId));
  if (permitted.reduce((total, asset) => total + files.find(file => file._id === asset.fileId)!.bytes, 0) > ARTIFACT_MAX_IMAGE_BYTES) throw new AppError(404, 'not_found', 'This artifact is unavailable.');
  const assets = permitted.map(asset => { const file = files.find(file => file._id === asset.fileId)!; return { id: asset.id, url: `/api/artifacts/${record._id}/assets/${asset.id}${contentRevision === undefined ? '' : `?version=${record.contentRevision}`}`, mime: file.mime, bytes: file.bytes, sha256: file.sha256 }; });
  return publicArtifactSchema.parse({ id: record._id, title: record.title, bodyHtml: record.bodyHtml, data: record.data, assets, revision: record.revision,
    contentRevision: record.contentRevision, updatedAt: record.updatedAt, contentUpdatedAt: record.contentUpdatedAt });
}
/** Exact-link preview metadata; HTML, data and private fields are not fetched. */
export async function publicArtifactSummary(artifactId: string, contentRevision?: ArtifactVersionSelector): Promise<Pick<PublicArtifactDetail, 'id' | 'title'>> {
  const record = await artifactByCapability(artifactId, { userId: 1, title: 1 }, undefined, contentRevision);
  return { id: record._id, title: record.title };
}
/** A visible shared viewer checks revisions without repeatedly transferring its body. */
export async function publicArtifactState(artifactId: string, contentRevision?: ArtifactVersionSelector): Promise<Pick<PublicArtifactDetail, 'id' | 'revision' | 'contentRevision' | 'updatedAt'> & { assets: { id: string; sha256: string }[] }> {
  const projection = { userId: 1, assets: 1, revision: 1, contentRevision: 1, updatedAt: 1 } as const;
  let record = await artifactByCapability(artifactId, projection, undefined, contentRevision);
  let images = await publicImageFiles(record);
  if (contentRevision === undefined && images.ids.some(id => !images.eligible.has(id))) {
    // Anonymous viewers have no owner event stream. Polling must also revoke
    // stale refs when no subscriber was present to observe file moderation.
    const current = await transaction(async session => {
      const current = await artifactByCapability(artifactId, projection, session), files = await publicImageFiles(current, session);
      for (const id of files.ids) if (!files.eligible.has(id)) await revokeArtifactUploadReferences(current.userId, id, session);
      return { record: await artifactByCapability(artifactId, projection, session), images: files };
    });
    record = current.record; images = current.images;
  }
  const assets = record.assets.filter(asset => images.eligible.has(asset.fileId)).map(asset => ({ id: asset.id, sha256: images.files.find(file => file._id === asset.fileId)!.sha256 }));
  return { id: record._id, revision: record.revision, contentRevision: record.contentRevision, updatedAt: record.updatedAt, assets };
}
/** Internal image-route helper. Do not serialize this owner-private file metadata. */
export async function publicArtifactImage(artifactId: string, assetId: string, contentRevision?: ArtifactVersionSelector): Promise<Upload> {
  const record = await artifactByCapability(artifactId, { userId: 1, assets: 1 }, undefined, contentRevision), asset = record.assets.find(asset => asset.id === assetId);
  if (!asset) throw new AppError(404, 'not_found', 'This artifact image is unavailable.');
  const fileId = asset.fileId;
  const file = await uploads().findOne({ _id: fileId, userId: record.userId, ready: true, deletedAt: { $exists: false }, moderatedAt: { $exists: false } });
  if (!eligiblePublicImage(file) || !await notHangoutOwned(record.userId, fileId)) throw new AppError(404, 'not_found', 'This artifact image is unavailable.');
  return file;
}
/** Bind only a still-viewable exact capability. Source-owner/root writes fence
 * suspension and deletion before the caller commits its own chat attachment. */
export async function authorizeArtifactPresentation(artifactId: string, contentRevision: ArtifactVersionSelector, session: ClientSession): Promise<void> {
  const record = await artifactByCapability(artifactId, { userId: 1, revision: 1, contentRevision: 1 }, session, contentRevision);
  const root = await artifacts().updateOne({ _id: artifactId, userId: record.userId }, { $inc: { snapshotFence: 1 } }, { session });
  if (!root.matchedCount) throw new AppError(404, 'not_found', 'This artifact is unavailable.');
  const owner = await users().updateOne({ _id: record.userId, suspendedAt: null }, { $inc: { authorityRevision: 1 } }, { session });
  if (!owner.matchedCount) throw new AppError(404, 'not_found', 'This artifact is unavailable.');
}
export async function publishArtifactChange(userId: string, artifactId: string, session: ClientSession, deleted = false) {
  await rows('recordEvents').insertOne({ _id: randomUUID(), userIds: [userId], payload: { keys: ['artifacts'], artifacts: [{ id: artifactId, deleted }] }, expiresAt: new Date(Date.now() + 3600000) }, { session });
}

function changed(record: ArtifactDoc, revision: number) {
  if (record.revision !== revision) throw new AppError(409, 'artifact_changed', 'This artifact changed. Read it again before saving.');
}
function nextTimestamp(previous?: string) { return new Date(Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0)).toISOString(); }
function assertInputSize(input: unknown) {
  let serialized: string;
  try { serialized = JSON.stringify(input); } catch { throw new AppError(422, 'artifact_json', 'Use valid JSON for artifact inputs.'); }
  if (!serialized || Buffer.byteLength(serialized) > ARTIFACT_MAX_INPUT_BYTES) throw new AppError(413, 'artifact_input_size', 'The combined artifact input is too large. Reduce its HTML or data.');
}
async function actorUser(actor: Actor, write: boolean, session?: ClientSession) {
  if (actor.background && actor.privateAccess === false) throw new AppError(403, 'private_access_required', 'Artifacts require private account access.');
  if (write && actor.scope !== 'write') throw new AppError(403, 'scope', 'Changing artifacts requires write access.');
  const user = requireValue(await users().findOne({ _id: actor.userId, suspendedAt: null }, { session, projection: { handle: 1, activeRun: 1 } }), 'This account is unavailable.');
  if (!user.handle) throw new AppError(403, 'account_required', 'Save your account before making artifacts.');
  return user;
}
async function producerFor(actor: Actor, activeRun: string | null | undefined, session: ClientSession): Promise<ArtifactProducer> {
  if (actor.source === 'external') {
    if (!actor.credentialId) return { kind: 'external', name: 'Connected agent' };
    const token = requireValue(await rows('tokens').findOne({ _id: actor.credentialId, userId: actor.userId, scope: 'write', revokedAt: null, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] }, { session, projection: { name: 1 } }), 'This connected agent is unavailable.');
    return { kind: 'external', name: String(token.name || 'Connected agent').slice(0, 160), id: token._id };
  }
  if (actor.source === 'browser') return { kind: 'browser', name: 'You' };
  const runId = actor.runId || activeRun;
  const run = runId && await rows('runs').findOne({ _id: runId, userId: actor.userId, status: 'running', cancelRequested: { $ne: true } }, { session, projection: { purpose: 1, automationId: 1, automationName: 1 } });
  if (!run) throw new AppError(409, 'stale_run', 'The task no longer has authority to create an artifact.');
  return run.purpose === 'automation'
    ? { kind: 'automation', name: String(run.automationName || 'Your automation').slice(0, 160), ...(typeof run.automationId === 'string' ? { id: run.automationId } : {}) }
    : { kind: 'hosted', name: 'Your agent', id: run._id };
}

async function adjustUsage(userId: string, countDelta: number, byteDelta: number, session: ClientSession, versionDelta = 0) {
  const usage = await artifactUsage().findOne({ _id: userId }, { session });
  if (!usage || usage.versionCount === undefined) {
    // This also initializes accounts with preexisting records. The owner cap
    // bounds the entire recovery read, not merely the returned counter.
    const existing = await artifacts().find({ userId }, { session, projection: { textBytes: 1, historyTextBytes: 1, versionCount: 1 } }).limit(ARTIFACT_MAX_ACCOUNT_COUNT + 1).toArray();
    if (existing.length > ARTIFACT_MAX_ACCOUNT_COUNT || existing.some(record => !Number.isSafeInteger(record.textBytes) || record.textBytes < 0 || !Number.isSafeInteger(record.historyTextBytes ?? 0) || (record.historyTextBytes ?? 0) < 0 || !Number.isSafeInteger(record.versionCount ?? 1) || (record.versionCount ?? 1) < 1)) throw new AppError(503, 'artifact_usage', 'Artifact usage needs to be checked before saving.');
    const initialized = { count: existing.length, textBytes: existing.reduce((sum, record) => sum + record.textBytes + (record.historyTextBytes ?? 0), 0), versionCount: existing.reduce((sum, record) => sum + (record.versionCount ?? 1), 0) };
    if (usage) await artifactUsage().updateOne({ _id: userId }, { $set: initialized }, { session });
    else await artifactUsage().insertOne({ _id: userId, ...initialized }, { session });
  }
  const updated = await artifactUsage().updateOne({ _id: userId, $expr: { $and: [
    { $gte: [{ $add: ['$count', countDelta] }, 0] }, { $lte: [{ $add: ['$count', countDelta] }, ARTIFACT_MAX_ACCOUNT_COUNT] },
    { $gte: [{ $add: ['$textBytes', byteDelta] }, 0] }, { $lte: [{ $add: ['$textBytes', byteDelta] }, ARTIFACT_MAX_ACCOUNT_TEXT_BYTES] },
    { $gte: [{ $add: ['$versionCount', versionDelta] }, 0] }, { $lte: [{ $add: ['$versionCount', versionDelta] }, ARTIFACT_MAX_ACCOUNT_VERSIONS] },
  ] } }, { $inc: { count: countDelta, textBytes: byteDelta, versionCount: versionDelta } }, { session });
  if (!updated.matchedCount) throw new AppError(422, 'artifact_limit', 'Your artifacts and saved versions have reached their count or text storage limit. Delete an artifact with its saved versions to make room. Earlier chat versions are never silently removed.');
}

async function retainAssets(userId: string, assets: ArtifactAsset[], session: ClientSession) {
  if (!assets.length) return;
  const ids = [...new Set(assets.map(asset => asset.fileId))];
  const files = await uploads().find({ _id: { $in: ids }, userId, ready: true, deletedAt: { $exists: false }, moderatedAt: { $exists: false } }, { session }).limit(ids.length).toArray();
  if (files.length !== ids.length) throw new AppError(422, 'artifact_asset', 'Choose ready images uploaded by this account.');
  if (files.some(file => file.purpose === 'log_media' || file.logEntryId) || await rows('attachmentReferences').findOne({ ownerId: userId, fileId: { $in: ids }, kind: 'hangouts' }, { session, projection: { _id: 1 } })) throw new AppError(422, 'log_file_owned', 'These photos belong to a hangout. Upload separate photos for the artifact.');
  const byId = new Map(files.map(file => [file._id, file]));
  if (files.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.mime) || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || !file.retained && file.expiresAt && file.expiresAt <= new Date()) || assets.reduce((total, asset) => total + byId.get(asset.fileId)!.bytes, 0) > ARTIFACT_MAX_IMAGE_BYTES) throw new AppError(422, 'artifact_asset', 'Artifact images must be ready PNG, JPEG or WebP files totaling at most 4 MB.');
  // Retention serializes with upload deletion, retaining the original file
  // without copying its bytes or charging its storage allowance a second time.
  const groups = new Map<Upload['purpose'], string[]>();
  for (const file of files) groups.set(file.purpose, [...(groups.get(file.purpose) || []), file._id]);
  for (const [purpose, fileIds] of groups) await retainUploads(userId, fileIds, purpose, session);
}

export function applyArtifactDataPatches(current: ArtifactData, patches: ArtifactDataPatch[]): ArtifactData {
  if (patches.length < 1 || patches.length > ARTIFACT_MAX_PATCHES) throw new AppError(422, 'artifact_patch', `Use between one and ${ARTIFACT_MAX_PATCHES} artifact patches.`);
  const root = structuredClone(artifactDataSchema.parse(current));
  for (const raw of patches) {
    const patch = artifactDataPatchSchema.parse(raw);
    let parent: Record<string, unknown> | unknown[] = root;
    for (let index = 0; index < patch.path.length - 1; index++) {
      const segment = patch.path[index], next = patch.path[index + 1];
      if (typeof segment === 'number') {
        if (!Array.isArray(parent) || segment > parent.length) throw new AppError(422, 'artifact_patch', 'This artifact array path does not exist.');
        if (parent[segment] === undefined) parent[segment] = typeof next === 'number' ? [] : {};
        const child = parent[segment];
        if (!child || typeof child !== 'object') throw new AppError(422, 'artifact_patch', 'This artifact patch crosses a non-container value.');
        parent = child as Record<string, unknown> | unknown[];
      } else {
        if (Array.isArray(parent)) throw new AppError(422, 'artifact_patch', 'Use a numeric array index in this artifact path.');
        if (!Object.hasOwn(parent, segment)) parent[segment] = typeof next === 'number' ? [] : {};
        const child = parent[segment];
        if (!child || typeof child !== 'object') throw new AppError(422, 'artifact_patch', 'This artifact patch crosses a non-container value.');
        parent = child as Record<string, unknown> | unknown[];
      }
    }
    const leaf = patch.path.at(-1)!;
    if (typeof leaf === 'number') {
      if (!Array.isArray(parent) || leaf > parent.length || patch.op === 'remove' && leaf === parent.length) throw new AppError(422, 'artifact_patch', 'This artifact array item does not exist.');
      if (patch.op === 'remove') parent.splice(leaf, 1); else parent[leaf] = structuredClone(patch.value);
    } else {
      if (Array.isArray(parent)) throw new AppError(422, 'artifact_patch', 'Use a numeric array index in this artifact path.');
      if (patch.op === 'remove') {
        if (!Object.hasOwn(parent, leaf)) throw new AppError(422, 'artifact_patch', 'This artifact field does not exist.');
        delete parent[leaf];
      } else parent[leaf] = structuredClone(patch.value);
    }
  }
  return artifactDataSchema.parse(root);
}

function cursorFor(record: ArtifactMetadata, includeEphemeral: boolean) { return Buffer.from(JSON.stringify({ time: record.updatedAt, id: record._id, includeEphemeral })).toString('base64url'); }
function cursorFilter(cursor: string | undefined, includeEphemeral: boolean): Filter<ArtifactDoc> {
  if (!cursor) return {};
  try {
    const raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (Object.keys(raw).length !== 3 || typeof raw.time !== 'string' || !Number.isFinite(Date.parse(raw.time)) || typeof raw.id !== 'string' || !/^[0-9a-f-]{36}$/.test(raw.id) || raw.includeEphemeral !== includeEphemeral) throw Error();
    return { $or: [{ updatedAt: { $lt: raw.time } }, { updatedAt: raw.time, _id: { $lt: raw.id } }] };
  } catch { throw new AppError(422, 'artifact_cursor', 'This artifact cursor is invalid for the selected list.'); }
}
function reference(record: ArtifactDoc, presentation: ArtifactPresentation): ArtifactPresentationReference { return { artifactId: record._id, presentation, presentedRevision: record.revision, contentRevision: record.contentRevision, title: record.title }; }

/** The shared executor owns receipts, confirmation and run publication binding. */
export async function artifactOperation(name: string, input: Record<string, unknown>, actor: Actor, session?: ClientSession): Promise<unknown> {
  if (!(name in artifactInputs)) throw new AppError(404, 'unknown_operation', 'Unknown artifact operation.');
  assertInputSize(input);
  const parsed = artifactInputs[name as keyof typeof artifactInputs].parse(input);
  if (name === 'artifacts.view') { const data = parsed as { artifactId: string; contentRevision?: ArtifactVersionSelector }; return publicArtifact(data.artifactId, data.contentRevision); }
  if (name === 'artifacts.present') {
    if (!session) return transaction(active => artifactOperation(name, input, actor, active));
    const data = artifactInputs['artifacts.present'].parse(input);
    const record = await artifactByCapability(data.artifactId, { userId: 1, title: 1, revision: 1, contentRevision: 1, legacyContentRevision: 1 }, session, data.contentRevision);
    if (data.contentRevision === undefined) {
      // A new presentation always pins a real snapshot, including old roots
      // that previously had only mutable current content.
      const snapshot = await artifactVersions().findOne({ _id: `${record._id}:${record.contentRevision}`, userId: record.userId }, { session, projection: { _id: 1 } });
      if (!snapshot || record.legacyContentRevision === undefined) await ensureSnapshot(await ownArtifact(record.userId, record._id, session), session);
    }
    return reference(record, data.presentation);
  }
  if (writes.has(name) && !session) return transaction(active => artifactOperation(name, input, actor, active));
  if (writes.has(name) && !session!.inTransaction()) throw new Error('Artifact writes require a transaction.');
  const user = await actorUser(actor, writes.has(name), session);
  if (name === 'artifacts.list') {
    const data = parsed as ReturnType<typeof artifactInputs['artifacts.list']['parse']>;
    const found = await artifacts().find({ userId: actor.userId, ...(data.includeEphemeral ? {} : { ephemeral: false }), ...cursorFilter(data.cursor, data.includeEphemeral) }, { session, projection: summaryProjection }).sort({ updatedAt: -1, _id: -1 }).limit(data.limit + 1).toArray();
    return { items: found.slice(0, data.limit).map(artifactSummary), nextCursor: found.length > data.limit ? cursorFor(found[data.limit - 1], data.includeEphemeral) : null };
  }
  if (name === 'artifacts.create') {
    const data = parsed as ArtifactCreateInput, now = nextTimestamp();
    const record: ArtifactDoc = { _id: randomUUID(), userId: actor.userId, title: data.title.replace(/\s+/g, ' '), bodyHtml: data.bodyHtml, data: structuredClone(data.data),
      ...(data.refreshInstruction ? { refreshInstruction: data.refreshInstruction } : {}), assets: data.assets, ephemeral: data.ephemeral, revision: 1, contentRevision: 1, textBytes: 0, versionCount: 1, historyTextBytes: 0, legacyContentRevision: 1,
      createdAt: now, updatedAt: now, contentUpdatedAt: now, dataUpdatedAt: now, producer: await producerFor(actor, user.activeRun, session!) };
    record.textBytes = artifactTextBytes(record);
    await adjustUsage(actor.userId, 1, record.textBytes, session!, 1);
    await retainAssets(actor.userId, record.assets, session!);
    await artifacts().insertOne(record, { session });
    await artifactVersions().insertOne(versionFrom(record), { session });
    await publishArtifactChange(actor.userId, record._id, session!);
    return artifactSummary(record);
  }
  let record = await ownArtifact(actor.userId, (parsed as { artifactId: string }).artifactId, session);
  if (name === 'artifacts.get') {
    const data = parsed as ReturnType<typeof artifactInputs['artifacts.get']['parse']>;
    if (data.contentRevision !== undefined) record = await ownedVersion(record, data.contentRevision, session);
    if (data.section === 'all') return artifactDetail(record);
    const text = data.section === 'bodyHtml' ? record.bodyHtml : data.section === 'data' ? JSON.stringify(record.data) : record.refreshInstruction || '';
    const offset = Math.min(data.offset, text.length), end = Math.min(text.length, offset + data.length);
    return { ...artifactSummary(record), source: { section: data.section, offset, totalCharacters: text.length, content: text.slice(offset, end), nextOffset: end < text.length ? end : null } };
  }
  const data = parsed as ArtifactUpdateInput;
  changed(record, data.revision);
  if (name === 'artifacts.delete') {
    await adjustUsage(actor.userId, -1, -record.textBytes - (record.historyTextBytes ?? 0), session!, -(record.versionCount ?? 1));
    const removed = await artifacts().deleteOne({ _id: record._id, userId: actor.userId, revision: record.revision }, { session });
    if (!removed.deletedCount) throw new AppError(409, 'artifact_changed', 'This artifact changed. Read it again before deleting.');
    await artifactVersions().deleteMany({ artifactId: record._id, userId: actor.userId }, { session });
    await publishArtifactChange(actor.userId, record._id, session!, true);
    return { deleted: true, artifactId: record._id };
  }
  const previousVersion = await ensureSnapshot(record, session!);
  const next: ArtifactDoc = { ...record, versionCount: record.versionCount ?? 1, historyTextBytes: record.historyTextBytes ?? 0, ...(data.title !== undefined ? { title: data.title.replace(/\s+/g, ' ') } : {}), ...(data.bodyHtml !== undefined ? { bodyHtml: data.bodyHtml } : {}),
    ...(data.data !== undefined ? { data: structuredClone(data.data) } : data.dataPatches !== undefined ? { data: applyArtifactDataPatches(record.data, data.dataPatches) } : {}),
    ...(data.refreshInstruction !== undefined ? { refreshInstruction: data.refreshInstruction ?? undefined } : {}), ...(data.assets !== undefined ? { assets: data.assets } : {}), ...(data.ephemeral !== undefined ? { ephemeral: data.ephemeral } : {}), revision: record.revision + 1, updatedAt: nextTimestamp(record.updatedAt) };
  const dataChanged = JSON.stringify(record.data) !== JSON.stringify(next.data);
  const contentChanged = record.bodyHtml !== next.bodyHtml || dataChanged || JSON.stringify(record.assets) !== JSON.stringify(next.assets);
  if (contentChanged) { next.contentRevision++; next.contentUpdatedAt = next.updatedAt; next.versionCount!++; next.historyTextBytes! += previousVersion.textBytes; }
  if (dataChanged) next.dataUpdatedAt = next.updatedAt;
  next.textBytes = artifactTextBytes(next);
  await adjustUsage(actor.userId, 0, next.textBytes - record.textBytes + (contentChanged ? previousVersion.textBytes : 0), session!, contentChanged ? 1 : 0);
  if (data.assets !== undefined) await retainAssets(actor.userId, next.assets, session!);
  const { _id, refreshInstruction, snapshotFence: _snapshotFence, ...saved } = next;
  const updated = await artifacts().updateOne({ _id, userId: actor.userId, revision: record.revision }, { $set: { ...saved, ...(refreshInstruction !== undefined ? { refreshInstruction } : {}) }, ...(refreshInstruction === undefined ? { $unset: { refreshInstruction: '' } } : {}) }, { session });
  if (!updated.matchedCount) throw new AppError(409, 'artifact_changed', 'This artifact changed. Read it again before saving.');
  if (contentChanged) await artifactVersions().insertOne(versionFrom(next), { session });
  await publishArtifactChange(actor.userId, record._id, session!);
  return artifactSummary(next);
}
