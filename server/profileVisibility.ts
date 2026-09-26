import type { ClientSession } from 'mongodb';
import type { User } from './auth';
import { rows } from './db';
/** Discoverability controls stranger discovery; an invitation or accepted contact can inspect the profile. */
export async function profileVisibleTo(viewerId: string, owner: User, session?: ClientSession) {
  if (owner.suspendedAt) return viewerId === owner._id;
  if (viewerId === owner._id || owner.discoverable) return true;
  return Boolean(await rows('connections').findOne({ members: { $all: [viewerId, owner._id] }, $or: [{ status: { $in: ['pending','accepted'] } }, { status: 'declined', toId: viewerId }] }, { session }));
}
