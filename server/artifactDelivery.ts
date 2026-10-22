import type { ClientSession } from 'mongodb';
import type { AgentSessionItem } from 'openai/resources/beta/agents/agents';
import {
  ARTIFACT_MAX_MESSAGE_REFERENCES,
  artifactPresentationReferenceSchema,
  type ArtifactPresentationReference,
} from '../shared/artifacts';
import type { Actor, User } from './auth';
import { rows } from './db';
import { AppError } from './errors';
import type { RunRecord } from './runTypes';
import {authorizeArtifactPresentation} from './artifacts';

export interface ArtifactDeliveryProof { runId?: string; lease?: string }

/** A retry reuses its version's slot. Distinct explicitly selected versions coexist. */
export function mergeArtifactReferences(previous: ArtifactPresentationReference[] | undefined, next: ArtifactPresentationReference) {
  const reference = artifactPresentationReferenceSchema.parse(next);
  const references = (previous || []).map(value => artifactPresentationReferenceSchema.parse(value));
  const index = references.findIndex(value => value.artifactId === reference.artifactId && value.contentRevision === reference.contentRevision);
  if (index >= 0) references[index] = reference;
  else references.push(reference);
  if (references.length > ARTIFACT_MAX_MESSAGE_REFERENCES) throw new AppError(422, 'artifact_delivery_limit', `A reply can include at most ${ARTIFACT_MAX_MESSAGE_REFERENCES} artifact presentations.`);
  return references;
}

/** Only an explicit presentation in the trusted primary runtime binds output.
 * The transaction reauthorizes the capability and its selected version.
 * No caller can select a message, another run, or a past turn. */
export async function bindPrimaryArtifact(actor: Actor, proof: ArtifactDeliveryProof, reference: ArtifactPresentationReference, session: ClientSession) {
  if (actor.source !== 'agent' || actor.background) return false;
  const runId = proof.runId || actor.runId;
  if (!runId || actor.runId && actor.runId !== runId) throw new AppError(409, 'stale_run', 'The task no longer has authority to present output.');
  const run = await rows<RunRecord>('runs').findOne({
    _id: runId, userId: actor.userId, purpose: { $ne: 'automation' }, status: 'running',
    cancelRequested: { $ne: true }, superseded: { $ne: true }, leaseUntil: { $gt: Date.now() },
    ...(proof.lease ? { lease: proof.lease } : {}),
  }, { session });
  if (!run?.lease) throw new AppError(409, 'stale_run', 'The task no longer has authority to present output.');
  await authorizeArtifactPresentation(reference.artifactId,reference.contentRevision??'legacy',session);
  const owner = await rows<User>('users').findOneAndUpdate({
    _id: actor.userId, activeRun: runId, suspendedAt: null,
    $expr: { $eq: [{ $ifNull: ['$chatGeneration', 0] }, Number(run.chatGeneration || 0)] },
  }, { $inc: { authorityRevision: 1 } }, { session, returnDocument: 'after', projection: { _id: 1 } });
  if (!owner) throw new AppError(409, 'stale_run', 'The conversation has changed. This output was not attached.');
  const artifacts = mergeArtifactReferences(run.artifacts, reference);
  const held = await rows<RunRecord>('runs').updateOne({
    _id: runId, userId: actor.userId, lease: run.lease, leaseUntil: { $gt: Date.now() },
    status: 'running', cancelRequested: { $ne: true }, superseded: { $ne: true },
  }, { $set: { artifacts, updatedAt: new Date().toISOString() }, $inc: { revision: 1 } }, { session });
  if (!held.matchedCount) throw new AppError(409, 'stale_run', 'The task no longer has authority to present output.');
  return true;
}

export function artifactHistoryText(references: ArtifactPresentationReference[] | undefined) {
  if (!references?.length) return '';
  return `\nSaved artifact outputs (identifiers only; contentRevision pins the displayed version. Read that version with artifacts.view using its contentRevision, or contentRevision:"legacy" when the reference has none. Read current editable content with artifacts.get without a contentRevision): ${JSON.stringify(references)}`;
}

/** Structured output still needs the provider's explicit final-item boundary. */
export function completedArtifactFinal(references: ArtifactPresentationReference[] | undefined, items: Iterable<AgentSessionItem>) {
  if (!references?.length) return false;
  let complete = false;
  for (const item of items) if (item.type === 'message' && item.role === 'assistant') complete = item.phase === 'final_answer' && item.status === 'completed';
  return complete;
}
