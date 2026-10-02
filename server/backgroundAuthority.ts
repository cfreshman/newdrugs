import type { Actor } from './auth';
import { rows } from './db';
import { automationAuthorized } from './automations';
import { AppError } from './errors';
const accountReads = new Set(['people.context','people.mutuals','activity.since','connections.list','connections.get','connections.status','messages.list','messages.get','messages.window','notifications.list','agent.actions.list']);
const publicReads = new Set(['spaces.list','spaces.get','access.get','time.resolve','time.convert','time.overlap','locations.meeting_area','posts.thread_updates','identity.get','locations.search','locations.resolve','people.get','people.search','posts.list','posts.get','posts.incoming_replies','posts.replies','posts.search','search.query','search.similar','search.refine','search.explain','search.datasets','links.preview','links.text','app.open']);
export function backgroundCanRead(actor: Actor, name: string) { return !actor.background || Boolean(actor.logAccess&&['log.calendar','log.search','log.related','log.birthday_get','log.birthdays','log.contacts','log.list','log.get','log.people','log.neighbors','log.preferences','log.export'].includes(name)) || (publicReads.has(name) && (!['links.preview','links.text'].includes(name) || actor.webSearch === true)) || Boolean(actor.accountActivity && accountReads.has(name)) || Boolean(actor.privateChat && ['conversation.search','conversation.window','conversation.list','agent.memory.context','agent.memory.list','agent.memory.get'].includes(name)); }
export function operationAvailable(actor:Actor,operation:{name:string;kind:'read'|'write';agent:boolean}) {
  return backgroundCanRead(actor,operation.name) && (actor.source==='browser'||operation.name!=='profile.update') && (actor.source!=='agent'||operation.agent) && (actor.scope==='write'||operation.kind==='read');
}
export async function assertBackgroundAuthority(actor: Actor) {
  if (!actor.background) return;
  const run = actor.runId && await rows<import('./runTypes').RunRecord>('runs').findOneAndUpdate({ _id: actor.runId, userId: actor.userId, purpose: 'automation', status: 'running', cancelRequested: { $ne: true }, leaseUntil: { $gt: Date.now() } }, { $inc: { backgroundReadCount: 1 } }, { returnDocument: 'after' });
  if (run && (run.backgroundReadCount || 0) > 100) { await rows('runs').updateOne({ _id: run._id }, { $set: { cancelRequested: true, error: 'This automation reached its read limit.' } }); throw new AppError(429, 'automation_limit', 'This automation reached its read limit.'); }
  if (!run || !await automationAuthorized(run)) throw new AppError(403, 'automation_revoked', 'This automation no longer has authority.');
}
