import type { ClientSession } from 'mongodb';
import type { User } from './auth';
import { rows } from './db';
/** Discoverability controls stranger discovery; an invitation or accepted contact can inspect the profile. */
export async function profileVisibleTo(viewerId: string, owner: User, session?: ClientSession) {
  if (owner.suspendedAt) return viewerId === owner._id;
  if (viewerId === owner._id || owner.discoverable) return true;
  if(await rows('dinderMatches').findOne({members:{$all:[viewerId,owner._id]},status:'matched'},{session,projection:{_id:1}}))return true;
  return Boolean(await rows('logEntries').findOne({members:{$all:[viewerId,owner._id]},deletedAt:{$exists:false}},{session,projection:{_id:1}}))||Boolean(await rows('connections').findOne({ members: { $all: [viewerId, owner._id] }, status: { $in: ['pending','accepted','declined','withdrawn','disconnected'] } }, { session }));
}
