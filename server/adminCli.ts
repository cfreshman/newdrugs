import { readUpload, uploads } from './uploads';
import { moderatePost, moderateReportedMessage, suspendUser } from './moderation';
import { Router } from 'express';
import { z } from 'zod';
import { mongo, rows, transaction } from './db';
import { config } from './config';
import { hash, profile, users } from './auth';
import { AppError, requireValue } from './errors';
import { canonicalJSON } from './operations';
import { starterPoolStatus } from './starterPool';

interface AdminKey { _id: string; label: string; stages: string[]; createdAt: string; revokedAt: string | null; revision?: number }
export const adminKeys = () => mongo.db(config.STARTER_POOL_DB).collection<AdminKey>('adminCliKeys');
const stage = () => config.APP_ENV === 'production' ? 'prod' : 'dev';
const id = z.string().min(1).max(150);
const specs = [
  { name: 'identity.get', kind: 'read', description: 'Read the operator key identity and stage. This key is separate from social accounts.', schema: z.strictObject({}) },
  { name: 'reports.list', kind: 'read', description: 'List reports in this stage, newest IDs first. Use before to paginate.', schema: z.strictObject({ status: z.enum(['unreviewed', 'resolved', 'dismissed', 'all']).default('unreviewed'), before: id.optional(), limit: z.number().int().min(1).max(50).default(20) }) },
  { name: 'reports.get', kind: 'read', description: 'Read a report and the reported public profile. Includes only the exact content the reporter submitted as evidence, never the rest of a private conversation or agent chat.', schema: z.strictObject({ reportId: id }) },
  { name: 'reports.files', kind: 'read', description: 'List only photos attached to the exact post submitted in this report. Download one with admin file-download <report-id> <file-id> <destination>. No access to other user files.', schema: z.strictObject({reportId:id}) },
  { name: 'reports.review', kind: 'write', description: 'Record a report decision and operator note. This records your review; it does not delete content or suspend anyone. Requires confirmation and a unique idempotency key.', schema: z.strictObject({ reportId: id, status: z.enum(['resolved', 'dismissed', 'unreviewed']), note: z.string().trim().min(1).max(2000) }) },
  { name: 'posts.moderate', kind: 'write', description: 'Hide or restore one public post. Hiding removes it from feeds, search and public photo access; replies retain a removed-parent stub. Does not erase evidence. Requires exact confirmation and an audit reason.', schema: z.strictObject({postId:id,hidden:z.boolean(),reason:z.string().trim().min(1).max(2000)}) },
  { name: 'users.suspend', kind: 'write', description: 'Suspend or restore one account. Suspension hides its profile/posts, signs out sessions, revokes connected-agent credentials, pauses automations and cancels active tasks. Restoration does not restore revoked access or restart tasks. Requires exact confirmation and an audit reason.', schema: z.strictObject({userId:id,suspended:z.boolean(),reason:z.string().trim().min(1).max(2000)}) },
  { name: 'reports.moderate_message', kind: 'write', description: 'Hide or restore the exact DM the reporter explicitly submitted as evidence. Does not grant access to the rest of any private conversation. Requires exact confirmation and an audit reason.', schema: z.strictObject({reportId:id,hidden:z.boolean(),reason:z.string().trim().min(1).max(2000)}) },
  { name: 'starter.pool', kind: 'read', description: 'Read the shared starter credit pool and recent grants.', schema: z.strictObject({}) },
  { name: 'keys.list', kind: 'read', description: 'List operator key labels and stage access. No secrets are returned.', schema: z.strictObject({}) },
  { name: 'keys.revoke', kind: 'write', description: 'Revoke one operator key, including this key if explicitly selected. Requires confirmation. Create replacement keys through the host console.', schema: z.strictObject({ keyId: id }) },
] as const;
export const adminCatalog = () => specs.map(({ schema, ...spec }) => ({ ...spec, confirmationRequired: spec.kind === 'write', inputSchema: z.toJSONSchema(schema) }));
export async function authenticateAdminKey(token: string) {
  if (!/^nd_admin_[A-Za-z0-9_-]{43}$/.test(token)) throw new AppError(401, 'admin_key', 'An operator CLI key is required.');
  const key = await adminKeys().findOne({ _id: hash(token), revokedAt: null, stages: stage() });
  if (!key) throw new AppError(401, 'admin_key', 'This operator key is revoked or not authorized for this stage.');
  return key;
}
export async function executeAdminOperation(key: AdminKey, name: string, raw: unknown, requestKey?: string, confirmed = false) {
  const spec = specs.find(item => item.name === name);
  if (!spec) throw new AppError(404, 'operation', 'Unknown operator operation.');
  const input = spec.schema.parse(raw) as Record<string, unknown>;
  const identity = () => ({ keyId: key._id, label: key.label, stage: stage(), stages: key.stages });
  if (spec.kind === 'read') {
    requireValue(await adminKeys().findOne({ _id: key._id, revokedAt: null, stages: stage() }));
    if (name === 'identity.get') return identity();
    if (name === 'starter.pool') return starterPoolStatus();
    if (name === 'keys.list') return { items: (await adminKeys().find({ stages: stage() }).limit(100).toArray()).map(row => ({ id: row._id, label: row.label, stages: row.stages, createdAt: row.createdAt, revokedAt: row.revokedAt })) };
    if(name==='reports.files'){
      const report=requireValue(await rows('reports').findOne({_id:String(input.reportId)}));
      const evidence=report.evidence as {kind?:string;fileIds?:string[]}|undefined;
      const files=await uploads().find({_id:{$in:evidence?.kind==='post'?evidence.fileIds||[]:[]},userId:String(report.personId),ready:true,deletedAt:{$exists:false}}).toArray();
      return {items:files.map(file=>({id:file._id,name:file.name,mime:file.mime,bytes:file.bytes}))};
    }
    if (name === 'reports.get') {
      const report = requireValue(await rows('reports').findOne({ _id: String(input.reportId) }));
      const person = await users().findOne({ _id: String(report.personId) });
      return { report, person: report.profileSnapshot || (person?.discoverable && !person.suspendedAt ? profile(person) : null) };
    }
    const limit = Number(input.limit);
    const items = await rows('reports').find({ ...(input.status === 'all' ? {} : { status: input.status }), ...(input.before ? { _id: { $lt: String(input.before) } } : {}) }).sort({ _id: -1 }).limit(limit + 1).toArray();
    return { items: items.slice(0, limit), nextCursor: items.length > limit ? items[limit - 1]._id : null };
  }
  if (!confirmed) throw new AppError(409, 'confirmation_required', 'Review the exact action and confirm with --yes.');
  if (!requestKey || requestKey.length < 8 || requestKey.length > 150) throw new AppError(422, 'idempotency_required', 'Provide an idempotency key of 8 to 150 characters.');
  const fingerprint = hash(canonicalJSON({ name, input })), receiptId = hash(`${key._id}:${requestKey}`);
  return transaction(async session => {
    // Serialize revocation with every write, including replay, across stages.
    requireValue(await adminKeys().findOneAndUpdate({ _id: key._id, revokedAt: null, stages: stage() }, { $inc: { revision: 1 } }, { session }), 'The operator key was revoked.');
    const prior = await rows('adminReceipts').findOne({ _id: receiptId }, { session });
    if (prior) { if (prior.fingerprint !== fingerprint) throw new AppError(409, 'idempotency_conflict', 'This request key was used for a different action.'); return prior.result; }
    const now = new Date().toISOString();
    let result: unknown;
    if (name === 'reports.review') {
      result = requireValue(await rows('reports').findOneAndUpdate({ _id: String(input.reportId) }, { $set: { status: input.status, reviewNote: input.note, reviewedAt: now, reviewedBy: key._id } }, { session, returnDocument: 'after' }));
    } else if(name==='posts.moderate') result=await moderatePost(String(input.postId),Boolean(input.hidden),String(input.reason),key._id,session);
    else if(name==='users.suspend') result=await suspendUser(String(input.userId),Boolean(input.suspended),String(input.reason),session);
    else if(name==='reports.moderate_message') result=await moderateReportedMessage(String(input.reportId),Boolean(input.hidden),String(input.reason),key._id,session);
    else {
      requireValue(await adminKeys().findOneAndUpdate({ _id: String(input.keyId), stages: stage() }, { $set: { revokedAt: now } }, { session }));
      result = { revoked: true, keyId: input.keyId };
    }
    await rows('adminAudit').insertOne({ _id: receiptId, keyId: key._id, label: key.label, name, input, createdAt: now }, { session });
    await rows('adminReceipts').insertOne({ _id: receiptId, fingerprint, result, createdAt: now }, { session });
    return result;
  });
}
export function adminCliRouter() {
  const router = Router();
  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.locals.operator = await authenticateAdminKey((req.get('Authorization') || '').replace(/^Bearer /, ''));
    next();
  });
  router.get('/reports/:reportId/files/:fileId', async(req,res)=>{
    const report=requireValue(await rows('reports').findOne({_id:String(req.params.reportId)})),evidence=report.evidence as {kind?:string;fileIds?:string[]}|undefined;
    if(evidence?.kind!=='post'||!evidence.fileIds?.includes(String(req.params.fileId)))throw new AppError(404,'evidence_file','This file was not submitted with the report.');
    requireValue(await uploads().findOne({_id:String(req.params.fileId),userId:String(report.personId),ready:true,deletedAt:{$exists:false}}));
    const {file,bytes}=await readUpload({userId:String(report.personId),source:'external',scope:'read'},String(req.params.fileId));res.type(file.mime).attachment(file.name).send(bytes);
  });
  router.get('/catalog', (_req, res) => { res.json({ operations: adminCatalog() }); });
  router.post('/operations/:name', async (req, res) => { res.json({ data: await executeAdminOperation(res.locals.operator, String(req.params.name), req.body, req.get('Idempotency-Key'), req.get('X-NewDrugs-Confirmed') === 'true') }); });
  return router;
}
