import { ObjectId, type ClientSession, type Document } from 'mongodb';
import { operations } from '../shared/catalog';
import { rows, transaction, type Row } from './db';
import { currentUser, profile, users, hash, type Actor, type User } from './auth';
import { AppError, requireValue } from './errors';
import { wallet } from './wallet';
import type { Message } from '../shared/types';
import { searchPlaces, resolveArea, geoPage } from './locations';
import { coarsePoint, METERS_PER_MILE, sharedAreaDistance, type CoarseArea } from '../shared/geo';
import {prepareUpload,ownUpload,uploadRef,uploads,retainUploads,discardUpload,deleteUpload,expireUploads} from './uploads';
import { MAX_ACCOUNT_UPLOAD_BYTES } from '../shared/uploads';
import type {UploadPurpose} from '../shared/uploads';
import { notificationState, notifyConnection } from './notifications';
import { postCards } from './postProjection';

import { enqueueSearch } from './search/queue';
import { searchPublic, similarPublic, refinePublic, explainPublic, searchStatus, type SearchInput } from './search/retrieve';

const nextId = () => new ObjectId().toHexString();
const pairId = (a: string, b: string) => [a, b].sort().join(':');
const publicRow = (r: Row) => { const { _id, ...rest } = r; return { id: _id, ...rest }; };
async function blockedIds(userId: string, session?: ClientSession) {
  const blocks = await rows('blocks').find({ members: userId }, { session }).limit(1001).toArray();
  if (blocks.length > 1000) throw new AppError(422, 'block_limit', 'Please contact support about your block list.');
  return blocks.flatMap(b => (b.members as string[]).filter(id => id !== userId));
}
async function notBlocked(a: string, b: string, session?: ClientSession) {
  if (await rows('blocks').findOne({ pairId: pairId(a, b) }, { session })) throw new AppError(404, 'unavailable', 'This person is unavailable.');
}
function registered(user: User) {
  if (!user.handle) throw new AppError(403, 'account_required', 'Save your account before connecting with people.');
}
async function connectionFor(userId: string, id: string, session?: ClientSession) {
  const c = requireValue(await rows('connections').findOne({ _id: id, members: userId, status: 'accepted' }, { session }), 'An accepted invitation is required.');
  const other = (c.members as string[]).find(m => m !== userId)!;
  await notBlocked(userId, other, session);
  return c;
}
export async function conversation(userId: string, limit = 60, before?: string, session?: ClientSession): Promise<Message[]> {
  const cursor = before ? requireValue(await rows('messages').findOne({ _id: before, userId }), 'That conversation cursor is unavailable.') : null;
  const messages = await rows('messages').find({ userId, ...(cursor ? { $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor._id } }] } : {}) }, { session }).sort({ createdAt: -1, _id: -1 }).limit(limit).toArray();
  return messages.reverse().map(m => ({ id: m._id, role: m.role as Message['role'], text: String(m.text),
    source: m.source as Message['source'], createdAt: String(m.createdAt), status: m.status as Message['status'], ...(Array.isArray(m.files)?{files:m.files as Message['files']}:{}) }));
}
async function run(name: string, d: Record<string, unknown>, actor: Actor, session?: ClientSession): Promise<unknown> {
  const userId = actor.userId;
  const options = { session };
  const user = requireValue(await users().findOne({ _id: userId }, options));
  if (/^(people\.|posts\.|connections\.|messages\.|notifications\.|storage\.|search\.)/.test(name)) registered(user);
  const now = new Date().toISOString();
  const limit = Number(d.limit || 20);
  const pageFilter = d.before ? { _id: { $lt: String(d.before) } } : {};
  const paginate = <T extends { _id: string }>(items: T[]) => ({ items: items.slice(0, limit).map(publicRow), nextCursor: items.length > limit ? items[limit - 1]._id : null });
  switch (name) {
    case 'files.prepare':return prepareUpload(d as {name:string;bytes:number;sha256:string;purpose:UploadPurpose},actor,session);
    case 'files.get':return uploadRef(await ownUpload(userId,String(d.fileId),session));
    case 'files.discard':return discardUpload(actor,String(d.fileId),session);
    case 'files.delete':return deleteUpload(actor,String(d.fileId),session);
    case 'files.list':return {items:(await uploads().find({userId,deletedAt:{$exists:false}}).sort({createdAt:-1}).limit(30).toArray()).map(uploadRef)};
    case 'storage.list': {
      const files=await uploads().find({userId,deletedAt:{$exists:false},...pageFilter},options).sort({_id:-1}).limit(limit+1).toArray();
      return {usedBytes:Math.max(0,user.storageBytes||0),limitBytes:MAX_ACCOUNT_UPLOAD_BYTES,items:files.slice(0,limit).map(file=>({...uploadRef(file),createdAt:file.createdAt,attached:Boolean(file.retained),inProfile:Boolean(user.photos?.includes(file._id))})),nextCursor:files.length>limit?files[limit-1]._id:null};
    }
    case 'identity.get': return profile(user);
    case 'agent.actions.list': {
      const cursor = d.before ? requireValue(await rows('receipts').findOne({ _id: String(d.before), userId }, options)) : null;
      const receipts = await rows('receipts').find({ userId, ...(cursor ? { $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor._id } }] } : {}) }, options).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).toArray();
      return { items: receipts.slice(0, limit).map(receipt => ({ id: receipt._id, operation: receipt.operation, source: receipt.source, result: receipt.result, createdAt: receipt.createdAt })), nextCursor: receipts.length > limit ? receipts[limit - 1]._id : null };
    }
    case 'locations.search': return searchPlaces(String(d.query));
    case 'locations.resolve': return resolveArea(String(d.cell));
    case 'app.open': {
      if(d.view==='post_list'){if(!Array.isArray(d.postIds)||!d.postIds.length)throw new AppError(422,'posts_required','Choose posts for this list.');const selected=await run('posts.list',{scope:'selected',postIds:d.postIds},actor,session) as {items:{id:string}[]};d.postIds=selected.items.map(post=>post.id);if(!(d.postIds as string[]).length)throw new AppError(404,'unavailable','These posts are no longer available.');}
      if (['person','post'].includes(String(d.view)) && !d.resourceId) throw new AppError(422,'resource_required','Choose the specific person or post.');
      if (d.view==='person') await run('people.get',{personId:d.resourceId},actor,session);
      if (d.view==='post') await run('posts.get',{postId:d.resourceId},actor,session);
      if (d.view==='messages' && d.resourceId) {
        const connection = requireValue(await rows('connections').findOne({ _id: String(d.resourceId), members: userId }, options));
        await notBlocked(userId, (connection.members as string[]).find(id => id !== userId)!, session);
      }
      return { open:d.view, resourceId:d.resourceId, postIds:d.postIds, areaCell:d.areaCell, radiusMiles:d.radiusMiles, query:d.query,scope:d.scope,waitForCompletion:d.waitForCompletion };
    }
    case 'profile.update': {
      if (actor.source !== 'browser') throw new AppError(403, 'human_authored', 'Profiles are written by the person, not by their agent. Open the profile editor instead.');
      if (d.discoverable) registered(user);
      if(d.photos){
        await retainUploads(userId,d.photos as string[],'profile_photo',session);
        const removed=(user.photos||[]).filter(id=>!(d.photos as string[]).includes(id));
        for(const fileId of removed)if(await uploads().findOne({_id:fileId,userId,deletedAt:{$exists:false}},options))await deleteUpload(actor,fileId,session);
      }
      const {locationCell,...fields}=d;
      let area: CoarseArea|null|undefined;
      if (locationCell===null) area=null;
      else if (typeof locationCell==='string') { const record=requireValue(await rows('locationAreas').findOne({_id:locationCell},options)); area={cell:locationCell,label:String(record.label),point:coarsePoint(locationCell)}; }
      const values = { ...fields, ...(area!==undefined ? {area,city:area?.label||''} : {}),
        ...(d.interests ? { interests: [...new Set((d.interests as string[]).map(s => s.toLowerCase()))] } : {}) };
      const saved = requireValue(await users().findOneAndUpdate({ _id: userId }, { $set: values }, { ...options, returnDocument: 'after' }));
      await enqueueSearch('profiles', userId, session!);
      return profile(saved);
    }
    case 'people.get': {
      await notBlocked(userId, String(d.personId), session);
      return profile(requireValue(await users().findOne({ _id: String(d.personId), ...(d.personId === userId ? {} : { discoverable: true }) }, options)));
    }
    case 'search.datasets': return searchStatus();
    case 'search.query': return searchPublic(d as unknown as SearchInput, actor);
    case 'posts.search': return searchPublic({ ...d, datasets: d.datasets || ['posts','replies'] } as unknown as SearchInput, actor);
    case 'search.similar': return similarPublic(String(d.sourceId), d as unknown as SearchInput, actor);
    case 'search.refine': return refinePublic(String(d.retrievalId), d.positive as string[], d.negative as string[], actor);
    case 'search.explain': return explainPublic(String(d.retrievalId), String(d.matchId), actor);
    case 'people.search': {
      if (d.query && d.scope !== 'all' && !d.near && !user.area?.cell) throw new AppError(422,'location_required','Choose an approximate area to find nearby people.');
      if (d.query) { const result = await searchPublic({ ...d, near: d.scope === 'all' ? undefined : d.near || user.area?.cell, query: d.query, mode: d.mode || 'hybrid', datasets: ['profiles'], cursor: d.before } as unknown as SearchInput, actor); return { items: result.matches.map(match => match.record), ...result }; }
      const blocked = await blockedIds(userId, session);
      if (d.scope === 'all') { const people = await users().find({discoverable:true,handle:{$type:'string'},_id:{$ne:userId,$nin:blocked,...(d.before?{$lt:String(d.before)}:{})},...(d.interest?{interests:String(d.interest).toLowerCase()}:{})},options).sort({_id:-1}).limit(limit+1).toArray(); return {items:people.slice(0,limit).map(profile),nextCursor:people.length>limit?people[limit-1]._id:null}; }
      const cell=String(d.near||user.area?.cell||'');
      if(!cell)throw new AppError(422,'location_required','Choose an approximate area to find nearby people.');
      const radiusMiles=Number(d.radiusMiles||25);
      const paging=geoPage({cell,radiusMiles,interest:d.interest as string|undefined,before:d.before as string|undefined},userId);
      const people=await users().aggregate<User & {distanceMeters:number}>([
        {$geoNear:{near:coarsePoint(cell),key:'area.point',distanceField:'distanceMeters',spherical:true,maxDistance:radiusMiles*METERS_PER_MILE,
          query:{discoverable:true,_id:{$ne:userId,$nin:blocked},...(d.interest?{interests:String(d.interest).toLowerCase()}:{})}}},
        {$sort:{distanceMeters:1,_id:1}},...paging.stages,{$limit:limit+1},
      ],options).toArray();
      return {items:people.slice(0,limit).map(p=>({...profile(p),...sharedAreaDistance(cell,p.area!.cell,p.distanceMeters)})),nextCursor:people.length>limit?paging.cursor(people[limit-1]):null};
    }
    case 'posts.list': {
      const blocked = await blockedIds(userId, session);
      if(d.scope==='selected'){if(!Array.isArray(d.postIds)||!d.postIds.length)throw new AppError(422,'posts_required','Choose posts for this list.');if(d.before)throw new AppError(422,'selected_cursor','A selected list does not use chronological paging.');const ids=[...new Set(d.postIds as string[])];const records=await rows('posts').find({_id:{$in:ids},userId:{$nin:blocked},deletedAt:{$exists:false}},options).toArray();return {items:await postCards(ids.flatMap(id=>records.find(record=>record._id===id)||[]),userId,blocked,session),nextCursor:null};}
      const filter={userId:d.scope==='public'?{$nin:blocked}:userId,deletedAt:{$exists:false},...(d.scope==='public'?{parentId:{$exists:false}}:{})};
      const cell=d.near?String(d.near):null;
      const paging=cell?geoPage({cell,radiusMiles:Number(d.radiusMiles||25),before:d.before as string|undefined},userId):null;
      const start:Document[]=cell?[{$geoNear:{near:coarsePoint(cell),key:'area.point',distanceField:'distanceMeters',spherical:true,maxDistance:Number(d.radiusMiles||25)*METERS_PER_MILE,query:filter}},{$sort:{distanceMeters:1,_id:1}},...paging!.stages]:[{$match:{...filter,...pageFilter}},{$sort:{_id:-1}}];
      const posts = await rows('posts').aggregate<Row & {distanceMeters:number}>([
        ...start,
        { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'author' } },
        { $unwind: '$author' },
        { $limit: limit + 1 },
        { $project: { _id: 1, text: 1, city: 1, area:1,distanceMeters:1,userId: 1, createdAt: 1, parentId:1,rootId:1 } },
      ], options).toArray();
      const projected=await postCards(posts.slice(0,limit),userId,blocked,session);
      return {items:projected.map((post,index)=>({...post,...(cell?sharedAreaDistance(cell,(posts[index].area as CoarseArea).cell,posts[index].distanceMeters):{})})),nextCursor:posts.length>limit?(paging?paging.cursor(posts[limit-1]):posts[limit-1]._id):null};
    }
    case 'posts.get': {
      const post = requireValue(await rows('posts').findOne({ _id: String(d.postId) }, options));
      await notBlocked(userId, String(post.userId), session);
      return (await postCards([post],userId,await blockedIds(userId,session),session))[0];
    }
    case 'posts.replies': {
      const parent=requireValue(await rows('posts').findOne({_id:String(d.postId)},options));await notBlocked(userId,String(parent.userId),session);
      const blocked=await blockedIds(userId,session);
      const replies=await rows('posts').find({parentId:d.postId,deletedAt:{$exists:false},userId:{$nin:blocked},...pageFilter},options).sort({_id:-1}).limit(limit+1).toArray();
      return {items:await postCards(replies.slice(0,limit),userId,blocked,session),nextCursor:replies.length>limit?replies[limit-1]._id:null};
    }
    case 'posts.like': {
      registered(user);const post=requireValue(await rows('posts').findOne({_id:String(d.postId),deletedAt:{$exists:false}},options));await notBlocked(userId,String(post.userId),session);
      await rows<{_id:string;interactionRevision:number}>('posts').updateOne({_id:post._id},{$inc:{interactionRevision:1}},options);
      const id=hash(`${userId}:${post._id}`),noticeId=hash(`post_like:${userId}:${post._id}`);
      if(d.liked){await rows('postLikes').updateOne({_id:id},{$setOnInsert:{userId,postId:post._id,createdAt:now}},{...options,upsert:true});
        if(post.userId!==userId)await rows('notifications').updateOne({_id:noticeId},{$setOnInsert:{userId:post.userId,actorId:userId,kind:'post_like',postId:post._id,text:String(post.text).slice(0,180),readAt:null,createdAt:now}},{...options,upsert:true});
      }else{await rows('postLikes').deleteOne({_id:id},options);await rows('notifications').deleteOne({_id:noticeId},options);}
      return (await postCards([post],userId,await blockedIds(userId,session),session))[0];
    }
    case 'posts.reply': {
      registered(user);const parent=requireValue(await rows('posts').findOne({_id:String(d.postId),deletedAt:{$exists:false}},options));await notBlocked(userId,String(parent.userId),session);
      await rows<{_id:string;interactionRevision:number}>('posts').updateOne({_id:parent._id},{$inc:{interactionRevision:1}},options);
      const reply={_id:nextId(),userId,text:d.text,parentId:parent._id,rootId:parent.rootId||parent._id,city:'',area:null,createdAt:now};await rows('posts').insertOne(reply,options);await enqueueSearch('posts',reply._id,session!);
      if(parent.userId!==userId)await rows('notifications').insertOne({_id:hash(`post_reply:${reply._id}`),userId:parent.userId,actorId:userId,kind:'post_reply',postId:reply._id,text:String(d.text).slice(0,180),readAt:null,createdAt:now},options);
      return (await postCards([reply],userId,await blockedIds(userId,session),session))[0];
    }
    case 'posts.create': {
      registered(user);
      let area:CoarseArea|null=null;
      if(d.areaCell){const record=requireValue(await rows('locationAreas').findOne({_id:String(d.areaCell)},options));area={cell:String(d.areaCell),label:String(record.label),point:coarsePoint(String(d.areaCell))};}
      const post = { _id: nextId(), userId, text: d.text, area, city:area?.label||'', createdAt: now };
      await rows('posts').insertOne(post, options);
      await enqueueSearch('posts',post._id,session!);
      return (await postCards([post],userId,[],session))[0];
    }
    case 'posts.delete': {
      const result = await rows('posts').updateOne({ _id: String(d.postId), userId, deletedAt:{$exists:false} },{$set:{text:'',city:'',area:null,deletedAt:now}}, options);
      if (!result.modifiedCount) throw new AppError(404, 'not_found', 'That post is not yours or no longer exists.');
      await rows('postLikes').deleteMany({postId:d.postId},options);await rows('notifications').deleteMany({postId:d.postId},options);
      await enqueueSearch('posts',String(d.postId),session!);
      return { deleted: true, id: d.postId };
    }
    case 'connections.list': {
      const blocked = await blockedIds(userId, session);
      const cursor = d.before ? requireValue(await rows('connections').findOne({ _id: String(d.before), members: userId }, options)) : null;
      const updatedAt = cursor?.updatedAt || cursor?.createdAt;
      const visible = await rows('connections').aggregate<Row>([
        { $match: { $and: [{ members: userId }, { members: { $nin: blocked } }] } },
        { $addFields: { updatedAt: { $ifNull: ['$updatedAt', '$createdAt'] } } },
        ...(cursor ? [{ $match: { $or: [{ updatedAt: { $lt: updatedAt } }, { updatedAt, _id: { $lt: cursor._id } }] } }] : []),
        { $sort: { updatedAt: -1, _id: -1 } }, { $limit: limit + 1 },
      ], options).toArray();
      const unread = await rows('notifications').find({ userId, connectionId: { $in: visible.map(row => row._id) }, kind: 'message', readAt: null }, options).toArray();
      for (const row of visible) row.unread = unread.some(notification => notification.connectionId === row._id);
      const ids = visible.flatMap(c => c.members as string[]);
      const people = await users().find({ _id: { $in: ids } }, options).limit(62).toArray();
      return { ...paginate(visible), people: people.map(profile) };
    }
    case 'connections.status': {
      await notBlocked(userId, String(d.personId), session);
      const connection = await rows('connections').findOne({ _id: pairId(userId, String(d.personId)), members: userId }, options);
      return { connection: connection ? publicRow(connection) : null };
    }
    case 'connections.get': {
      const connection = requireValue(await rows('connections').findOne({ _id: String(d.connectionId), members: userId }, options));
      await notBlocked(userId, (connection.members as string[]).find(id => id !== userId)!, session);
      const people = await users().find({ _id: { $in: connection.members as string[] } }, options).toArray();
      return { connection: publicRow(connection), people: people.map(profile) };
    }
    case 'connections.request': {
      registered(user);
      const other = String(d.personId);
      if (other === userId) throw new AppError(422, 'self', 'Choose someone other than yourself.');
      requireValue(await users().findOne({ _id: other, discoverable: true }, options), 'This person is unavailable.');
      await notBlocked(userId, other, session);
      const id = pairId(userId, other);
      const existing = await rows('connections').findOne({ _id: id }, options);
      if (existing && existing.status !== 'withdrawn') return publicRow(existing);
      const connection = { _id: id, members: [userId, other], fromId: userId, toId: other, note: d.note, status: 'pending', createdAt: now, updatedAt: now };
      await rows('connections').replaceOne({ _id: id }, connection, { ...options, upsert: true });
      return publicRow(connection);
    }
    case 'connections.respond': {
      const c = requireValue(await rows('connections').findOne({ _id: String(d.connectionId), toId: userId, status: 'pending' }, options), 'That invitation is no longer pending.');
      await notBlocked(userId, String(c.fromId), session);
      const result = requireValue(await rows('connections').findOneAndUpdate({ _id: c._id }, { $set: { status: d.accept ? 'accepted' : 'declined', respondedAt: now, updatedAt: now } }, { ...options, returnDocument: 'after' }));
      if (d.accept) await notifyConnection(String(c.fromId), userId, c._id, 'connection_accepted', '', undefined, session);
      return publicRow(result);
    }
    case 'connections.withdraw': {
      const result = requireValue(await rows('connections').findOneAndUpdate({ _id: String(d.connectionId), fromId: userId, status: 'pending' }, { $set: { status: 'withdrawn', updatedAt: now } }, { ...options, returnDocument: 'after' }), 'That invitation is no longer pending.');
      return publicRow(result);
    }
    case 'messages.list': {
      await connectionFor(userId, String(d.connectionId), session);
      return paginate(await rows('directMessages').find({ connectionId: d.connectionId, ...pageFilter }, options).sort({ _id: -1 }).limit(limit + 1).toArray());
    }
    case 'messages.send': {
      const connection = await connectionFor(userId, String(d.connectionId), session);
      const message = { _id: nextId(), connectionId: d.connectionId, fromId: userId, text: d.text, createdAt: now, ...(d.clientId?{clientId:d.clientId}:{}) };
      await rows('directMessages').insertOne(message, options);
      await rows('connections').updateOne({ _id: connection._id }, { $set: { updatedAt: now, lastMessage: { text: message.text, fromId: userId, createdAt: now } } }, options);
      await notifyConnection((connection.members as string[]).find(id => id !== userId)!, userId, connection._id, 'message', String(d.text), message._id, session);
      return publicRow(message);
    }
    case 'messages.mark_read': {
      await connectionFor(userId, String(d.connectionId), session);
      if (d.throughMessageId) requireValue(await rows('directMessages').findOne({ _id: String(d.throughMessageId), connectionId: d.connectionId }, options));
      await rows('notifications').updateMany({ userId, connectionId: d.connectionId, $or: [{ kind: 'connection_accepted' }, ...(d.throughMessageId ? [{ kind: 'message', messageId: { $lte: String(d.throughMessageId) } }] : [])] }, { $set: { readAt: now } }, options);
      return { read: true, throughMessageId: d.throughMessageId };
    }
    case 'notifications.list': return notificationState(userId, session);
    case 'notifications.read': {
      const id = String(d.notificationId);
      if (id.startsWith('invite:')) requireValue(await rows('connections').findOne({ _id: id.slice(7), toId: userId }, options));
      else if (id.startsWith('review:')) requireValue(await rows('runs').findOne({ _id: id.slice(7), userId }, options));
      else { const changed = await rows('notifications').updateOne({ _id: id, userId }, { $set: { readAt: now } }, options); if (!changed.matchedCount) throw new AppError(404, 'not_found', 'This notification is unavailable.'); }
      return { read: true };
    }
    case 'people.block': {
      const other = String(d.personId);
      if (other === userId) throw new AppError(422, 'self', 'You cannot block yourself.');
      requireValue(await users().findOne({ _id: other }, options));
      const id = `${userId}:${other}`;
      if (d.blocked) {
        const count = await rows('blocks').countDocuments({ ownerId: userId }, { ...options, limit: 1000 });
        if (count >= 1000) throw new AppError(422, 'limit', 'Your block list is full.');
        await rows('blocks').updateOne({ _id: id }, { $setOnInsert: { ownerId: userId, members: [userId, other], pairId: pairId(userId, other), createdAt: now } }, { ...options, upsert: true });
      } else await rows('blocks').deleteOne({ _id: id, ownerId: userId }, options);
      return { personId: other, blocked: d.blocked };
    }
    case 'people.blocked': {
      const blocked = await rows('blocks').find({ ownerId: userId, ...pageFilter }, options).sort({ _id: -1 }).limit(limit + 1).toArray();
      const people = await users().find({ _id: { $in: blocked.flatMap(row => (row.members as string[]).filter(id => id !== userId)) } }, options).toArray();
      return { ...paginate(blocked), items: blocked.slice(0, limit).map(row => { const personId = (row.members as string[]).find(id => id !== userId)!; const person = people.find(person => person._id === personId); return { id: row._id, personId, name: person?.name || '', handle: person?.handle, createdAt: row.createdAt }; }) };
    }
    case 'people.report': {
      registered(user);
      requireValue(await users().findOne({ _id: String(d.personId) }, options));
      const report = { _id: nextId(), fromId: userId, personId: d.personId, reason: d.reason, createdAt: now, status: 'unreviewed' };
      await rows('reports').insertOne(report, options);
      return { id: report._id, status: 'unreviewed' };
    }
    case 'wallet.get': return wallet(userId);
    case 'conversation.list': return { items: await conversation(userId, limit, d.before as string | undefined) };
    case 'conversation.append': {
      if (actor.source !== 'external') throw new AppError(403, 'external_only', 'This operation is for your connected external agent.');
      const message = { _id: nextId(), userId, role: d.role, text: d.text, source: 'external', createdAt: now };
      await rows('messages').insertOne(message, options);
      return publicRow(message);
    }
    default: throw new AppError(404, 'unknown_operation', 'Unknown operation.');
  }
}
export interface ExecutionProof { confirmed?: boolean; runId?: string; lease?: string }
export const canonicalJSON = (value: unknown): string => JSON.stringify(value, function (_key, item) {
  return item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item;
});
export async function executeOperation(name: string, input: unknown, actor: Actor, idempotencyKey?: string, proof: ExecutionProof = {}) {
  const op = operations.find(o => o.name === name);
  if (!op) throw new AppError(404, 'unknown_operation', 'Unknown operation.');
  const parsed = op.schema.parse(input) as Record<string, unknown>;
  if (actor.source !== 'browser' && name === 'profile.update') throw new AppError(403, 'human_authored', 'Profiles are written by the person in the app.');
  if (actor.source === 'agent' && !op.agent) throw new AppError(403, 'unavailable', 'This operation is not available to the hosted agent.');
  if (op.kind === 'read') return op.outputSchema.parse(await run(name, parsed, actor));
  if (actor.scope !== 'write') throw new AppError(403, 'scope', 'This token only has read access.');
  if (!idempotencyKey || !/^[\w:.-]{8,150}$/.test(idempotencyKey)) throw new AppError(422, 'idempotency_required', 'Writes need an idempotency key of 8–150 characters. Reuse it only when retrying the same action.');
  const receiptId = hash(`${actor.userId}:${idempotencyKey}`);
  if (op.confirmationRequired && !proof.confirmed) throw new AppError(409, 'confirmation_required', op.consequence!);
  if (name==='profile.update' && typeof parsed.locationCell==='string') await resolveArea(parsed.locationCell);
  if (name==='posts.create' && typeof parsed.areaCell==='string') await resolveArea(parsed.areaCell);
  const fingerprint = hash(canonicalJSON({ name, version: op.version, parsed }));
  const committed = await transaction(async session => {
    if (actor.source === 'agent') {
      const lease = await rows('runs').updateOne({ _id: proof.runId, userId: actor.userId, lease: proof.lease, leaseUntil: { $gt: Date.now() }, status: 'running', cancelRequested: { $ne: true } }, { $set: { lastEffect: idempotencyKey } }, { session });
      if (!lease.matchedCount) throw new AppError(409, 'stale_run', 'The task no longer has authority to act.');
    }
    const prior = await rows('receipts').findOne({ _id: receiptId }, { session });
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new AppError(409, 'idempotency_conflict', 'This key was already used for a different action.');
      return prior.result;
    }
    // Contact permissions and a simultaneous block must serialize on the same
    // document; snapshot reads alone permit a send/block write-skew race.
    if (['connections.request', 'connections.respond', 'connections.withdraw', 'messages.send', 'people.block','posts.like','posts.reply'].includes(name)) {
      let other = parsed.personId as string | undefined;
      if(!other&&parsed.postId){const post=requireValue(await rows('posts').findOne({_id:String(parsed.postId)},{session}));other=String(post.userId);}
      if (!other && parsed.connectionId) {
        const connection = requireValue(await rows('connections').findOne({ _id: String(parsed.connectionId), members: actor.userId }, { session }));
        other = (connection.members as string[]).find(id => id !== actor.userId);
      }
      if (other) await rows<{ _id: string; revision: number }>('contactPairs').updateOne({ _id: pairId(actor.userId, other) }, { $inc: { revision: 1 } }, { session, upsert: true });
    }
    // Store the same JSON shape that the HTTP/MCP client receives. BSON would
    // otherwise turn nested undefined optional fields into null on a retry.
    const result = JSON.parse(JSON.stringify(op.outputSchema.parse(await run(name, parsed, actor, session))));
    await rows('receipts').insertOne({ _id: receiptId, userId: actor.userId, operation: name, source: actor.source, fingerprint, result, createdAt: new Date().toISOString() }, { session });
    return result;
  });
  if(name==='files.delete'||name==='profile.update'&&parsed.photos)await expireUploads().catch(error=>console.error('Upload deletion cleanup:',error.name));
  return committed;
}
