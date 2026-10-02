import type { ClientSession } from 'mongodb';
import { rows } from '../db';
import { users } from '../auth';
import { hashText, termCounts } from './ranking';
import { INDEX_VERSION, type SearchDocument } from './model';
import type { CoarseArea } from '../../shared/geo';

/** Public human text only. Never call this with chats, DMs, or uploads. */
export async function sourceDocument(kind: 'profiles' | 'posts' | 'spaces', entityId: string, session?: ClientSession): Promise<SearchDocument | null> {
  const options = { session };
  if (kind === 'profiles') {
    const user = await users().findOne({ _id: entityId, discoverable: true, suspendedAt:null, handle: { $type: 'string' } }, options);
    if (!user) return null;
    const evidence = [{ field: 'name', text: user.name || '', entityId, entityType: 'person' as const }, { field: 'bio', text: user.bio, entityId, entityType: 'person' as const }, { field: 'interests', text: user.interests.join(', '), entityId, entityType: 'person' as const }].filter(field => field.text);
    const text = `@${user.handle}\n${evidence.map(field => `${field.field}: ${field.text}`).join('\n')}`;
    const sourceHash = hashText(`${INDEX_VERSION}:${text}`), sourceRevision = hashText(JSON.stringify([sourceHash, user.area || null, user.discoverable]));
    return { _id: `profiles:${entityId}`, dataset: 'profiles', entityId, ownerId: entityId, text, evidence, terms: termCounts(text), area: user.area || null, createdAt: user.createdAt, sourceHash, sourceRevision, indexVersion: INDEX_VERSION, indexedAt: '' };
  }
  if(kind==='spaces'){
    const space=await rows('spaces').findOne({_id:entityId,status:'live'},options);
    if(!space||!await users().findOne({_id:String(space.hostId),suspendedAt:null,handle:{$type:'string'}},options))return null;
    const title=String(space.title||'').trim(),description=String(space.description||'').trim();
    const evidence=[{field:'title',text:title,entityId,entityType:'space' as const},...(description?[{field:'description',text:description,entityId,entityType:'space' as const}]:[])].filter(item=>item.text);
    const text=evidence.map(item=>`${item.field}: ${item.text}`).join('\n');
    const sourceHash=hashText(`${INDEX_VERSION}:${text}`);
    return {_id:`spaces:${entityId}`,dataset:'spaces',entityId,ownerId:String(space.hostId),text,evidence,terms:termCounts(text),area:null,createdAt:String(space.createdAt),sourceHash,sourceRevision:hashText(JSON.stringify([sourceHash,space.status,space.hostId])),indexVersion:INDEX_VERSION,indexedAt:''};
  }
  const post = await rows('posts').findOne({ _id: entityId, deletedAt: { $exists: false }, moderatedAt: { $exists: false } }, options);
  if (!post || !await users().findOne({ _id: String(post.userId), suspendedAt:null, handle: { $type: 'string' } }, options)) return null;
  const text = [String(post.text),...(Array.isArray(post.links)?post.links.map(String):[])].filter(Boolean).join('\n'), sourceHash = hashText(`${INDEX_VERSION}:${text}`);
  if(!text.trim())return null;
  return { _id: `posts:${entityId}`, dataset: post.parentId ? 'replies' : 'posts', entityId, ownerId: String(post.userId), text,
    evidence: [{ field: 'text', text, entityId, entityType: 'post' }], terms: termCounts(text), area: post.area as CoarseArea || null,
    createdAt: String(post.createdAt), sourceHash, sourceRevision: hashText(JSON.stringify([sourceHash, post.area || null, post.parentId || null])),
    indexVersion: INDEX_VERSION, indexedAt: '', ...(post.rootId ? { rootId: String(post.rootId) } : {}) };
}
