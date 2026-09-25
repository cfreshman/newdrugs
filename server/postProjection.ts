import type { ClientSession } from 'mongodb';
import { rows, type Row } from './db';
import { users } from './auth';

/** Bounded enrichment of authorized posts; no list of other people's liker IDs. */
export async function postCards(records: Row[], userId: string, blocked: string[], session?: ClientSession) {
  if (!records.length) return [];
  const ids = records.map(post => post._id), options = { session };
  const parents = await rows('posts').find({_id:{$in:[...new Set(records.flatMap(post=>post.parentId?[String(post.parentId)]:[]))]},userId:{$nin:blocked}},options).toArray();
  const authors = await users().find({ _id: { $in: [...new Set([...records,...parents].map(post => String(post.userId)))] } }, options).toArray();
  const likes = await rows('postLikes').aggregate<{ _id: string; count: number; liked: number }>([
    { $match: { postId: { $in: ids }, userId: { $nin: blocked } } },
    { $group: { _id: '$postId', count: { $sum: 1 }, liked: { $max: { $cond: [{ $eq: ['$userId', userId] }, 1, 0] } } } },
  ], options).toArray();
  const replies = await rows('posts').aggregate<{ _id: string; count: number }>([
    { $match: { parentId: { $in: ids }, userId: { $nin: blocked }, deletedAt: { $exists: false } } }, { $group: { _id: '$parentId', count: { $sum: 1 } } },
  ], options).toArray();
  return records.map(post => {
    const parent=parents.find(parent=>parent._id===post.parentId),parentAuthor=authors.find(author=>author._id===parent?.userId);
    const author = authors.find(user => user._id === post.userId), like = likes.find(row => row._id === post._id);
    return { id: post._id, userId: String(post.userId), text: post.deletedAt ? '' : String(post.text), city: post.deletedAt ? '' : String(post.city || ''), area: post.deletedAt ? null : post.area,
      createdAt: String(post.createdAt), parentId: post.parentId as string | undefined, rootId: post.rootId as string | undefined, deleted: Boolean(post.deletedAt),
      likeCount: post.deletedAt ? 0 : like?.count || 0, liked: !post.deletedAt && Boolean(like?.liked), replyCount: replies.find(row => row._id === post._id)?.count || 0,
      ...(parent?{parent:{id:parent._id,text:parent.deletedAt?'':String(parent.text),deleted:Boolean(parent.deletedAt),...(!parent.deletedAt&&parentAuthor?{author:{name:parentAuthor.name,handle:parentAuthor.handle}}:{})}}:{}),
      author: author && !post.deletedAt ? { name: author.name, handle: author.handle, photoId: author.photos?.[0] } : undefined };
  });
}
