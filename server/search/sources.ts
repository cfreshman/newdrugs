import type { ClientSession } from 'mongodb';
import { rows } from '../db';
import { users } from '../auth';
import { hashText, termCounts } from './ranking';
import { INDEX_VERSION, type SearchDocument } from './model';
import type { CoarseArea } from '../../shared/geo';

/** Public human text only. Never call this with chats, DMs, or uploads. */
export async function sourceDocument(kind: 'profiles' | 'posts', entityId: string, session?: ClientSession): Promise<SearchDocument | null> {
  const options = { session };
  if (kind === 'profiles') {
    const user = await users().findOne({ _id: entityId, discoverable: true, handle: { $type: 'string' } }, options);
    if (!user) return null;
    const evidence = [{ field: 'name', text: user.name || '', entityId, entityType: 'person' as const }, { field: 'bio', text: user.bio, entityId, entityType: 'person' as const }, { field: 'interests', text: user.interests.join(', '), entityId, entityType: 'person' as const }].filter(field => field.text);
    const text = `@${user.handle}\n${evidence.map(field => `${field.field}: ${field.text}`).join('\n')}`;
    const sourceHash = hashText(`${INDEX_VERSION}:${text}`), sourceRevision = hashText(JSON.stringify([sourceHash, user.area || null, user.discoverable]));
    return { _id: `profiles:${entityId}`, dataset: 'profiles', entityId, ownerId: entityId, text, evidence, terms: termCounts(text), area: user.area || null, createdAt: user.createdAt, sourceHash, sourceRevision, indexVersion: INDEX_VERSION, indexedAt: '' };
  }
  const post = await rows('posts').findOne({ _id: entityId, deletedAt: { $exists: false } }, options);
  if (!post || !await users().findOne({ _id: String(post.userId), handle: { $type: 'string' } }, options)) return null;
  const text = String(post.text), sourceHash = hashText(`${INDEX_VERSION}:${text}`);
  return { _id: `posts:${entityId}`, dataset: post.parentId ? 'replies' : 'posts', entityId, ownerId: String(post.userId), text,
    evidence: [{ field: 'text', text, entityId, entityType: 'post' }], terms: termCounts(text), area: post.area as CoarseArea || null,
    createdAt: String(post.createdAt), sourceHash, sourceRevision: hashText(JSON.stringify([sourceHash, post.area || null, post.parentId || null])),
    indexVersion: INDEX_VERSION, indexedAt: '', ...(post.rootId ? { rootId: String(post.rootId) } : {}) };
}
