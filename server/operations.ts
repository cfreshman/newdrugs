import {unsuspendedActors} from './scopedModeration';
import {invalidateLogContacts} from './logContacts';
import {randomUUID} from 'node:crypto';
import {memoryOperation} from './agentMemory';
import {walletActivity} from './walletActivity';
import {syncSourceAttachments} from './attachmentReferences';
import {listStorage,storageAttachments} from './storage';
import type {StorageType,StorageLocation} from '../shared/storage';
import {defaultPreferences} from '../shared/preferences';
import {logPersonGrams} from '../shared/logPeople';
import {logOperation,logEntryFor,hasSharedHangouts} from './log';
import {makeOperation,normalizeMakeProject,stageMakePublish} from './make';
import {endCallForConnection} from './calling';
import {removeSpaceParticipantForBlock,spaceOperation} from './spaces';
import {enqueueCircleEdge,circleSummaries,circleCandidates,circleMutualIds} from './circle';
import {hiddenPersonIds,hiddenPeoplePage,isPersonHidden,setPersonHidden} from './peopleHides';
import {stageWebsiteMediaImport,websiteOperation} from './websites';
import {activitySince} from './activityUtilities';
import {meetingAreas} from './meetingAreas';
import {resolveTime,convertTime,overlapTimes} from './timeUtilities';
import type {TimeResolveInput,TimeConvertInput,TimeOverlapInput} from '../shared/utilitySchemas';
import type {Profile} from '../shared/types';
import {normalizedPostLinks} from '../shared/postLinks';
import {postAncestors} from './postAncestors';
import { setCollection, collectionPage, postAudience } from './socialCollections';
import { profileVisibleTo } from './profileVisibility';
import {profileMediaUrl} from '../shared/profileMedia';
import {getIou,listIous,recordIou} from './ious';
import legacyOperationRevisions from '../shared/legacyOperationRevisions.json';
import { automationOperation, ownAutomation,validateAutomationConfiguration } from './automations';
import { wakeRun } from './sleep';
import { assertBackgroundAuthority,operationAvailable } from './backgroundAuthority';
import { inboxOperation, validateInboxLinks, ownInbox } from './inbox';
import { enqueueChatSearch, searchChat } from './search/chat';
import {enqueueDMSearch,searchDM} from './search/dm';
import {searchGlobal} from './search/global';
import { enqueuePush,enqueueStoredPush, pushDevices, revokePush } from './push';
import { ObjectId, type ClientSession, type Document } from 'mongodb';
import { operations } from '../shared/catalog';
import { rows, transaction, type Row } from './db';
import { currentUser, profile, users, hash, type Actor, type User } from './auth';
import { AppError, requireValue } from './errors';
import { wallet } from './wallet';
import type { Message } from '../shared/types';
import { searchPlaces, resolveArea, geoPage } from './locations';
import { coarsePoint, distanceMeters, METERS_PER_MILE, sharedAreaDistance, type CoarseArea } from '../shared/geo';
import {prepareUpload,ownUpload,ownedUploadRef,uploads,retainUploads,discardUpload,deleteUpload,expireUploads} from './uploads';
import { MAX_ACCOUNT_UPLOAD_BYTES } from '../shared/uploads';
import type {UploadPurpose} from '../shared/uploads';
import { notificationState, notifyConnection } from './notifications';
import {notificationEnabled,notificationPreferences,setNotificationPreference,listNotificationRules,createNotificationRule,setNotificationRule,deleteNotificationRule} from './notificationSettings';
import {enqueueNotificationEvent} from './notificationEvents';
import type {NotificationType} from '../shared/notificationSettings';
import { postCards } from './postProjection';
import { linkPreview,linkText } from './linkPreviews';
import {enqueuePostVideoLinks,removePostVideoLinks} from './postVideoLinks';
import { retainPostPhotos } from './uploads';

import { enqueueSearch } from './search/queue';
import { searchPublic, similarPublic, refinePublic, explainPublic, searchStatus, type SearchInput } from './search/retrieve';

const nextId = () => new ObjectId().toHexString();
const pairId = (a: string, b: string) => [a, b].sort().join(':');
const publicRow = (r: Row) => { const { _id, ...rest } = r; return { id: _id, ...rest }; };
const directMessage = (row:Row) => publicRow(row.moderatedAt?{...row,text:'Message removed by moderation.'}:row);
async function blockedIds(userId: string, session?: ClientSession) {
  const blocks = await rows('blocks').find({ members: userId }, { session }).limit(1001).toArray();
  if (blocks.length > 1000) throw new AppError(422, 'block_limit', 'Please contact support about your block list.');
  return blocks.flatMap(b => (b.members as string[]).filter(id => id !== userId));
}
async function withMutualCounts(userId:string,people:Profile[],session?:ClientSession,actor?:Actor){
 if(actor?.background&&actor.privateAccess===false)return people;
 const summaries=await circleSummaries(userId,people.map(person=>person.id),session),ids=[...new Set([...summaries.values()].flatMap(row=>row.previewIds))];
 const [friends,blocked,connections]=await Promise.all([
  users().find({_id:{$in:ids},suspendedAt:null},{session,projection:{name:1,handle:1,photos:1}}).limit(ids.length).toArray(),
  rows('blocks').find({pairId:{$in:ids.map(id=>pairId(userId,id))}},{session,projection:{pairId:1}}).limit(ids.length*2).toArray(),
  rows('connections').find({_id:{$in:people.map(person=>pairId(userId,person.id))}},{session,projection:{status:1,toId:1,disconnectedBy:1}}).limit(people.length).toArray(),
 ]);
 const byId=new Map(friends.map(friend=>[friend._id,friend])),blockedIds=new Set(blocked.map(row=>row.pairId)),byConnection=new Map(connections.map(row=>[row._id,row]));
 return people.map(person=>{
  const row=summaries.get(person.id),connection=byConnection.get(pairId(userId,person.id));
  const friendAction:Profile['friendAction']=person.id===userId?undefined:connection?.status==='accepted'?'friend':connection?.status==='pending'?connection.toId===userId?'accept':'invited':connection?.status==='declined'&&connection.toId!==userId||connection?.status==='disconnected'&&connection.disconnectedBy!==userId?'unavailable':'invite';
  const mutualFriends=row?.previewIds.filter(id=>byId.has(id)&&!blockedIds.has(pairId(userId,id))).map(id=>{const friend=byId.get(id)!;return {id,name:friend.handle?`@${friend.handle}`:String(friend.name||'Friend'),...(friend.photos?.[0]?{photoId:friend.photos[0]}:{})};});
  return {...person,...(row?.mutualCount?{mutualCount:row.mutualCount,mutualFriends}:{}),...(friendAction?{friendAction}:{}),...(connection?{connectionId:connection._id}:{})};
 });
}
async function notBlocked(a: string, b: string, session?: ClientSession) {
  if (await rows('blocks').findOne({ pairId: pairId(a, b) }, { session }) || await users().findOne({_id:b,suspendedAt:{$type:'string'}},{session,projection:{_id:1}})) throw new AppError(404, 'unavailable', 'This person is unavailable.');
}
function registered(user: User) {
  if (!user.handle) throw new AppError(403, 'account_required', 'Save your account before connecting with people.');
}
async function connectionFor(userId: string, id: string, session?: ClientSession, history = false) {
  const c = requireValue(await rows('connections').findOne({ _id: id, members: userId, ...(history ? { $or: [{ status: 'accepted' }, { initialInvitation: { $exists: true } }] } : { status: 'accepted' }) }, { session }), 'An accepted invitation is required.');
  const other = (c.members as string[]).find(m => m !== userId)!;
  await notBlocked(userId, other, session);
  return c;
}
export function chatMessage(row: Row): Message {
  return { id: row._id, role: row.role as Message['role'], text: String(row.text), source: row.source as Message['source'], createdAt: String(row.createdAt), ...(row.status ? { status: row.status as Message['status'] } : {}), ...(Array.isArray(row.records)?{records:row.records as Message['records']} : {}), ...(Array.isArray(row.inbox) ? { inbox: row.inbox as Message['inbox'] } : {}), ...(Array.isArray(row.files) ? { files: row.files as Message['files'] } : {}) };
}
export async function conversation(userId: string, limit = 30, before?: string, session?: ClientSession) {
  const cursor = before ? requireValue(await rows('messages').findOne({ _id: before, userId }, { session })) : null;
  const messages = await rows('messages').find({ userId, ...(cursor ? { $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor._id } }] } : {}) }, { session }).sort({ createdAt: -1, _id: -1 }).limit(limit).toArray();
  return messages.reverse().map(chatMessage);
}
export async function conversationPage(userId: string, limit = 30, before?: string, session?: ClientSession, after?: string) {
  if (after) {
    const cursor = requireValue(await rows('messages').findOne({ _id: after, userId }, { session }));
    const found = await rows('messages').find({ userId, $or: [{ createdAt: { $gt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $gt: cursor._id } }] }, { session }).sort({ createdAt: 1, _id: 1 }).limit(limit + 1).toArray();
    return { items: found.slice(0, limit).map(chatMessage), nextCursor: found.length > limit ? found[limit - 1]._id : null };
  }
  const found = await conversation(userId, limit + 1, before, session);
  const items = found.slice(-limit);
  return { items, nextCursor: found.length > limit ? items[0].id : null };
}
export async function conversationWindow(userId: string, messageId: string, session?: ClientSession) {
  const target = requireValue(await rows('messages').findOne({ _id: messageId, userId }, { session }), 'This message is unavailable.');
  const before = await conversationPage(userId, 20, messageId, session);
  const after = await conversationPage(userId, 20, undefined, session, messageId);
  return { items: [...before.items, chatMessage(target), ...after.items], targetId: messageId, olderCursor: before.nextCursor, newerCursor: after.nextCursor };
}
async function run(name: string, d: Record<string, unknown>, actor: Actor, session?: ClientSession): Promise<unknown> {
  const userId = actor.userId;
  const options = { session };
  const user = requireValue(await users().findOne({ _id: userId }, options));
  if (/^(people\.|posts\.|connections\.|messages\.|notifications\.|storage\.|search\.|links\.|ious\.)/.test(name)) registered(user);
  if(name.startsWith('agent.memory.')||name.startsWith('agent.instructions.')){registered(user);return memoryOperation(name,d,actor,session);}
  if (name.startsWith('log.')) { registered(user); return logOperation(name,d,actor,session); }
  if (name.startsWith('website.')) { registered(user); return websiteOperation(name,d,actor,session); }
  if (name.startsWith('make.')) { registered(user); return makeOperation(name,d,actor,session); }
  if (name.startsWith('spaces.')) { registered(user); return spaceOperation(name,d,actor,session); }
  if(name==='automations.validate'){
    registered(user);const validated=validateAutomationConfiguration(d),authority:Actor={userId,source:'agent',scope:validated.dataAccess.writeAccess?'write':'read',background:true,privateAccess:validated.dataAccess.privateAccess};
    const readableOperations=operations.filter(operation=>operation.kind==='read'&&operationAvailable(authority,operation)).map(operation=>operation.name).sort();
    const writableOperations=operations.filter(operation=>operation.kind==='write'&&operationAvailable(authority,operation)).map(operation=>operation.name).sort();
    return {...validated,readableOperations,writableOperations,delivery:['agent_inbox','silent'],notice:'Validation does not create or authorize a run. Creation and execution recheck the schedule, budget, credential and current access.'};
  }
  if (name.startsWith('automations.')) { registered(user); return automationOperation(name, d, actor, session); }
  if (name === 'runs.wake') return wakeRun(actor.userId, String(d.runId), true, session);
  if (name === 'runs.cancel') return (await import('./agent')).cancelRun(actor.userId, String(d.runId), session);
  if (name.startsWith('inbox.')) { registered(user); return inboxOperation(name, d, actor, session); }
  const now = new Date().toISOString();
  const limit = Number(d.limit || 20);
  const pageFilter = d.before ? { _id: { $lt: String(d.before) } } : {};
  const paginate = <T extends { _id: string }>(items: T[]) => ({ items: items.slice(0, limit).map(publicRow), nextCursor: items.length > limit ? items[limit - 1]._id : null });
  switch (name) {
    case 'access.get': {
      const available=operations.filter(operation=>operationAvailable(actor,operation)),writes=available.filter(operation=>operation.kind==='write');
      const credential=actor.source==='external'&&actor.credentialId?requireValue(await rows('tokens').findOne({_id:actor.credentialId,userId,revokedAt:null,$or:[{expiresAt:null},{expiresAt:{$gt:new Date()}}]},options),'This connected agent is unavailable.'):null;
      const date=(value:unknown)=>value instanceof Date?value.toISOString():typeof value==='string'?value:undefined;
      return {source:actor.source,scope:actor.scope,background:Boolean(actor.background),...(credential?{credential:{name:String(credential.name||'My AI agent'),...(date(credential.createdAt)?{createdAt:date(credential.createdAt)}:{}),expiresAt:date(credential.expiresAt)||null}}:{}),...(actor.source==='agent'?{grants:{privateAccess:actor.privateAccess!==false,writeAccess:actor.scope==='write'}}:{}),operations:{read:available.filter(operation=>operation.kind==='read').map(operation=>operation.name).sort(),write:writes.map(operation=>operation.name).sort(),confirmationRequired:writes.filter(operation=>operation.confirmationRequired).map(operation=>operation.name).sort()}};
    }
    case 'time.resolve': return resolveTime(d as unknown as TimeResolveInput);
    case 'time.convert': return convertTime(d as unknown as TimeConvertInput);
    case 'time.overlap': return overlapTimes(d as unknown as TimeOverlapInput);
    case 'activity.since': registered(user);return activitySince(d,actor,await blockedIds(userId,session),session);
    case 'locations.meeting_area': {
      const ids=[...new Set([userId,...d.personIds as string[]])];if(ids.length<2)throw new AppError(422,'participants','Choose at least one other person.');
      const people:Profile[]=[];for(const personId of ids)people.push(await run('people.get',{personId},actor,session) as Profile);
      return meetingAreas(people,Number(d.limit));
    }
    case 'people.context': {
      const relation=await run('connections.status',{personId:d.personId},actor,session) as {connection:Record<string,unknown>|null};
      let person:Profile|null=null;
      try{person=await run('people.get',{personId:d.personId},actor,session) as Profile;}catch(error){if(!(error instanceof AppError&&error.status===404&&relation.connection))throw error;}
      const recentPosts=await run('posts.list',{scope:'public',authorId:d.personId,kind:'all',limit:d.postLimit},actor,session);
      return {person,profileAvailable:Boolean(person),connection:relation.connection,recentPosts};
    }
    case 'posts.thread_updates': {
      const blocked=await blockedIds(userId,session);
      const found=await rows('posts').aggregate<Row>([
        {$match:{parentId:{$exists:true},userId:{$nin:[userId,...blocked]},deletedAt:{$exists:false},moderatedAt:{$exists:false},...(d.since?{createdAt:{$gt:String(d.since)}}:{}),...pageFilter}},{$sort:{_id:-1}},
        {$addFields:{thread:{$ifNull:['$rootId','$parentId']}}},
        {$lookup:{from:'posts',let:{thread:'$thread'},pipeline:[{$match:{userId,deletedAt:{$exists:false},moderatedAt:{$exists:false},$expr:{$or:[{$eq:['$_id','$$thread']},{$eq:['$rootId','$$thread']}]}}},{$limit:1},{$project:{_id:1}}],as:'participation'}},
        {$match:{'participation.0':{$exists:true}}},
        {$lookup:{from:'posts',localField:'thread',foreignField:'_id',as:'threadRoot'}},{$match:{'threadRoot.0':{$exists:true},'threadRoot.userId':{$nin:blocked}}},...unsuspendedActors('threadRoot.userId'),
        {$lookup:{from:'users',localField:'userId',foreignField:'_id',as:'replyAuthor'}},{$match:{'replyAuthor.0':{$exists:true},'replyAuthor.suspendedAt':{$not:{$type:'string'}}}},
        {$limit:limit+1},{$project:{thread:0,participation:0,threadRoot:0,replyAuthor:0}},
      ],{...options,maxTimeMS:10000}).toArray();
      return {items:await postCards(found.slice(0,limit),userId,blocked,session),nextCursor:found.length>limit?found[limit-1]._id:null};
    }

    case 'push.devices': return pushDevices(userId, session);
    case 'push.revoke': return revokePush(userId, String(d.deviceId), session);
    case 'files.prepare':return prepareUpload(d as {name:string;bytes:number;sha256:string;purpose:UploadPurpose},actor,session);
    case 'files.get':return ownedUploadRef(await ownUpload(userId,String(d.fileId),session));
    case 'files.discard':return discardUpload(actor,String(d.fileId),session);
    case 'files.delete':return deleteUpload(actor,String(d.fileId),session);
    case 'files.list':return {items:(await uploads().find({userId,deletedAt:{$exists:false},moderatedAt:{$exists:false}}).sort({createdAt:-1}).limit(30).toArray()).map(ownedUploadRef)};
    case 'storage.attachments': return storageAttachments(user,String(d.fileId),d.before as string|undefined,Number(d.limit||20),session,d.attachedTo as StorageLocation|undefined);
    case 'storage.list': return listStorage(user,{type:d.type as StorageType|undefined,attachedTo:d.attachedTo as StorageLocation|undefined,before:d.before as string|undefined,limit},session);
    case 'account.preferences':return {...defaultPreferences,...user.preferences};
    case 'account.preferences_update':{if(!d.font&&!d.appearance&&!d.landingPage)throw new AppError(422,'preferences','Choose a preference to change.');const prior={...defaultPreferences,...user.preferences};const updated=requireValue(await users().findOneAndUpdate({_id:userId},{$set:{'preferences.font':d.font||prior.font,'preferences.appearance':d.appearance||prior.appearance,'preferences.landingPage':d.landingPage||prior.landingPage},$inc:{'preferences.revision':1}},{...options,returnDocument:'after'}));return {...defaultPreferences,...updated.preferences};}
    case 'ious.list':return listIous(userId,d.before as string|undefined,session);
    case 'ious.get':return getIou(userId,String(d.personId),d.before?Number(d.before):undefined,session);
    case 'ious.record':return recordIou(actor,d as unknown as Parameters<typeof recordIou>[1],session!);
    case 'identity.get': return profile(user);
    case 'agent.actions.list': {
      const visibleReceipts = { userId, ...(actor.background ? { operation: { $in: ['posts.create','posts.reply','posts.like','posts.delete','connections.request','connections.respond','connections.withdraw','messages.send'] } } : {}) };
      const cursor = d.before ? requireValue(await rows('receipts').findOne({ _id: String(d.before), ...visibleReceipts }, options)) : null;
      const receipts = await rows('receipts').find({ ...visibleReceipts, ...(cursor ? { $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: cursor._id } }] } : {}) }, options).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).toArray();
      return { items: receipts.slice(0, limit).map(receipt => ({ id: receipt._id, operation: receipt.operation, source: receipt.source, result: receipt.result, createdAt: receipt.createdAt })), nextCursor: receipts.length > limit ? receipts[limit - 1]._id : null };
    }
    case 'locations.search': return searchPlaces(String(d.query));
    case 'links.text': return linkText(String(d.url),userId);
    case 'links.preview': return linkPreview(String(d.url), userId);
    case 'locations.resolve': return resolveArea(String(d.cell));
    case 'app.open': {
      if(['log','log_code'].includes(String(d.view))&&d.resourceId)await logEntryFor(userId,String(d.resourceId),session);
      if(['log','log_people','log_birthdays','log_anniversaries','log_settings','log_compose','log_code','log_join','log_scan'].includes(String(d.view)))registered(user);
      if(d.view==='log_code'&&!d.resourceId)throw new AppError(422,'log_entry','Choose a hangout.');
      if(d.view==='log_join')await logOperation('log.join_preview',{code:String(d.resourceId||'')},actor,session);
      if(d.view==='people'&&d.scope&&!['all','nearby'].includes(String(d.scope)))throw new AppError(422,'people_scope','People supports Nearby or All people.');
      if (d.view === 'connections') d.view = 'messages';
      if (actor.background && actor.privateAccess===false && (!['people','person','feed','post','post_list','location'].includes(String(d.view)) || ['saved','hidden','friends','circle'].includes(String(d.scope)))) throw new AppError(403, 'automation_scope', 'This view is outside the automation context.');
      if (d.view === 'automations' && d.resourceId) await ownAutomation(userId, String(d.resourceId), session, true);
      if (d.view === 'inbox' && d.resourceId) await ownInbox(userId, String(d.resourceId), session);
      if (d.view === 'chat_history' && d.resourceId) requireValue(await rows('messages').findOne({ _id: String(d.resourceId), userId }, options));
      if(d.view==='post_list'){if(!Array.isArray(d.postIds)||!d.postIds.length)throw new AppError(422,'posts_required','Choose posts for this list.');const selected=await run('posts.list',{scope:'selected',postIds:d.postIds},actor,session) as {items:{id:string}[]};d.postIds=selected.items.map(post=>post.id);if(!(d.postIds as string[]).length)throw new AppError(404,'unavailable','These posts are no longer available.');}
      if (['person','post'].includes(String(d.view)) && !d.resourceId) throw new AppError(422,'resource_required','Choose the specific person or post.');
      if (d.view==='person') await run('people.get',{personId:d.resourceId},actor,session);
      if (d.view==='post') await run('posts.get',{postId:d.resourceId},actor,session);
      if (d.view==='messages' && d.resourceId) {
        const connection = requireValue(await rows('connections').findOne({ _id: String(d.resourceId), members: userId }, options));
        await notBlocked(userId, (connection.members as string[]).find(id => id !== userId)!, session);
      }
      if(d.messageId){if(d.view!=='messages'||!d.resourceId)throw new AppError(422,'message_destination','Choose a conversation for this message.');requireValue(await rows('directMessages').findOne({_id:String(d.messageId),connectionId:String(d.resourceId)},options),'This message is unavailable.');}
      return { open:d.view,date:d.date,logMonth:d.logMonth,logScope:d.logScope,personId:d.personId, resourceId:d.resourceId, messageId:d.messageId, postIds:d.postIds, areaCell:d.areaCell, radiusMiles:d.radiusMiles, query:d.query,scope:d.scope,waitForCompletion:d.waitForCompletion };
    }
    case 'profile.update': {
      if (actor.source !== 'browser') throw new AppError(403, 'human_authored', 'Profiles are written by the person, not by their agent. Open the profile editor instead.');
      if (d.discoverable) registered(user);
      if(d.photos){
        await retainUploads(userId,d.photos as string[],'profile_photo',session);
        const removed=(user.photos||[]).filter(id=>!(d.photos as string[]).includes(id));
        for(const fileId of removed)if(await uploads().findOne({_id:fileId,userId,deletedAt:{$exists:false},moderatedAt:{$exists:false}},options))await deleteUpload(actor,fileId,session);
      }
      if(d.voiceFileId!==undefined&&d.voiceFileId!==user.voiceFileId){
        if(d.voiceFileId){const voice=await ownUpload(userId,String(d.voiceFileId),session);if(!voice.ready||voice.purpose!=='profile_voice'||!voice.mime.startsWith('audio/'))throw new AppError(422,'profile_voice','Record a voice note before saving it to your profile.');await retainUploads(userId,[voice._id],'profile_voice',session);}
        if(user.voiceFileId)await deleteUpload(actor,user.voiceFileId,session);
      }
      const {locationCell,mediaUrl,...fields}=d;
      let area: CoarseArea|null|undefined;
      if (locationCell===null) area=null;
      else if (typeof locationCell==='string') { const record=requireValue(await rows('locationAreas').findOne({_id:locationCell},options)); area={cell:locationCell,label:String(record.label),point:coarsePoint(locationCell)}; }
      const values = { ...fields, ...(mediaUrl!==undefined?{mediaUrl:mediaUrl===null?null:profileMediaUrl(String(mediaUrl))}:{}),...(d.name!==undefined?{logNameGrams:logPersonGrams(String(d.name))}:{}),...(area!==undefined ? {area,city:area?.label||''} : {}),
        ...(d.interests ? { interests: [...new Set((d.interests as string[]).map(s => s.toLowerCase()))] } : {}) };
      const saved = requireValue(await users().findOneAndUpdate({ _id: userId }, { $set: values }, { ...options, returnDocument: 'after' }));
      await enqueueSearch('profiles', userId, session!);
      return profile(saved);
    }
    case 'people.get': {
      await notBlocked(userId, String(d.personId), session);
      const person = requireValue(await users().findOne({ _id: String(d.personId) }, options));
      if(actor.background&&actor.privateAccess===false&&!person.discoverable)throw new AppError(404,'unavailable','This profile is not public.');
      if (!await profileVisibleTo(userId, person, session)) throw new AppError(404, 'unavailable', 'This profile is not available.');
      const [[view],hidden]=await Promise.all([withMutualCounts(userId,[profile(person)],session,actor),actor.background&&actor.privateAccess===false?Promise.resolve(false):isPersonHidden(userId,person._id,session)]);
      return {...view,...(hidden?{hidden:true}:{}),...(!actor.background||actor.privateAccess!==false?{hasSharedHangouts:await hasSharedHangouts(userId,person._id,session)}:{})};
    }
    case 'people.mutuals':{
      const personId=String(d.personId);await notBlocked(userId,personId,session);
      const person=requireValue(await users().findOne({_id:personId},{session}));
      if(!await profileVisibleTo(userId,person,session))throw new AppError(404,'unavailable','This profile is not available.');
      const page=await circleMutualIds(userId,personId,limit,d.before as string|undefined,session);
      const [friends,blocked]=await Promise.all([
        users().find({_id:{$in:page.ids},suspendedAt:null},{session,projection:{name:1,handle:1,photos:1}}).limit(page.ids.length).toArray(),
        rows('blocks').find({pairId:{$in:page.ids.map(id=>pairId(userId,id))}},{session,projection:{pairId:1}}).limit(page.ids.length*2).toArray(),
      ]);
      const byId=new Map(friends.map(friend=>[friend._id,friend])),blockedIds=new Set(blocked.map(row=>row.pairId));
      return {items:page.ids.flatMap(id=>{const friend=byId.get(id);return friend&&!blockedIds.has(pairId(userId,id))?[{id,name:friend.handle?`@${friend.handle}`:String(friend.name||'Friend'),...(friend.photos?.[0]?{photoId:friend.photos[0]}:{})}]:[];}),nextCursor:page.nextCursor};
    }
    case 'people.hide':{
      registered(user);const personId=String(d.personId);if(personId===userId)throw new AppError(422,'self','You cannot hide yourself.');
      if(d.hidden){await notBlocked(userId,personId,session);const person=requireValue(await users().findOne({_id:personId},{session}),'This person is unavailable.');if(!await profileVisibleTo(userId,person,session))throw new AppError(404,'unavailable','This person is unavailable.');}
      await setPersonHidden(userId,personId,Boolean(d.hidden),session!);
      await rows('recordEvents').insertOne({_id:randomUUID(),userIds:[userId],payload:{keys:['people']},expiresAt:new Date(Date.now()+3600000)},{session});
      return {personId,hidden:Boolean(d.hidden)};
    }
    case 'search.datasets': return searchStatus();
    case 'search.query': return searchPublic(d as unknown as SearchInput, actor);
    case 'search.global': return searchGlobal(d as unknown as import('../shared/globalSearch').GlobalSearchInput,actor);
    case 'posts.search': return searchPublic({ ...d, datasets: d.datasets || ['posts','replies'] } as unknown as SearchInput, actor);
    case 'search.similar': return similarPublic(String(d.sourceId), d as unknown as SearchInput, actor);
    case 'search.refine': return refinePublic(String(d.retrievalId), d.positive as string[], d.negative as string[], actor);
    case 'search.explain': return explainPublic(String(d.retrievalId), String(d.matchId), actor);
    case 'posts.save': {
      registered(user);const post=requireValue(await rows('posts').findOne({_id:String(d.postId)},options));await notBlocked(userId,String(post.userId),session);if(d.saved&&(post.deletedAt||post.moderatedAt))throw new AppError(404,'unavailable','This post is unavailable.');await setCollection('postSaves',userId,post._id,Boolean(d.saved),session);return (await postCards([post],userId,await blockedIds(userId,session),session))[0];
    }
    case 'people.search': {
      if(d.scope==='circle'&&actor.background&&actor.privateAccess===false)throw new AppError(403,'private_access_required','This task cannot read your Circle.');
      if(d.scope==='nearby'&&actor.background&&actor.privateAccess===false&&!d.near)throw new AppError(422,'location_required','Provide a public area for nearby search.');
      if (d.query && d.scope === 'nearby' && !d.near && !user.area?.cell) throw new AppError(422,'location_required','Choose an approximate area to find nearby people.');
      if(d.scope==='hidden'){
        let cursor=d.before as string|undefined,scanned=0;const found:Profile[]=[];
        while(scanned<150&&found.length<limit){
          const page=await hiddenPeoplePage(userId,Math.min(30,limit-found.length),cursor,session);cursor=page.nextCursor||undefined;scanned+=page.items.length;
          const people=await users().find({_id:{$in:page.items.map(row=>row.personId)}},{session}).limit(page.items.length).toArray(),byId=new Map(people.map(person=>[person._id,person]));
          for(const item of page.items){const person=byId.get(item.personId),visible=person?.discoverable&&!person.suspendedAt;
            const view:Profile=visible?profile(person):{id:item.personId,name:'Unavailable person',city:'',bio:'',interests:[],discoverable:false,photos:[]};
            if(d.query&&visible&&!`${view.name} ${view.handle||''} ${view.bio} ${view.interests.join(' ')}`.toLowerCase().includes(String(d.query).toLowerCase()))continue;
            if(d.query&&!visible)continue;
            found.push({...view,hidden:true});
          }
          if(!cursor||!page.items.length)break;
        }
        return {items:await withMutualCounts(userId,found,session,actor),nextCursor:cursor||null};
      }
      const hiddenIds=d.includeHidden||d.query?[]:await hiddenPersonIds(userId,session);
      if (d.query) {
        let cursor=d.before as string|undefined,latest:Awaited<ReturnType<typeof searchPublic>>|undefined;
        const selected:NonNullable<Awaited<ReturnType<typeof searchPublic>>['matches']>=[];
        for(let attempt=0;attempt<(d.scope==='circle'?5:1)&&selected.length<limit;attempt++){
          const result=await searchPublic({ ...d, scope:undefined, near: d.scope === 'nearby' ? d.near || user.area?.cell : undefined, query: d.query, mode: d.mode || 'hybrid', datasets: ['profiles'], cursor, limit:Math.min(30,limit-selected.length) } as unknown as SearchInput, actor);
          latest=result;cursor=result.nextCursor||undefined;
          const records=await withMutualCounts(userId,result.matches.map(match=>match.record as Profile),session,actor);
          for(let index=0;index<result.matches.length&&selected.length<limit;index++)if(d.scope!=='circle'||records[index].mutualCount)selected.push({...result.matches[index],record:records[index]});
          if(!cursor)break;
        }
        return {...latest,items:selected.map(match=>match.record),matches:selected,nextCursor:cursor||null};
      }
      const blocked = await blockedIds(userId, session);
      if(d.scope==='circle'){
        let cursor=d.before as string|undefined,more=false,scanned=0;const found:Profile[]=[];
        while(scanned<150&&found.length<limit){
          const page=await circleCandidates(userId,Math.min(30,limit-found.length),cursor,hiddenIds,session);cursor=page.nextCursor||undefined;scanned+=page.items.length;
          const eligible=await users().find({_id:{$in:page.items.map(item=>item.id),$nin:[userId,...blocked]},discoverable:true,suspendedAt:null,handle:{$type:'string'},...(d.interest?{interests:String(d.interest).toLowerCase()}:{})},{session}).toArray();
          const byId=new Map(eligible.map(person=>[person._id,person]));
          for(const item of page.items){const person=byId.get(item.id);if(person)found.push({...profile(person),mutualCount:item.mutualCount});}
          more=Boolean(cursor);if(!cursor||!page.items.length)break;
        }
        const backfill=await rows('circleMeta').findOne({_id:'backfill'},{session,projection:{done:1}});
        return {items:await withMutualCounts(userId,found,session,actor),nextCursor:more?cursor:null,indexing:!backfill?.done};
      }
      if (d.scope === 'all') { const people = await users().find({discoverable:true,suspendedAt:null,handle:{$type:'string'},_id:{$ne:userId,$nin:[...blocked,...hiddenIds],...(d.before?{$lt:String(d.before)}:{})},...(d.interest?{interests:String(d.interest).toLowerCase()}:{})},options).sort({_id:-1}).limit(limit+1).toArray(); return {items:await withMutualCounts(userId,people.slice(0,limit).map(profile),session,actor),nextCursor:people.length>limit?people[limit-1]._id:null}; }
      const cell=String(d.near||user.area?.cell||'');
      if(!cell)throw new AppError(422,'location_required','Choose an approximate area to find nearby people.');
      const radiusMiles=Number(d.radiusMiles||25);
      const paging=geoPage({cell,radiusMiles,interest:d.interest as string|undefined,before:d.before as string|undefined},userId);
      const people=await users().aggregate<User & {distanceMeters:number}>([
        {$geoNear:{near:coarsePoint(cell),key:'area.point',distanceField:'distanceMeters',spherical:true,maxDistance:radiusMiles*METERS_PER_MILE,
          query:{discoverable:true,suspendedAt:null,_id:{$ne:userId,$nin:[...blocked,...hiddenIds]},...(d.interest?{interests:String(d.interest).toLowerCase()}:{})}}},
        {$sort:{distanceMeters:1,_id:1}},...paging.stages,{$limit:limit+1},
      ],options).toArray();
      return {items:await withMutualCounts(userId,people.slice(0,limit).map(p=>({...profile(p),...sharedAreaDistance(cell,p.area!.cell,p.distanceMeters)})),session,actor),nextCursor:people.length>limit?paging.cursor(people[limit-1]):null};
    }
    case 'posts.list': {
      const audience=await postAudience(d.scope,actor,session);
      const blocked = await blockedIds(userId, session);
      if(d.scope==='saved'){
        if(d.authorId)await notBlocked(userId,String(d.authorId),session);
        const cell=d.near?String(d.near):null,point=cell?coarsePoint(cell):null,kind=d.kind||'all';
        const paging=await collectionPage('postSaves',userId,d.before,{authorId:d.authorId||null,kind,near:cell,radiusMiles:point?Number(d.radiusMiles||25):null},session);
        const postFilter={'post.userId':d.authorId?{$eq:String(d.authorId),$nin:blocked}:{$nin:blocked},'post.deletedAt':{$exists:false},'post.moderatedAt':{$exists:false},
          ...(kind==='posts'?{'post.parentId':{$exists:false}}:kind==='replies'?{'post.parentId':{$exists:true}}:{}),
          ...(point?{'post.area.point':{$geoWithin:{$centerSphere:[point.coordinates,Number(d.radiusMiles||25)*METERS_PER_MILE/6371008.8]}}}:{})};
        const saved=await rows('postSaves').aggregate<Row>([{$match:paging.filter},{$sort:{createdAt:-1,_id:-1}},{$lookup:{from:'posts',localField:'targetId',foreignField:'_id',as:'post'}},{$unwind:'$post'},{$match:postFilter},...unsuspendedActors('post.userId'),{$limit:limit+1}],options).toArray();
        const records=saved.slice(0,limit).map(row=>row.post as Row),items=await postCards(records,userId,blocked,session);
        return {items:items.map(item=>{const area=records.find(record=>record._id===item.id)?.area as CoarseArea|undefined;return point&&cell&&area?{...item,...sharedAreaDistance(cell,area.cell,distanceMeters([point.coordinates[1],point.coordinates[0]],[area.point.coordinates[1],area.point.coordinates[0]]))}:item;}),nextCursor:saved.length>limit?paging.cursor(saved[limit-1]):null};
      }
      if(d.scope==='selected'){if(!Array.isArray(d.postIds)||!d.postIds.length)throw new AppError(422,'posts_required','Choose posts for this list.');if(d.before)throw new AppError(422,'selected_cursor','A selected list does not use chronological paging.');const ids=[...new Set(d.postIds as string[])];const records=await rows('posts').find({_id:{$in:ids},userId:{$nin:blocked},deletedAt:{$exists:false},moderatedAt:{$exists:false}},options).toArray();return {items:await postCards(ids.flatMap(id=>records.find(record=>record._id===id)||[]),userId,blocked,session),nextCursor:null};}
      if (d.authorId) { await notBlocked(userId, String(d.authorId), session); if (d.scope === 'own' && d.authorId !== userId) throw new AppError(422, 'author_scope', 'Use public scope for another author.'); }
      const kind = d.kind || (['public','friends','saved'].includes(String(d.scope)) ? 'posts' : 'all');
      const friendIds=audience?.authorIds?[...audience.authorIds].filter(id=>!blocked.includes(id)):null;
      const filter={userId:friendIds?{$in:friendIds.filter(id=>!d.authorId||id===d.authorId)}:d.authorId || (d.scope==='public'?{$nin:blocked}:userId),deletedAt:{$exists:false},moderatedAt:{$exists:false},...(kind==='posts'?{parentId:{$exists:false}}:kind==='replies'?{parentId:{$exists:true}}:{})};
      const cell=d.near?String(d.near):null;
      const paging=cell?geoPage({cell,radiusMiles:Number(d.radiusMiles||25),before:d.before as string|undefined},userId):null;
      const start:Document[]=cell?[{$geoNear:{near:coarsePoint(cell),key:'area.point',distanceField:'distanceMeters',spherical:true,maxDistance:Number(d.radiusMiles||25)*METERS_PER_MILE,query:filter}},{$sort:{distanceMeters:1,_id:1}},...paging!.stages]:[{$match:{...filter,...pageFilter}},{$sort:{_id:-1}}];
      const posts = await rows('posts').aggregate<Row & {distanceMeters:number}>([
        ...start,
        { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'author' } },
        { $unwind: '$author' },{$match:{'author.suspendedAt':{$not:{$type:'string'}}}},
        { $limit: limit + 1 },
        { $project: { _id: 1, text: 1, links:1, fileIds: 1, city: 1, area:1,distanceMeters:1,userId: 1, createdAt: 1, parentId:1,rootId:1 } },
      ], options).toArray();
      const projected=await postCards(posts.slice(0,limit),userId,blocked,session);
      return {items:projected.map((post,index)=>({...post,...(cell?sharedAreaDistance(cell,(posts.find(record=>record._id===post.id)!.area as CoarseArea).cell,posts.find(record=>record._id===post.id)!.distanceMeters):{})})),nextCursor:posts.length>limit?(paging?paging.cursor(posts[limit-1]):posts[limit-1]._id):null};
    }
    case 'posts.ancestors': {
      requireValue(await run('posts.get',{postId:d.postId},actor,session),'This post is unavailable.');
      return postAncestors(String(d.postId),userId,await blockedIds(userId,session),session);
    }
    case 'posts.get': {
      const post = requireValue(await rows('posts').findOne({ _id: String(d.postId) }, options));
      await notBlocked(userId, String(post.userId), session);
      return (await postCards([post],userId,await blockedIds(userId,session),session))[0];
    }
    case 'posts.incoming_replies': {
      registered(user);
      const blocked=await blockedIds(userId,session);
      const replies=await rows('posts').aggregate<Row>([
        {$match:{parentId:{$exists:true},userId:{$nin:[userId,...blocked]},deletedAt:{$exists:false},moderatedAt:{$exists:false},...(d.since?{createdAt:{$gt:String(d.since)}}:{}),...pageFilter}},
        {$sort:{_id:-1}},
        {$lookup:{from:'posts',localField:'parentId',foreignField:'_id',as:'ownedParent'}},
        {$match:{'ownedParent.userId':userId}},
        {$lookup:{from:'users',localField:'userId',foreignField:'_id',as:'replyAuthor'}},
        {$match:{'replyAuthor.0':{$exists:true},'replyAuthor.suspendedAt':{$not:{$type:'string'}}}},
        {$limit:limit+1},{$project:{ownedParent:0,replyAuthor:0}},
      ],{...options,maxTimeMS:10000}).toArray();
      return {items:await postCards(replies.slice(0,limit),userId,blocked,session),nextCursor:replies.length>limit?replies[limit-1]._id:null};
    }
    case 'posts.replies': {
      const parent=requireValue(await rows('posts').findOne({_id:String(d.postId)},options));await notBlocked(userId,String(parent.userId),session);
      const blocked=await blockedIds(userId,session);
      const replies=await rows('posts').aggregate<Row>([{$match:{parentId:d.postId,deletedAt:{$exists:false},moderatedAt:{$exists:false},userId:{$nin:blocked},...pageFilter}},{$sort:{_id:-1}},...unsuspendedActors('userId'),{$limit:limit+1}],options).toArray();
      return {items:await postCards(replies.slice(0,limit),userId,blocked,session),nextCursor:replies.length>limit?replies[limit-1]._id:null};
    }
    case 'posts.like': {
      registered(user);const post=requireValue(await rows('posts').findOne({_id:String(d.postId),deletedAt:{$exists:false},moderatedAt:{$exists:false}},options));await notBlocked(userId,String(post.userId),session);
      await rows<{_id:string;interactionRevision:number}>('posts').updateOne({_id:post._id},{$inc:{interactionRevision:1}},options);
      const id=hash(`${userId}:${post._id}`),noticeId=hash(`post_like:${userId}:${post._id}`);
      if(d.liked){await rows('postLikes').updateOne({_id:id},{$setOnInsert:{userId,postId:post._id,createdAt:now}},{...options,upsert:true});
        if(post.userId!==userId&&await notificationEnabled(String(post.userId),'post_like',session)){const inserted=await rows('notifications').updateOne({_id:noticeId},{$setOnInsert:{userId:post.userId,actorId:userId,kind:'post_like',postId:post._id,text:String(post.text).slice(0,180),readAt:null,createdAt:now}},{...options,upsert:true});if(inserted.upsertedCount)await enqueueStoredPush(String(post.userId),userId,post._id,'post_like',noticeId,session);}
      }else{await rows('postLikes').deleteOne({_id:id},options);await rows('notifications').deleteOne({_id:noticeId},options);}
      return (await postCards([post],userId,await blockedIds(userId,session),session))[0];
    }
    case 'posts.reply': {
      registered(user);const parent=requireValue(await rows('posts').findOne({_id:String(d.postId),deletedAt:{$exists:false},moderatedAt:{$exists:false}},options));await notBlocked(userId,String(parent.userId),session);
      const fileIds = await retainPostPhotos(userId, d.fileIds as string[], session);
      await rows<{_id:string;interactionRevision:number}>('posts').updateOne({_id:parent._id},{$inc:{interactionRevision:1}},options);
      const reply={_id:nextId(),userId,text:d.text,links:normalizedPostLinks(d.links),fileIds,parentId:parent._id,rootId:parent.rootId||parent._id,city:'',area:null,createdAt:now};await rows('posts').insertOne(reply,options);await enqueueSearch('posts',reply._id,session!);
      await enqueuePostVideoLinks({...reply,text:String(d.text)},session);
      if(session)await enqueueNotificationEvent('post_reply',userId,reply._id,session,{parentId:parent._id,rootId:String(reply.rootId)});
      if(parent.userId!==userId&&await notificationEnabled(String(parent.userId),'post_reply',session)){const noticeId=hash(`post_reply:${reply._id}`);await rows('notifications').insertOne({_id:noticeId,userId:parent.userId,actorId:userId,kind:'post_reply',postId:reply._id,text:String(d.text).slice(0,180),readAt:null,createdAt:now},options);await enqueueStoredPush(String(parent.userId),userId,reply._id,'post_reply',noticeId,session);}
      return (await postCards([reply],userId,await blockedIds(userId,session),session))[0];
    }
    case 'posts.create': {
      registered(user);
      const fileIds = await retainPostPhotos(userId, d.fileIds as string[], session);
      let area:CoarseArea|null=null;
      if(d.areaCell){const record=requireValue(await rows('locationAreas').findOne({_id:String(d.areaCell)},options));area={cell:String(d.areaCell),label:String(record.label),point:coarsePoint(String(d.areaCell))};}
      const post = { _id: nextId(), userId, text: d.text, links:normalizedPostLinks(d.links),fileIds, area, city:area?.label||'', createdAt: now };
      await rows('posts').insertOne(post, options);
      await enqueuePostVideoLinks({...post,text:String(d.text)},session);
      await enqueueSearch('posts',post._id,session!);
      if(session)await enqueueNotificationEvent('post_create',userId,post._id,session);
      return (await postCards([post],userId,[],session))[0];
    }
    case 'posts.delete': {
      const result = await rows('posts').updateOne({ _id: String(d.postId), userId, deletedAt:{$exists:false} },{$set:{text:'',city:'',area:null,deletedAt:now}}, options);
      if (!result.modifiedCount) throw new AppError(404, 'not_found', 'That post is not yours or no longer exists.');
      await removePostVideoLinks(userId,String(d.postId),session!);
      await rows('postLikes').deleteMany({postId:d.postId},options);await rows('notifications').deleteMany({postId:d.postId},options);
      await enqueueSearch('posts',String(d.postId),session!);
      return { deleted: true, id: d.postId };
    }
    case 'connections.list': {
      const blocked = await blockedIds(userId, session);
      const cursor = d.before ? requireValue(await rows('connections').findOne({ _id: String(d.before), members: userId }, options)) : null;
      const updatedAt = cursor?.updatedAt || cursor?.createdAt;
      const visible = await rows('connections').aggregate<Row>([
        { $match: { $and: [{ members: userId }, { members: { $nin: blocked } }] } },...unsuspendedActors('members'),
        ...(d.lastMessageFrom&&d.lastMessageFrom!=='any'?[
          {$match:{$or:[{status:'accepted'},{initialInvitation:{$exists:true}}]}},
          {$lookup:{from:'directMessages',localField:'_id',foreignField:'connectionId',pipeline:[{$sort:{_id:-1}},{$limit:1}],as:'latestMessage'}},{$unwind:'$latestMessage'},
          {$match:{$expr:{$and:[{$in:['$latestMessage.fromId','$members']},{[d.lastMessageFrom==='other'?'$ne':'$eq']:['$latestMessage.fromId',userId]}]}}},
          {$set:{lastMessage:{fromId:'$latestMessage.fromId',createdAt:'$latestMessage.createdAt',text:{$cond:[{$ifNull:['$latestMessage.moderatedAt',false]},'Message removed by moderation.','$latestMessage.text']}}}},{$project:{latestMessage:0}},
        ]:[]),
        { $addFields: { updatedAt: { $ifNull: ['$updatedAt', '$createdAt'] } } },
        ...(cursor ? [{ $match: { $or: [{ updatedAt: { $lt: updatedAt } }, { updatedAt, _id: { $lt: cursor._id } }] } }] : []),
        { $sort: { updatedAt: -1, _id: -1 } }, { $limit: limit + 1 },
      ], options).toArray();
      const unread = await rows('notifications').find({ userId, connectionId: { $in: visible.map(row => row._id) }, kind: {$in:['message','call','connection_accepted']}, readAt: null }, options).toArray();
      for (const row of visible) row.unread = unread.some(notification => notification.connectionId === row._id);
      const ids = visible.flatMap(c => c.members as string[]);
      const people = await users().find({ _id: { $in: ids } }, options).limit(62).toArray();
      return { ...paginate(visible), people: await Promise.all(people.map(async person=>await profileVisibleTo(userId,person,session)?profile(person):{...profile(person),bio:'',interests:[],city:'',area:null,photos:[],mediaUrl:undefined})) };
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
      return { connection: publicRow(connection), people: await Promise.all(people.map(async person=>await profileVisibleTo(userId,person,session)?profile(person):{...profile(person),bio:'',interests:[],city:'',area:null,photos:[],mediaUrl:undefined})) };
    }
    case 'connections.request': {
      registered(user);
      const other = String(d.personId);
      if (other === userId) throw new AppError(422, 'self', 'Choose someone other than yourself.');
      const person = requireValue(await users().findOne({ _id: other }, options), 'This person is unavailable.');
      await notBlocked(userId, other, session);
      const id = pairId(userId, other);
      const existing = await rows('connections').findOne({ _id: id }, options);
      if (!await profileVisibleTo(userId, person, session) && !(existing?.status==='disconnected'&&existing.disconnectedBy===userId)) throw new AppError(404,'unavailable','This person is unavailable.');
      if (existing && ['pending','accepted'].includes(String(existing.status))) return publicRow(existing);
      if (existing?.status === 'declined' && existing.toId !== userId) throw new AppError(409, 'invitation_declined', 'This person declined. They can choose to invite you instead.');
      if (existing?.status === 'disconnected' && existing.disconnectedBy !== userId) throw new AppError(409, 'connection_ended', 'This person ended the connection. They can choose to invite you again.');
      const enabled=await notificationEnabled(other,'invitation',session);
      const connection = { _id: id, members: [userId, other], fromId: userId, toId: other, note: d.note, status: 'pending', notificationEnabled:enabled, createdAt: now, updatedAt: now, ...(existing?.initialInvitation ? { initialInvitation: existing.initialInvitation } : {}) };
      await rows('connections').replaceOne({ _id: id }, connection, { ...options, upsert: true });
      if(enabled)await enqueuePush(other, userId, id, 'invitation', now, session);
      return publicRow(connection);
    }
    case 'connections.respond': {
      const c = requireValue(await rows('connections').findOne({ _id: String(d.connectionId), toId: userId, status: 'pending' }, options), 'That invitation is no longer pending.');
      await notBlocked(userId, String(c.fromId), session);
      const result = requireValue(await rows('connections').findOneAndUpdate({ _id: c._id }, { $set: { status: d.accept ? 'accepted' : 'declined', respondedAt: now, updatedAt: now, ...(d.accept && !c.initialInvitation ? { initialInvitation: { fromId: c.fromId, note: c.note, createdAt: c.createdAt } } : {}) } }, { ...options, returnDocument: 'after' }));
      if (d.accept) await notifyConnection(String(c.fromId), userId, c._id, 'connection_accepted', '', undefined, session);
      if(d.accept&&session)await enqueueCircleEdge(String(c.fromId),userId,'add',session);
      return publicRow(result);
    }
    case 'connections.disconnect': {
      const c = await connectionFor(userId, String(d.connectionId), session);
      const saved = requireValue(await rows('connections').findOneAndUpdate({ _id: c._id, status: 'accepted' }, { $set: { status: 'disconnected', disconnectedBy: userId, disconnectedAt: now, updatedAt: now, initialInvitation: c.initialInvitation || { fromId: c.fromId, note: c.note, createdAt: c.createdAt } } }, { ...options, returnDocument: 'after' }));
      if(session)await endCallForConnection(c._id,session);
      if(session)await enqueueCircleEdge(String((c.members as string[])[0]),String((c.members as string[])[1]),'remove',session);
      await rows('notifications').updateMany({ connectionId: c._id, kind: { $in: ['message','connection_accepted'] } }, { $set: { readAt: now } }, options);
      return publicRow(saved);
    }
    case 'connections.withdraw': {
      const result = requireValue(await rows('connections').findOneAndUpdate({ _id: String(d.connectionId), fromId: userId, status: 'pending' }, { $set: { status: 'withdrawn', updatedAt: now } }, { ...options, returnDocument: 'after' }), 'That invitation is no longer pending.');
      return publicRow(result);
    }
    case 'messages.search': return searchDM(d as unknown as import('../shared/dmSearch').DMSearchInput,actor);
    case 'messages.get': {
      const message=requireValue(await rows('directMessages').findOne({_id:String(d.messageId)},options));await connectionFor(userId,String(message.connectionId),session,true);return directMessage(message);
    }
    case 'messages.window': {
      const target=requireValue(await rows('directMessages').findOne({_id:String(d.messageId)},options),'This message is unavailable.');
      await connectionFor(userId,String(target.connectionId),session,true);
      const [older,newer,context]=await Promise.all([
        rows('directMessages').find({connectionId:target.connectionId,_id:{$lt:target._id}},options).sort({_id:-1}).limit(21).toArray(),
        rows('directMessages').find({connectionId:target.connectionId,_id:{$gt:target._id}},options).sort({_id:1}).limit(21).toArray(),
        run('connections.get',{connectionId:target.connectionId},actor,session) as Promise<{connection:Record<string,unknown>;people:Profile[]}>,
      ]),olderPage=older.slice(0,20),newerPage=newer.slice(0,20);
      return {items:[...olderPage.reverse(),target,...newerPage].map(directMessage),targetId:target._id,connection:context.connection,people:context.people,olderCursor:older.length>20?olderPage[0]._id:null,newerCursor:newer.length>20?newerPage.at(-1)!._id:null};
    }
    case 'messages.list': {
      await connectionFor(userId, String(d.connectionId), session, true);
      return paginate((await rows('directMessages').find({ connectionId: d.connectionId, ...pageFilter }, options).sort({ _id: -1 }).limit(limit + 1).toArray()).map(message=>message.moderatedAt?{...message,text:'Message removed by moderation.'}:message));
    }
    case 'messages.send': {
      const connection = await connectionFor(userId, String(d.connectionId), session);
      const message = { _id: nextId(), connectionId: d.connectionId, fromId: userId, text: d.text, createdAt: now, ...(d.clientId?{clientId:d.clientId}:{}) };
      await rows('directMessages').insertOne(message, options);
      await enqueueDMSearch(message._id,session);
      await rows('connections').updateOne({ _id: connection._id }, { $set: { updatedAt: now, lastMessage: { text: message.text, fromId: userId, createdAt: now } } }, options);
      await notifyConnection((connection.members as string[]).find(id => id !== userId)!, userId, connection._id, 'message', String(d.text), message._id, session);
      return publicRow(message);
    }
    case 'messages.mark_read': {
      const connection=requireValue(await rows('connections').findOne({_id:String(d.connectionId),members:userId},options),'This conversation is unavailable.');
      await notBlocked(userId,(connection.members as string[]).find(id=>id!==userId)!,session);
      if (d.throughMessageId) requireValue(await rows('directMessages').findOne({ _id: String(d.throughMessageId), connectionId: d.connectionId }, options));
      await rows('notifications').updateMany({ userId, connectionId: d.connectionId, readAt:null, createdAt:{$lte:now}, $or: [{ kind: {$in:['connection_accepted','call']} }, ...(d.throughMessageId ? [{ kind: 'message', messageId: { $lte: String(d.throughMessageId) } }] : [])] }, { $set: { readAt: now } }, options);
      await rows('connections').updateOne({_id:connection._id,toId:userId,status:'pending',notificationReadAt:null},{$set:{notificationReadAt:now}},options);
      return { read: true, throughMessageId: d.throughMessageId };
    }
    case 'notifications.list': {
      const state = await notificationState(userId, session, d.before as string|undefined);
      if (!actor.background) return state;
      const items = state.items.filter(item => item.kind !== 'agent_update' && item.kind !== 'automation_status' && item.kind !== 'review');
      return {items,unread:items.filter(item=>!item.read).length,unreadCapped:state.unreadCapped,nextCursor:state.nextCursor};
    }
    case 'notifications.preferences':return notificationPreferences(userId,session);
    case 'notifications.preference_set':return setNotificationPreference(userId,d.type as NotificationType,Boolean(d.enabled),session);
    case 'notifications.rules':return listNotificationRules(userId,d.before as string|undefined,session);
    case 'notifications.rule_create':return createNotificationRule(userId,d.rule,session);
    case 'notifications.rule_set':return setNotificationRule(userId,String(d.ruleId),Number(d.revision),Boolean(d.enabled),session);
    case 'notifications.rule_delete':return deleteNotificationRule(userId,String(d.ruleId),Number(d.revision),session);
    case 'notifications.read': {
      const id = String(d.notificationId);
      if (id.startsWith('inbox:')) await rows('agentInbox').updateOne({ _id: id.slice(6), userId }, { $set: { readAt: now } }, options);
      if (id.startsWith('invite:')) requireValue(await rows('connections').findOneAndUpdate({ _id: id.slice(7), toId: userId }, { $set: { notificationReadAt: now } }, options));
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
      if(d.blocked&&session){await removeSpaceParticipantForBlock(userId,other,session);await endCallForConnection(pairId(userId,other),session);}
      if(session)await enqueueCircleEdge(userId,other,d.blocked?'remove':'add',session);
      if(session)await invalidateLogContacts([userId,other],session);
      return { personId: other, blocked: d.blocked };
    }
    case 'people.blocked': {
      const blocked = await rows('blocks').find({ ownerId: userId, ...pageFilter }, options).sort({ _id: -1 }).limit(limit + 1).toArray();
      const people = await users().find({ _id: { $in: blocked.flatMap(row => (row.members as string[]).filter(id => id !== userId)) } }, options).toArray();
      return { ...paginate(blocked), items: blocked.slice(0, limit).map(row => { const personId = (row.members as string[]).find(id => id !== userId)!; const person = people.find(person => person._id === personId); return { id: row._id, personId, name: person?.name || '', handle: person?.handle, createdAt: row.createdAt }; }) };
    }
    case 'people.report': {
      registered(user);
      const reportedPerson=requireValue(await users().findOne({ _id: String(d.personId) }, options));
      const profileVisible=await profileVisibleTo(userId,reportedPerson,session);
      if(!profileVisible&&!d.postId&&!d.messageId)throw new AppError(404,'unavailable','This profile is not available.');
      if(d.postId&&d.messageId)throw new AppError(422,'report_target','Choose one piece of evidence per report.');
      let evidence:Record<string,unknown>|undefined;
      if(d.postId){const post=requireValue(await rows('posts').findOne({_id:String(d.postId),userId:String(d.personId),deletedAt:{$exists:false},moderatedAt:{$exists:false}},options));await notBlocked(userId,String(post.userId),session);evidence={kind:'post',id:post._id,text:post.text,links:post.links||[],fileIds:post.fileIds||[],createdAt:post.createdAt};}
      if(d.messageId){const message=requireValue(await rows('directMessages').findOne({_id:String(d.messageId),fromId:String(d.personId),moderatedAt:{$exists:false}},options));requireValue(await rows('connections').findOne({_id:String(message.connectionId),members:userId},options));evidence={kind:'message',id:message._id,text:message.text,fromId:message.fromId,createdAt:message.createdAt};}
      const report = { _id: nextId(), fromId: userId, personId: d.personId, reason: d.reason, createdAt: now, status: 'unreviewed', profileSnapshot:profileVisible?profile(reportedPerson):null, ...(evidence?{evidence}:{}) };
      await rows('reports').insertOne(report, options);
      return { id: report._id, status: 'unreviewed' };
    }
    case 'wallet.activity': return walletActivity(userId,Number(d.limit));
    case 'wallet.get': return wallet(userId);
    case 'conversation.search': return searchChat(d as unknown as import('../shared/chatSearch').ChatSearchInput, actor);
    case 'conversation.window': return conversationWindow(userId, String(d.messageId), session);
    case 'conversation.list': {
      if (d.before && d.after) throw new AppError(422, 'cursor', 'Choose before or after, not both.');
      return conversationPage(userId, limit, d.before as string | undefined, session, d.after as string | undefined);
    }
    case 'conversation.append': {
      if (actor.source !== 'external') throw new AppError(403, 'external_only', 'This operation is for your connected external agent.');
      const message = { _id: nextId(), userId, role: d.role, text: d.text, source: 'external', createdAt: now };
      await rows('messages').insertOne(message, options);
      await enqueueChatSearch(userId, message._id, session);
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
  await assertBackgroundAuthority(actor);
  const op = operations.find(o => o.name === name);
  if (actor.background && (!op || !operationAvailable(actor,op))) throw new AppError(403, 'automation_scope', 'This background agent does not have access to that operation.');
  if (!op) throw new AppError(404, 'unknown_operation', 'Unknown operation.');
  const parsed = op.schema.parse(input) as Record<string, unknown>;
  if(actor.background&&actor.privateAccess===false){
    if(['people.search','search.query','posts.search','search.similar'].includes(name)&&parsed.includeHidden===true||['people.search','posts.search','posts.list'].includes(name)&&['saved','friends','circle','hidden'].includes(String(parsed.scope))||['posts.create','posts.reply'].includes(name)&&Array.isArray(parsed.fileIds)&&parsed.fileIds.length>0)throw new AppError(403,'private_access_required','This task is limited to public data.');
  }
  if(['posts.create','posts.reply'].includes(name)&&!parsed.text&&!(parsed.fileIds as string[]).length&&!(parsed.links as string[]|undefined)?.length)throw new AppError(422,'post_empty','Add text, a photo, or a URL before posting.');
  if (actor.source !== 'browser' && name === 'profile.update') throw new AppError(403, 'human_authored', 'Profiles are written by the person in the app.');
  if (actor.source === 'agent' && !op.agent) throw new AppError(403, 'unavailable', 'This operation is not available to the hosted agent.');
  if (name === 'inbox.publish') await validateInboxLinks(actor.userId, parsed.links as import('../shared/inbox').InboxItem['links'], String(parsed.body));
  if (op.kind === 'read') {
    const result=op.outputSchema.parse(await run(name, parsed, actor));
    // Private bookmark metadata is account activity, even on public record reads.
    return actor.background&&actor.privateAccess===false?JSON.parse(JSON.stringify(result,(key,value)=>['saved','liked','hidden','friendAction','connectionId'].includes(key)?undefined:value)):result;
  }
  if (actor.scope !== 'write') throw new AppError(403, 'scope', 'This token only has read access.');
  if (!idempotencyKey || !/^[\w:.-]{8,150}$/.test(idempotencyKey)) throw new AppError(422, 'idempotency_required', 'Writes need an idempotency key of 8–150 characters. Reuse it only when retrying the same action.');
  const receiptId = hash(`${actor.userId}:${idempotencyKey}`);
  if (op.confirmationRequired && !proof.confirmed) throw new AppError(409, 'confirmation_required', op.consequence!);
  if (name==='profile.update' && typeof parsed.locationCell==='string') await resolveArea(parsed.locationCell);
  if (name==='posts.create' && typeof parsed.areaCell==='string') await resolveArea(parsed.areaCell);
  const fingerprint = hash(canonicalJSON({ name, parsed }));
  if(name.startsWith('make.')&&op.kind==='write'||name==='website.media.import'){
    const prior=await rows('receipts').findOne({_id:receiptId});
    if(prior){
      if(prior.fingerprint!==fingerprint)throw new AppError(409,'idempotency_conflict','This key was already used for a different action.');
      requireValue(await users().findOne({_id:actor.userId,suspendedAt:null},{projection:{_id:1}}),'This account is suspended or unavailable.');
      if(actor.source==='agent'&&!await rows('runs').findOne({_id:proof.runId,userId:actor.userId,lease:proof.lease,leaseUntil:{$gt:Date.now()},status:'running',cancelRequested:{$ne:true}},{projection:{_id:1}}))throw new AppError(409,'stale_run','The task no longer has authority to act.');
      return prior.result;
    }
  }
  if(name==='make.create'||name==='make.edit')parsed.project=await normalizeMakeProject(parsed.project,actor);
  let makeFileId:string|undefined;
  if(name==='make.publish')makeFileId=await stageMakePublish(parsed,actor);
  let websiteFileId:string|undefined;
  if(name==='website.media.import')websiteFileId=await stageWebsiteMediaImport(parsed,actor);
  let committed:unknown;
  try{committed = await transaction(async session => {
    if (actor.source === 'agent') {
      const lease = await rows('runs').updateOne({ _id: proof.runId, userId: actor.userId, lease: proof.lease, leaseUntil: { $gt: Date.now() }, status: 'running', cancelRequested: { $ne: true } }, { $set: { lastEffect: idempotencyKey } }, { session });
      if (!lease.matchedCount) throw new AppError(409, 'stale_run', 'The task no longer has authority to act.');
    }
    requireValue(await users().findOneAndUpdate({_id:actor.userId,suspendedAt:null},{$inc:{authorityRevision:1}},{session}), 'This account is suspended or unavailable.');
    const prior = await rows('receipts').findOne({ _id: receiptId }, { session });
    if (prior) {
      if (prior.fingerprint !== fingerprint && !(prior.fingerprintVersion === undefined && legacyOperationRevisions.some(version => prior.fingerprint === hash(canonicalJSON({ name, version, parsed }))))) throw new AppError(409, 'idempotency_conflict', 'This key was already used for a different action.');
      return prior.result;
    }
    // Contact permissions and a simultaneous block must serialize on the same
    // document; snapshot reads alone permit a send/block write-skew race.
    if (['connections.request', 'connections.respond', 'connections.withdraw', 'connections.disconnect', 'posts.save', 'messages.send', 'people.block','posts.like','posts.reply'].includes(name)) {
      let other = parsed.personId as string | undefined;
      if(!other&&parsed.postId){const post=requireValue(await rows('posts').findOne({_id:String(parsed.postId)},{session}));other=String(post.userId);}
      if (!other && parsed.connectionId) {
        const connection = requireValue(await rows('connections').findOne({ _id: String(parsed.connectionId), members: actor.userId }, { session }));
        other = (connection.members as string[]).find(id => id !== actor.userId);
      }
      if (other) await rows<{ _id: string; revision: number }>('contactPairs').updateOne({ _id: pairId(actor.userId, other) }, { $inc: { revision: 1 } }, { session, upsert: true });
    }
    if(name.startsWith('log.')&&op.kind==='write'&&parsed.entryId){
      const entry=await rows('logEntries').findOne({_id:String(parsed.entryId)},{session,projection:{members:1,invited:1}});
      const contacts=[...new Set([...(entry?.members as string[]||[]),...(entry?.invited as string[]||[]),...(parsed.personId?[String(parsed.personId)]:[])])].filter(id=>id!==actor.userId).sort();
      for(const id of contacts)await rows<{_id:string;revision:number}>('contactPairs').updateOne({_id:pairId(actor.userId,id)},{$inc:{revision:1}},{session,upsert:true});
    }
    // Store the same JSON shape that the HTTP/MCP client receives. BSON would
    // otherwise turn nested undefined optional fields into null on a retry.
    const result = JSON.parse(JSON.stringify(op.outputSchema.parse(await run(name,{...parsed,...(makeFileId?{_makeFileId:makeFileId}:{}),...(websiteFileId?{_websiteFileId:websiteFileId}:{})}, actor, session))));
    if((name.startsWith('agent.memory.')||name==='agent.instructions.update')&&result.saved!==false)await rows('recordEvents').insertOne({_id:randomUUID(),userIds:[actor.userId],payload:{keys:['agent_memory']},expiresAt:new Date(Date.now()+3600000)},{session});
    if(name==='profile.update')await syncSourceAttachments('profile',actor.userId,session);
    if(['posts.create','posts.reply','posts.delete'].includes(name))await syncSourceAttachments('posts',name==='posts.delete'?String(parsed.postId):String(result.id),session);
    if((name.startsWith('log.')||name==='make.publish')&&(parsed.entryId||result.id)&&!['log.birthday_update','log.preferences_update'].includes(name))await syncSourceAttachments('hangouts',String(parsed.entryId||result.id),session);
    await rows('receipts').insertOne({ _id: receiptId, userId: actor.userId, operation: name, source: actor.source, fingerprint, fingerprintVersion: 2, result, createdAt: new Date().toISOString() }, { session });
    return result;
  });}catch(error){if(makeFileId)await deleteUpload(actor,makeFileId).catch(()=>{});if(websiteFileId)await deleteUpload(actor,websiteFileId).catch(()=>{});throw error;}
  if(makeFileId&&(committed as {imageFileId?:string}).imageFileId!==makeFileId)await deleteUpload(actor,makeFileId).catch(()=>{});
  if(websiteFileId&&!(committed as {assets?:{fileId:string}[]}).assets?.some(asset=>asset.fileId===websiteFileId))await deleteUpload(actor,websiteFileId).catch(()=>{});
  if(['files.delete','log.leave','log.delete','log.update','log.contribute','make.publish'].includes(name)||name==='profile.update'&&parsed.photos)await expireUploads({remote:false}).catch(error=>console.error('Upload deletion cleanup:',error.name));
  return committed;
}
