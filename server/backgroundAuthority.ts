import type { Actor } from './auth';
import { rows } from './db';
import { automationAuthorized } from './automations';
import { AppError } from './errors';
const publicReads = new Set(['spaces.list','spaces.get','access.get','time.resolve','time.convert','time.overlap','locations.search','locations.resolve','people.get','people.search','posts.list','posts.get','posts.ancestors','posts.replies','posts.search','search.query','search.global','search.datasets','links.preview','links.text','app.open']);
const publicWrites = new Set(['posts.create','posts.reply','posts.like','posts.vote','posts.pin','posts.delete','spaces.create','spaces.end','spaces.edit','spaces.offer_host','spaces.cancel_host_offer','spaces.accept_host','spaces.decline_host','spaces.request_speak','spaces.cancel_request','spaces.invite_speaker','spaces.cancel_speaker_invite','spaces.respond_speaker_invite','spaces.pin_post','spaces.pin_link','spaces.unpin','spaces.respond_speaker','spaces.revoke_speaker','spaces.remove_person']);
export function backgroundCanRead(actor: Actor, name: string) { return !actor.background || actor.privateAccess!==false || publicReads.has(name); }
export function operationAvailable(actor:Actor,operation:{name:string;kind:'read'|'write';agent:boolean}) {
  return (operation.kind==='read'?backgroundCanRead(actor,operation.name):!actor.background||actor.privateAccess!==false||publicWrites.has(operation.name)) && (actor.source==='browser'||operation.name!=='profile.update') && (actor.source!=='agent'||operation.agent) && (actor.scope==='write'||operation.kind==='read');
}
export async function assertBackgroundAuthority(actor: Actor) {
  if (!actor.background) return;
  const run = actor.runId && await rows<import('./runTypes').RunRecord>('runs').findOneAndUpdate({ _id: actor.runId, userId: actor.userId, purpose: 'automation', status: 'running', cancelRequested: { $ne: true }, leaseUntil: { $gt: Date.now() } }, { $inc: { backgroundReadCount: 1 } }, { returnDocument: 'after' });
  if (run && (run.backgroundReadCount || 0) > 100) { await rows('runs').updateOne({ _id: run._id }, { $set: { cancelRequested: true, error: 'This automation reached its read limit.' } }); throw new AppError(429, 'automation_limit', 'This automation reached its read limit.'); }
  if (!run || !await automationAuthorized(run)) throw new AppError(403, 'automation_revoked', 'This automation no longer has authority.');
}
