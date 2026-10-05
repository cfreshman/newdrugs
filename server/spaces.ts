import {randomUUID} from 'node:crypto';
import {TrackSource,type ParticipantInfo} from '@livekit/protocol';
import {AccessToken} from 'livekit-server-sdk';
import type {ClientSession} from 'mongodb';
import type {Actor} from './auth';
import {users} from './auth';
import {config} from './config';
import {rows,transaction} from './db';
import {AppError,requireValue} from './errors';
import {liveMediaReady,liveRoomService} from './calling';
import {queueLiveMediaEffect} from './liveMediaEffects';
import {enqueueSearch} from './search/queue';
import {enqueueNotificationEvent} from './notificationEvents';
import {attachmentUrl} from '../shared/postLinks';

interface SpacePin {id:string;kind:'post'|'link';url:string;postId?:string;addedBy:string;createdAt:string}
interface SpaceRow {_id:string;title:string;description:string;hostId:string;status:'starting'|'live'|'ended';revision:number;createdAt:string;endedAt?:string;speakerIds:string[];pins?:SpacePin[];hostOffer?:{id:string;toId:string;createdAt:string;expiresAt:string}}
interface PresenceRow {_id:string;spaceId:string;userId:string;sid:string;joinedAt:string}
interface PresenceHistory {_id:string;spaceId:string;userId:string;lastSeenAt:string;expiresAt:Date}
interface RequestRow {_id:string;spaceId:string;personId:string;status:'pending'|'invited'|'approved'|'declined';createdAt:string;updatedAt:string}
const spaces=()=>rows<SpaceRow>('spaces'),requests=()=>rows<RequestRow>('spaceSpeakerRequests'),presence=()=>rows<PresenceRow>('spacePresence');
const history=()=>rows<PresenceHistory>('spacePresenceHistory');
const START_GRACE_MS=120000,START_HARD_EXPIRY_MS=300000;
export const spaceRoomName=(id:string)=>`${config.APP_ENV}:space:${id}`;
async function account(userId:string,session?:ClientSession){return requireValue(await users().findOne({_id:userId,handle:{$type:'string'},suspendedAt:null},{session}),'Save your account before joining a Talk space.');}
async function allowed(userId:string,row:SpaceRow,session?:ClientSession){
 if(await users().findOne({_id:row.hostId,suspendedAt:{$type:'string'}},{session,projection:{_id:1}})||userId!==row.hostId&&await rows('blocks').findOne({members:{$all:[userId,row.hostId]}},{session})||await rows('spaceRemovals').findOne({_id:`${row._id}:${userId}`},{session}))throw new AppError(404,'space_unavailable','This Talk space is unavailable.');
}
async function owned(userId:string,id:string,session?:ClientSession){const row=requireValue(await spaces().findOne({_id:id},{session}),'This Talk space is unavailable.');if(row.status==='starting'&&row.hostId!==userId)throw new AppError(404,'space_unavailable','This Talk space is unavailable.');await allowed(userId,row,session);return row;}
async function projectMany(source:SpaceRow[],userId:string,session?:ClientSession,includeProfiles=false){
 if(!source.length)return [];
 const active=await presence().find({spaceId:{$in:source.map(row=>row._id)}},{session,projection:{spaceId:1,userId:1,joinedAt:1}}).limit(source.length*101).toArray();
 const ids=[...new Set([...source.flatMap(row=>row.speakerIds),...active.map(row=>row.userId),...(includeProfiles?source.flatMap(row=>(row.pins||[]).map(pin=>pin.addedBy)):[])])],requestIds=source.map(row=>`${row._id}:${userId}`),otherIds=ids.filter(id=>id!==userId);
 const postIds=includeProfiles?[...new Set(source.flatMap(row=>(row.pins||[]).flatMap(pin=>pin.postId?[pin.postId]:[])))]:[];
 const [people,ownRequests,invites,blocks,pinnedPosts]=await Promise.all([users().find({_id:{$in:ids}},{session,projection:{handle:1,name:1,photos:1,discoverable:1,suspendedAt:1}}).toArray(),requests().find({_id:{$in:requestIds}},{session,projection:{status:1}}).toArray(),includeProfiles?requests().find({spaceId:{$in:source.map(row=>row._id)},status:'invited'},{session,projection:{spaceId:1,personId:1}}).limit(source.length*100).toArray():Promise.resolve([]),includeProfiles&&otherIds.length?rows('blocks').find({pairId:{$in:otherIds.map(id=>[userId,id].sort().join(':'))}},{session,projection:{members:1}}).limit(otherIds.length).toArray():Promise.resolve([]),postIds.length?rows<{_id:string;userId:string;text:string}>('posts').find({_id:{$in:postIds},deletedAt:{$exists:false},moderatedAt:{$exists:false}},{session,projection:{userId:1,text:1}}).limit(postIds.length).toArray():Promise.resolve([])]);
 const postAuthors=[...new Set(pinnedPosts.map(post=>post.userId))],extraAuthors=postAuthors.length?await users().find({_id:{$in:postAuthors}},{session,projection:{handle:1,name:1,suspendedAt:1}}).limit(postAuthors.length).toArray():[];
 const postBlocks=postAuthors.length?await rows<{_id:string;pairId:string}>('blocks').find({pairId:{$in:postAuthors.map(id=>[userId,id].sort().join(':'))}},{session,projection:{pairId:1}}).limit(postAuthors.length).toArray():[];
 const hiddenPostAuthors=new Set(postBlocks.map(row=>row.pairId));
 const byPerson=new Map(people.map(person=>[person._id,person])),byRequest=new Map(ownRequests.map(row=>[row._id,row])),bySpace=new Map<string,PresenceRow[]>(),blocked=new Set(blocks.flatMap(row=>(row.members as string[]).filter(id=>id!==userId)));
 for(const row of active){const list=bySpace.get(row.spaceId)||[];list.push(row);bySpace.set(row.spaceId,list);}
 const publicPerson=(person:(typeof people)[number])=>({id:person._id,name:person.handle?`@${person.handle}`:String(person.name||'Member'),...(person.photos?.[0]?{photoId:person.photos[0]}:{})});
 return source.filter(row=>byPerson.has(row.hostId)&&!byPerson.get(row.hostId)?.suspendedAt).map(row=>{
  const host=byPerson.get(row.hostId),members=row.speakerIds.flatMap(id=>{const person=byPerson.get(id);return person&&!person.suspendedAt?[person]:[]});
  const connected=(bySpace.get(row._id)||[]).sort((a,b)=>a.joinedAt.localeCompare(b.joinedAt)).flatMap(item=>{const person=byPerson.get(item.userId);return person&&!person.suspendedAt?[person]:[]});
  const speaking=new Set(row.speakerIds),presentSpeakers=connected.filter(person=>speaking.has(person._id)),presentListeners=connected.filter(person=>!speaking.has(person._id));
  const present=[...new Map([...connected,...members.filter(person=>person._id===userId)].map(person=>[person._id,person])).values()];
  const ownRequest=byRequest.get(`${row._id}:${userId}`);
  const pins=includeProfiles?(row.pins||[]).flatMap(pin=>{const sender=byPerson.get(pin.addedBy),addedByName=sender?.handle?`@${sender.handle}`:String(sender?.name||'Member');if(pin.kind==='link')return [{...pin,addedByName}];const post=pinnedPosts.find(item=>item._id===pin.postId),author=extraAuthors.find(item=>item._id===post?.userId);if(!post||!author||author.suspendedAt||hiddenPostAuthors.has([userId,author._id].sort().join(':')))return [];return [{...pin,addedByName,postText:post.text,postAuthor:author.handle?`@${author.handle}`:String(author.name||'Member')}];}):[];
  return {id:row._id,title:row.title,description:row.description,hostId:row.hostId,hostName:host?.handle?`@${host.handle}`:String(host?.name||'Member'),status:row.status,revision:row.revision,createdAt:row.createdAt,...(row.endedAt?{endedAt:row.endedAt}:{}),speakerIds:members.map(person=>person._id),speakers:members.map(publicPerson),...(includeProfiles?{profileIds:present.filter(person=>(person._id===userId||person.discoverable)&&!blocked.has(person._id)).map(person=>person._id),participantCards:present.map(person=>({id:person._id,name:String(person.name||'Member'),...(person.handle?{handle:person.handle}:{})})),pins,...(row.hostId===userId?{invitedSpeakerIds:invites.filter(item=>item.spaceId===row._id).map(item=>item.personId)}:{})}:{}),speakingCount:presentSpeakers.length,listeningCount:presentListeners.length,presentSpeakers:presentSpeakers.slice(0,4).map(publicPerson),presentListeners:presentListeners.slice(0,4).map(publicPerson),myRole:row.hostId===userId?'host':row.speakerIds.includes(userId)?'speaker':'listener',myRequest:ownRequest?.status==='invited'?null:ownRequest?.status||null,...(ownRequest?.status==='invited'?{mySpeakerInvite:true}:{}),...(row.status==='live'&&row.hostOffer&&row.hostOffer.expiresAt>new Date().toISOString()&&(userId===row.hostId||userId===row.hostOffer.toId)?{hostOffer:{id:row.hostOffer.id,toId:row.hostOffer.toId,expiresAt:row.hostOffer.expiresAt}}:{})};
 });
}
async function project(row:SpaceRow,userId:string,session?:ClientSession){return (await projectMany([row],userId,session,true))[0];}
async function event(userIds:string[],session?:ClientSession){if(userIds.length)await rows('recordEvents').insertOne({_id:randomUUID(),userIds:[...new Set(userIds)],payload:{keys:['spaces']},expiresAt:new Date(Date.now()+3600000)},{session});}
async function audience(row:SpaceRow,session?:ClientSession){const connected=await presence().find({spaceId:row._id},{session,projection:{userId:1}}).limit(101).toArray();return [...new Set([...row.speakerIds,...connected.map(person=>person.userId)])];}
export async function spaceReportTarget(reporterId:string,personId:string,spaceId:string,session?:ClientSession){
 const row=requireValue(await spaces().findOne({_id:spaceId},{session,projection:{title:1,hostId:1,createdAt:1}}),'This Talk space is unavailable.');
 const ids=[reporterId,personId],active=await presence().find({spaceId,userId:{$in:ids}},{session,projection:{userId:1}}).limit(2).toArray();
 const recent=await history().find({spaceId,userId:{$in:ids},lastSeenAt:{$gte:new Date(Date.now()-120000).toISOString()}},{session,projection:{userId:1}}).limit(2).toArray();
 const known=new Set([...active,...recent].map(item=>item.userId));
 if(reporterId===personId||ids.some(id=>!known.has(id)))throw new AppError(404,'space_report','Choose someone who was recently in this Talk with you.');
 return {id:row._id,title:row.title,hostId:row.hostId,createdAt:row.createdAt};
}
async function activateSpace(id:string,hostId:string){await transaction(async session=>{
 const row=await spaces().findOne({_id:id,status:'starting',hostId},{session});
 if(!row||!await presence().findOne({_id:`${id}:${hostId}`},{session,projection:{_id:1}}))return;
 await rows<{_id:string;revision:number;lastFirstAt?:string}>('notificationFences').updateOne({_id:'talk-live'},{$inc:{revision:1}},{upsert:true,session});
 const firstLive=!await spaces().findOne({status:'live'},{session,projection:{_id:1}}),fence=firstLive?await rows<{_id:string;lastFirstAt?:string}>('notificationFences').findOne({_id:'talk-live'},{session}):null;
 const now=new Date().toISOString(),announceFirst=firstLive&&(!fence?.lastFirstAt||Date.now()-Date.parse(fence.lastFirstAt)>=15*60000);
 const changed=await spaces().updateOne({_id:id,status:'starting',hostId},{$set:{status:'live'}},{session});if(!changed.modifiedCount)return;
 if(announceFirst)await rows<{_id:string;lastFirstAt:string}>('notificationFences').updateOne({_id:'talk-live'},{$set:{lastFirstAt:now}},{session});
 await enqueueSearch('spaces',id,session);await enqueueNotificationEvent('talk_open',hostId,id,session);if(announceFirst)await enqueueNotificationEvent('talk_first_live',hostId,id,session);await event([hostId],session);
});}
/** A failed start releases the host's slot even when no LiveKit room was created. */
export async function expireStartingSpace(id:string,cutoff=Date.now()-START_GRACE_MS,outer?:ClientSession):Promise<boolean>{
 if(!outer)return transaction(session=>expireStartingSpace(id,cutoff,session));
 const row=await spaces().findOne({_id:id,status:'starting',createdAt:{$lte:new Date(cutoff).toISOString()}},{session:outer});
 if(!row||await presence().findOne({_id:`${id}:${row.hostId}`},{session:outer,projection:{_id:1}}))return false;
 const now=new Date().toISOString(),changed=await spaces().updateOne({_id:id,status:'starting'},{$set:{status:'ended',endedAt:now},$inc:{revision:1}},{session:outer});
 if(!changed.modifiedCount)return false;
 await event([row.hostId],outer);await queueLiveMediaEffect('close',spaceRoomName(id),outer);return true;
}
export async function spaceOperation(name:string,d:Record<string,unknown>,actor:Actor,session?:ClientSession):Promise<unknown>{
 const userId=actor.userId,now=new Date().toISOString();await account(userId,session);
 if(name==='spaces.list'){
  const blocked=(await rows('blocks').find({members:userId},{session,projection:{members:1}}).limit(1001).toArray()).flatMap(row=>(row.members as string[]).filter(id=>id!==userId));
  if(blocked.length>1000)throw new AppError(422,'block_limit','Please contact support about your block list.');
  const limit=Number(d.limit||20);let boundary:{at:string;id:string}|null=null;
  if(d.before){try{const value=JSON.parse(Buffer.from(String(d.before),'base64url').toString());if(typeof value.at!=='string'||typeof value.id!=='string')throw Error();boundary=value;}catch{throw new AppError(422,'space_cursor','Reload Talk.');}}
  const found=await spaces().find({status:'live',hostId:{$nin:blocked},...(boundary?{$or:[{createdAt:{$lt:boundary.at}},{createdAt:boundary.at,_id:{$lt:boundary.id}}]}:{})},{session}).sort({createdAt:-1,_id:-1}).limit(limit+1).toArray();
  const selected=found.slice(0,limit),removed=await rows('spaceRemovals').find({userId,spaceId:{$in:selected.map(row=>row._id)}},{session,projection:{spaceId:1}}).toArray();
  const hidden=new Set(removed.map(row=>row.spaceId)),items=await projectMany(selected.filter(row=>!hidden.has(row._id)),userId,session);
  const last=found[limit-1];return {items,nextCursor:found.length>limit&&last?Buffer.from(JSON.stringify({at:last.createdAt,id:last._id})).toString('base64url'):null};
 }
 if(name==='spaces.create'){
  if(!liveMediaReady())throw new AppError(503,'spaces_unavailable','Live Talk is not available yet.');
  if(await spaces().findOne({hostId:userId,status:{$in:['starting','live']}},{session,projection:{_id:1}}))throw new AppError(409,'space_active','End your current Talk space before opening another.');
  const row:SpaceRow={_id:randomUUID(),hostId:userId,title:String(d.title).trim(),description:String(d.description).trim(),status:'starting',revision:1,createdAt:now,speakerIds:[userId]};
  try{await spaces().insertOne(row,{session});}catch(error){if((error as {code?:number}).code===11000)throw new AppError(409,'space_active','End your current Talk space before opening another.');throw error;}
  return project(row,userId,session);
 }
 const row=await owned(userId,String(d.spaceId),session);
 if(name==='spaces.get')return project(row,userId,session);
 if(name==='spaces.requests'){
  if(row.hostId!==userId)throw new AppError(403,'space_host','Only the host can review speaking requests.');
  const found=await requests().find({spaceId:row._id,status:'pending'},{session}).sort({createdAt:1,_id:1}).limit(30).toArray();
  const people=await users().find({_id:{$in:found.map(item=>item.personId)}},{session,projection:{handle:1,name:1}}).toArray();
  return {items:found.map(item=>({spaceId:row._id,personId:item.personId,name:people.find(person=>person._id===item.personId)?.handle?`@${people.find(person=>person._id===item.personId)?.handle}`:String(people.find(person=>person._id===item.personId)?.name||'Member'),status:item.status,createdAt:item.createdAt}))};
 }
 if(name==='spaces.end'&&row.status==='starting'){
  if(row.hostId!==userId)throw new AppError(403,'space_host','Only the host can manage this Talk space.');
  if(row.revision!==Number(d.revision))throw new AppError(409,'space_changed','This Talk space changed. Read it again.');
  row.status='ended';row.endedAt=now;row.revision++;
  const result=await spaces().replaceOne({_id:row._id,status:'starting',hostId:userId,revision:Number(d.revision)},row,{session});if(!result.matchedCount)throw new AppError(409,'space_changed','This Talk space changed. Read it again.');
  await presence().deleteMany({spaceId:row._id},{session});await event([userId],session);if(session)await queueLiveMediaEffect('close',spaceRoomName(row._id),session);return project(row,userId,session);
 }
 if(row.status!=='live')throw new AppError(409,'space_ended','This Talk space has ended.');
 if(name==='spaces.pin_post'||name==='spaces.pin_link'||name==='spaces.unpin'){
  if(!await presence().findOne({_id:`${row._id}:${userId}`},{session,projection:{_id:1}}))throw new AppError(409,'space_presence','Join this Talk space first.');
  const pins=row.pins||[];
  if(name==='spaces.unpin'){
   const pin=requireValue(pins.find(item=>item.id===d.pinId),'This Talk link is no longer here.');
   if(pin.addedBy!==userId&&row.hostId!==userId)throw new AppError(403,'space_pin_owner','Only the person who added this link or the host can remove it.');
   row.pins=pins.filter(item=>item.id!==pin.id);
  }else{
   if(!row.speakerIds.includes(userId))throw new AppError(403,'space_speaker','Only speakers can add links to Talk.');
   if(pins.length>=12)throw new AppError(422,'space_pin_limit','Remove a Talk link before adding another.');
   let pin:SpacePin;
   if(name==='spaces.pin_post'){
    const post=requireValue(await rows<{_id:string;userId:string}>('posts').findOne({_id:String(d.postId),deletedAt:{$exists:false},moderatedAt:{$exists:false}},{session,projection:{userId:1}}),'This post is unavailable.');
    if(await rows('blocks').findOne({pairId:[userId,post.userId].sort().join(':')},{session})||!await users().findOne({_id:post.userId,suspendedAt:null},{session,projection:{_id:1}}))throw new AppError(404,'post_unavailable','This post is unavailable.');
    if(pins.some(item=>item.postId===post._id))return project(row,userId,session);
    pin={id:randomUUID(),kind:'post',url:`/posts/${post._id}`,postId:post._id,addedBy:userId,createdAt:now};
   }else{
    let url:string;try{url=attachmentUrl(String(d.url));}catch{throw new AppError(422,'space_link','Choose a public website URL.');}
    if(pins.some(item=>item.url===url))return project(row,userId,session);
    pin={id:randomUUID(),kind:'link',url,addedBy:userId,createdAt:now};
   }
   row.pins=[...pins,pin];
  }
  row.revision++;const updated=await spaces().replaceOne({_id:row._id,status:'live',revision:row.revision-1},row,{session});if(!updated.matchedCount)throw new AppError(409,'space_changed','Talk links changed. Try again.');
  await event(await audience(row,session),session);return project(row,userId,session);
 }
 if(name==='spaces.accept_host'||name==='spaces.decline_host'){
  if(row.revision!==Number(d.revision))throw new AppError(409,'space_changed','Read the current Talk space before responding.');
  const offer=row.hostOffer;
  if(!offer||offer.id!==d.offerId||offer.expiresAt<=now)throw new AppError(409,'space_host_offer','This host offer is no longer available.');
  if(offer.toId!==userId)throw new AppError(403,'space_host_offer','Only the invited speaker can respond to this host offer.');
  const members=await audience(row,session);
  if(name==='spaces.accept_host'){
   if(!row.speakerIds.includes(userId)||!await presence().findOne({_id:`${row._id}:${userId}`},{session,projection:{_id:1}}))throw new AppError(409,'space_speaker','Join the Talk space as a speaker before accepting host control.');
   if(await spaces().findOne({hostId:userId,status:{$in:['starting','live']},_id:{$ne:row._id}},{session,projection:{_id:1}}))throw new AppError(409,'space_active','End the Talk space you already host before accepting another.');
   const blocked=await rows<{_id:string;members:string[]}>('blocks').find({members:userId},{session,projection:{members:1}}).limit(1001).toArray();
   if(blocked.length>1000)throw new AppError(422,'block_limit','Please contact support about your block list.');
   const blockedIds=new Set(blocked.flatMap(item=>item.members.filter(id=>id!==userId)));
   if(members.some(id=>blockedIds.has(id)))throw new AppError(409,'space_handoff_blocked','A speaker or participant is blocked. Resolve that before transferring host control.');
   row.hostId=userId;
  }
  delete row.hostOffer;row.revision++;
  try{const result=await spaces().replaceOne({_id:row._id,status:'live',revision:Number(d.revision),'hostOffer.id':offer.id},row,{session});if(!result.matchedCount)throw new AppError(409,'space_changed','This host offer changed. Read the Talk space again.');}
  catch(error){if((error as {code?:number}).code===11000)throw new AppError(409,'space_active','You already host another live Talk space.');throw error;}
  await event(members,session);if(name==='spaces.accept_host'&&session)await enqueueSearch('spaces',row._id,session);
  return project(row,userId,session);
 }
 if(name==='spaces.request_speak'){
  if(row.speakerIds.includes(userId))throw new AppError(409,'already_speaking','You can already speak in this Talk space.');
  const id=`${row._id}:${userId}`;
  if(await requests().findOne({_id:id,status:'invited'},{session,projection:{_id:1}}))throw new AppError(409,'speaker_invited','Respond to your invitation to speak.');
  await requests().updateOne({_id:id},{$set:{status:'pending',updatedAt:now},$setOnInsert:{spaceId:row._id,personId:userId,createdAt:now}},{session,upsert:true});
  await event([row.hostId,userId],session);const person=await account(userId,session);
  return {spaceId:row._id,personId:userId,name:person.handle?`@${person.handle}`:String(person.name||'Member'),status:'pending',createdAt:now};
 }
 if(name==='spaces.cancel_request'){
  await requests().deleteOne({_id:`${row._id}:${userId}`,status:'pending'},{session});await event([row.hostId,userId],session);return {cancelled:true};
 }
 if(name==='spaces.respond_speaker_invite'){
  const invite=requireValue(await requests().findOne({_id:`${row._id}:${userId}`,status:'invited'},{session}),'This speaking invitation is no longer available.');
  if(!await presence().findOne({_id:`${row._id}:${userId}`},{session,projection:{_id:1}}))throw new AppError(409,'space_listener','Join the Talk space before responding.');
  if(d.accept){
   if(row.speakerIds.length>=13)throw new AppError(422,'space_speakers','A Talk space can have up to thirteen speakers.');
   if(!row.speakerIds.includes(userId)){row.speakerIds.push(userId);row.revision++;const changed=await spaces().replaceOne({_id:row._id,status:'live',revision:row.revision-1},row,{session});if(!changed.matchedCount)throw new AppError(409,'space_changed','The Talk space changed. Try again.');}
   if(session)await queueLiveMediaEffect('speaker',spaceRoomName(row._id),session,row._id,userId);
  }
  await requests().updateOne({_id:invite._id,status:'invited'},{$set:{status:d.accept?'approved':'declined',updatedAt:now}},{session});
  await event([row.hostId,userId],session);return project(row,userId,session);
 }
 if(row.hostId!==userId)throw new AppError(403,'space_host','Only the host can manage this Talk space.');
 if(d.revision!==undefined&&row.revision!==Number(d.revision))throw new AppError(409,'space_changed','Read the current Talk space before changing it.');
 if(name==='spaces.edit'){
  row.title=String(d.title).trim();row.description=String(d.description).trim();row.revision++;
  const updated=await spaces().replaceOne({_id:row._id,status:'live',hostId:userId,revision:row.revision-1},row,{session});if(!updated.matchedCount)throw new AppError(409,'space_changed','This Talk space changed. Read it again.');
  if(session)await enqueueSearch('spaces',row._id,session);
  await event(await audience(row,session),session);return project(row,userId,session);
 }
 if(name==='spaces.invite_speaker'){
  const personId=String(d.personId);
  if(personId===userId||row.speakerIds.includes(personId)||!await presence().findOne({_id:`${row._id}:${personId}`},{session,projection:{_id:1}}))throw new AppError(409,'space_listener','Choose a connected listener.');
  await account(personId,session);await allowed(personId,row,session);
  if(row.speakerIds.length>=13)throw new AppError(422,'space_speakers','A Talk space can have up to thirteen speakers.');
  const id=`${row._id}:${personId}`,current=await requests().findOne({_id:id},{session});
  if(current?.status==='pending')throw new AppError(409,'speaker_requested','This person already requested to speak. Approve their request.');
  if(current?.status==='invited')return project(row,userId,session);
  await requests().updateOne({_id:id},{$set:{status:'invited',updatedAt:now},$setOnInsert:{spaceId:row._id,personId,createdAt:now}},{session,upsert:true});
  await event([personId,userId],session);return project(row,userId,session);
 }
 if(name==='spaces.cancel_speaker_invite'){
  const personId=String(d.personId);
  await requests().deleteOne({_id:`${row._id}:${personId}`,status:'invited'},{session});await event([personId,userId],session);return project(row,userId,session);
 }
 if(name==='spaces.offer_host'){
  const personId=String(d.personId);
  if(personId===userId||!row.speakerIds.includes(personId)||!await presence().findOne({_id:`${row._id}:${personId}`},{session,projection:{_id:1}}))throw new AppError(409,'space_speaker','Choose a connected speaker to host this Talk space.');
  if(row.hostOffer&&row.hostOffer.expiresAt>now)throw new AppError(409,'space_host_offer','A host offer is already pending. Cancel it before choosing someone else.');
  await account(personId,session);await allowed(personId,row,session);
  row.hostOffer={id:randomUUID(),toId:personId,createdAt:now,expiresAt:new Date(Date.now()+120000).toISOString()};row.revision++;
  const result=await spaces().replaceOne({_id:row._id,status:'live',hostId:userId,revision:Number(d.revision)},row,{session});if(!result.matchedCount)throw new AppError(409,'space_changed','This Talk space changed. Read it again.');
  await event([userId,personId],session);return project(row,userId,session);
 }
 if(name==='spaces.cancel_host_offer'){
  const offer=row.hostOffer;if(!offer||offer.id!==d.offerId||offer.expiresAt<=now)throw new AppError(409,'space_host_offer','This host offer is no longer available.');
  delete row.hostOffer;row.revision++;const result=await spaces().replaceOne({_id:row._id,status:'live',hostId:userId,revision:Number(d.revision),'hostOffer.id':offer.id},row,{session});if(!result.matchedCount)throw new AppError(409,'space_changed','This Talk space changed. Read it again.');
  await event([userId,offer.toId],session);return project(row,userId,session);
 }
 if(name==='spaces.end'){
  if(session)await rows<{_id:string;revision:number}>('notificationFences').updateOne({_id:'talk-live'},{$inc:{revision:1}},{upsert:true,session});
  row.status='ended';row.endedAt=now;delete row.hostOffer;row.revision++;await spaces().replaceOne({_id:row._id,revision:Number(d.revision)},row,{session});await presence().deleteMany({spaceId:row._id},{session});await event(row.speakerIds,session);if(session){await queueLiveMediaEffect('close',spaceRoomName(row._id),session);await enqueueSearch('spaces',row._id,session);}return project(row,userId,session);
 }
 const personId=String(d.personId);
 if(personId===userId)throw new AppError(422,'space_self','Choose another person.');
 if(name==='spaces.respond_speaker'){
  const request=requireValue(await requests().findOne({_id:`${row._id}:${personId}`,status:'pending'},{session}),'This speaking request is unavailable.');
  const approve=Boolean(d.approve);
  if(approve&&row.speakerIds.length>=13)throw new AppError(422,'space_speakers','A Talk space can have up to thirteen speakers.');
  if(approve)row.speakerIds.push(personId);
  row.revision++;await spaces().replaceOne({_id:row._id,revision:Number(d.revision)},row,{session});await requests().updateOne({_id:request._id},{$set:{status:approve?'approved':'declined',updatedAt:now}},{session});await event([row.hostId,personId],session);if(session)await queueLiveMediaEffect('speaker',spaceRoomName(row._id),session,row._id,personId);
  return {space:await project(row,userId,session),personId,approved:approve};
 }
 if(name==='spaces.revoke_speaker'){
  row.speakerIds=row.speakerIds.filter(id=>id!==personId);if(row.hostOffer?.toId===personId)delete row.hostOffer;row.revision++;await spaces().replaceOne({_id:row._id,revision:Number(d.revision)},row,{session});await requests().updateOne({_id:`${row._id}:${personId}`},{$set:{status:'declined',updatedAt:now}},{session});await event([row.hostId,personId],session);if(session)await queueLiveMediaEffect('speaker',spaceRoomName(row._id),session,row._id,personId);
  return {space:await project(row,userId,session),personId};
 }
 if(name==='spaces.remove_person'){
  await rows('spaceRemovals').updateOne({_id:`${row._id}:${personId}`},{$setOnInsert:{spaceId:row._id,userId:personId,removedAt:now}},{session,upsert:true});
  await presence().deleteOne({_id:`${row._id}:${personId}`},{session});
  row.speakerIds=row.speakerIds.filter(id=>id!==personId);if(row.hostOffer?.toId===personId)delete row.hostOffer;row.revision++;await spaces().replaceOne({_id:row._id,revision:Number(d.revision)},row,{session});await event([row.hostId,personId],session);if(session)await queueLiveMediaEffect('remove',spaceRoomName(row._id),session,row._id,personId);
  return {space:await project(row,userId,session),personId,removed:true};
 }
 throw new AppError(404,'unknown_operation','Unknown Talk operation.');
}

export async function spaceAccess(userId:string,id:string){
 if(!liveMediaReady())throw new AppError(503,'spaces_unavailable','Live Talk is not available yet.');
 await account(userId);const row=await owned(userId,id);if(row.status!=='live'&&row.status!=='starting')throw new AppError(409,'space_ended','This Talk space has ended.');
 const service=liveRoomService();await service.createRoom({name:spaceRoomName(id),maxParticipants:100,emptyTimeout:120,departureTimeout:90});
 const owner=await account(userId),speaker=row.speakerIds.includes(userId);
 const token=new AccessToken(config.LIVEKIT_API_KEY,config.LIVEKIT_API_SECRET,{identity:userId,name:owner.handle?`@${owner.handle}`:String(owner.name||'Member'),metadata:JSON.stringify({photoId:owner.photos?.[0]||null}),ttl:'2m'});
 token.addGrant({roomJoin:true,room:spaceRoomName(id),canPublish:speaker,canPublishSources:speaker?[TrackSource.MICROPHONE]:[],canSubscribe:true,canPublishData:true});
 const current=await spaces().findOne({_id:id,status:{$in:['starting','live']}});
 if(!current||current.status==='starting'&&current.hostId!==userId)throw new AppError(409,'space_ended','This Talk space is no longer available.');
 return {url:config.LIVEKIT_PUBLIC_URL,token:await token.toJwt(),space:await project(current,userId)};
}
export async function spaceWebhook(signal:{event:string;room?:{name?:string};participant?:{identity?:string;sid?:string}}){
 const prefix=`${config.APP_ENV}:space:`,name=signal.room?.name;if(!name?.startsWith(prefix))return;
 const id=name.slice(prefix.length),row=await spaces().findOne({_id:id,status:{$in:['starting','live']}});if(!row){if(signal.event==='room_finished')await presence().deleteMany({spaceId:id});return;}
 const participantId=signal.participant?.identity;
 if(participantId&&['participant_joined','participant_left'].includes(signal.event)){
  const key=`${id}:${participantId}`,sid=signal.participant?.sid||'';
  if(signal.event==='participant_joined'){
   if(row.status==='starting'&&participantId!==row.hostId){await transaction(session=>queueLiveMediaEffect('remove',spaceRoomName(id),session,id,participantId));return;}
   try{await account(participantId);await allowed(participantId,row);}
   catch(error){if(!(error instanceof AppError))throw error;await transaction(async session=>{await rows('spaceRemovals').updateOne({_id:key},{$setOnInsert:{spaceId:id,userId:participantId,removedAt:new Date().toISOString()}},{session,upsert:true});await queueLiveMediaEffect('remove',spaceRoomName(id),session,id,participantId);});return;}
   const joinedAt=new Date().toISOString();
   await presence().updateOne({_id:key},{$set:{spaceId:id,userId:participantId,sid,joinedAt}},{upsert:true});
   await history().updateOne({_id:key},{$set:{spaceId:id,userId:participantId,lastSeenAt:joinedAt,expiresAt:new Date(Date.now()+7*86400000)}},{upsert:true});
   if(row.status==='starting'&&participantId===row.hostId)await activateSpace(id,participantId);
   if(!await spaces().findOne({_id:id,status:{$in:['starting','live']}},{projection:{_id:1}})){await presence().deleteOne({_id:key});await transaction(session=>queueLiveMediaEffect('remove',spaceRoomName(id),session,id,participantId));return;}
  }else{
   const removed=await presence().deleteOne(sid?{_id:key,sid}:{_id:key});
   if(removed.deletedCount)await history().updateOne({_id:key},{$set:{lastSeenAt:new Date().toISOString(),expiresAt:new Date(Date.now()+7*86400000)}});
   if(removed.deletedCount&&row.hostOffer?.toId===participantId){const result=await spaces().updateOne({_id:id,status:'live','hostOffer.toId':participantId},{$unset:{hostOffer:''},$inc:{revision:1}});if(result.modifiedCount)await event([row.hostId,participantId]);}
  }
  const current=await presence().find({spaceId:id},{projection:{userId:1}}).limit(101).toArray();
  await event([row.hostId,participantId,...row.speakerIds,...current.map(person=>person.userId)]);
  return;
 }
 // A browser refresh briefly disconnects the host. Keep the space until its
 // explicit end or LiveKit's empty-room departure timeout.
 if(signal.event==='room_finished'){
  await transaction(async session=>{const current=await spaces().findOne({_id:id,status:{$in:['starting','live']}},{session});if(!current)return;if(current.status==='live')await rows<{_id:string;revision:number}>('notificationFences').updateOne({_id:'talk-live'},{$inc:{revision:1}},{upsert:true,session});const now=new Date().toISOString(),present=await presence().find({spaceId:id},{session,projection:{userId:1}}).limit(101).toArray();await spaces().updateOne({_id:id,status:current.status},{$set:{status:'ended',endedAt:now},$unset:{hostOffer:''},$inc:{revision:1}},{session});await presence().deleteMany({spaceId:id},{session});await event([...current.speakerIds,...present.map(person=>person.userId)],session);await queueLiveMediaEffect('close',spaceRoomName(id),session);if(current.status==='live')await enqueueSearch('spaces',id,session);});
 }
}
/** Reconcile a bounded page of live rooms with LiveKit. Webhooks keep presence
 * immediate; this also repairs missed webhooks and rooms open during rollout. */
export async function reconcileSpacePresence(limit=5,cursor=''){
 const batch=await spaces().find({status:'live',...(cursor?{_id:{$gt:cursor}}:{})},{projection:{_id:1,hostId:1,speakerIds:1,hostOffer:1,createdAt:1}}).sort({_id:1}).limit(limit).toArray();
 if(!batch.length)return {cursor:'',count:0};
 const service=liveRoomService();
 for(const room of batch){
  let live:ParticipantInfo[],missingRoom=false;
  try{live=await service.listParticipants(spaceRoomName(room._id));}
  catch(error){if((error as {status?:number}).status===404){live=[];missingRoom=true;}else{console.error('Talk presence reconciliation:',room._id,error instanceof Error?error.name:'Error');continue;}}
  if(!await spaces().findOne({_id:room._id,status:'live'},{projection:{_id:1}}))continue;
  const current=await presence().find({spaceId:room._id}).limit(101).toArray();
  const connected=new Map(live.filter(person=>person.identity).slice(0,100).map(person=>[person.identity,person]));
  let changed=false;
  for(const [userId,person] of connected){
   const prior=current.find(row=>row.userId===userId),sid=person.sid||'';
   if(prior?.sid===sid)continue;
   await presence().updateOne({_id:`${room._id}:${userId}`},{$set:{spaceId:room._id,userId,sid,joinedAt:new Date().toISOString()}},{upsert:true});changed=true;
  }
  for(const prior of current)if(!connected.has(prior.userId)){
   const removed=await presence().deleteOne({_id:prior._id,sid:prior.sid});if(removed.deletedCount){changed=true;if(room.hostOffer?.toId===prior.userId)await spaces().updateOne({_id:room._id,status:'live','hostOffer.toId':prior.userId},{$unset:{hostOffer:''},$inc:{revision:1}});}
  }
  if(missingRoom&&!connected.size&&!current.length&&Date.parse(String(room.createdAt))<Date.now()-START_HARD_EXPIRY_MS){await spaceWebhook({event:'room_finished',room:{name:spaceRoomName(room._id)}});continue;}
  if(changed)await event([room.hostId,...room.speakerIds,...connected.keys(),...current.map(person=>person.userId)]);
 }
 return {cursor:batch.at(-1)!._id,count:batch.length};
}
/** Starting rooms are private and expire even if their first webhook never arrives. */
export async function reconcileStartingSpaces(limit=5,cursor=''){
 const batch=await spaces().find({status:'starting',...(cursor?{_id:{$gt:cursor}}:{})},{projection:{_id:1,hostId:1,createdAt:1}}).sort({_id:1}).limit(limit).toArray();
 if(!batch.length)return {cursor:'',count:0};
 const service=liveRoomService();
 for(const room of batch){
  let connected:ParticipantInfo[];
  try{connected=await service.listParticipants(spaceRoomName(room._id));}
  catch(error){if((error as {status?:number}).status===404)connected=[];else{if(Date.parse(String(room.createdAt))<Date.now()-START_HARD_EXPIRY_MS)await expireStartingSpace(room._id,Date.now()-START_HARD_EXPIRY_MS);else console.error('Talk startup reconciliation:',room._id,error instanceof Error?error.name:'Error');continue;}}
  const host=connected.find(person=>person.identity===room.hostId);
  if(host){await presence().updateOne({_id:`${room._id}:${room.hostId}`},{$set:{spaceId:room._id,userId:room.hostId,sid:host.sid||'',joinedAt:new Date().toISOString()}},{upsert:true});await activateSpace(room._id,room.hostId);}
  else if(Date.parse(String(room.createdAt))<Date.now()-START_GRACE_MS)await expireStartingSpace(room._id);
 }
 return {cursor:batch.at(-1)!._id,count:batch.length};
}
export function startSpacePresenceWorker(){
 let stopped=false,running:Promise<unknown>|undefined,cursor='',startingCursor='';
 const tick=()=>{if(stopped||running||!liveMediaReady())return;running=(async()=>{const live=await reconcileSpacePresence(5,cursor);cursor=live.cursor;const starting=await reconcileStartingSpaces(5,startingCursor);startingCursor=starting.cursor;})().catch(error=>console.error('Talk presence worker:',error instanceof Error?error.name:'Error')).finally(()=>{running=undefined;});};
 tick();const timer=setInterval(tick,10000);
 return async()=>{stopped=true;clearInterval(timer);await running;};
}
export async function removeSpaceParticipantForBlock(first:string,second:string,outer?:ClientSession){
 const work=async(session:ClientSession)=>{for(const [hostId,personId] of [[first,second],[second,first]]){
  const row=await spaces().findOne({hostId,status:'live'},{session,projection:{_id:1}});if(!row)continue;
   const current=await spaces().findOne({_id:row._id,status:'live'},{session});if(!current)continue;
   const now=new Date().toISOString();await rows('spaceRemovals').updateOne({_id:`${current._id}:${personId}`},{$setOnInsert:{spaceId:current._id,userId:personId,removedAt:now}},{session,upsert:true});
   await spaces().updateOne({_id:current._id,status:'live'},{$pull:{speakerIds:personId},$inc:{revision:1},...(current.hostOffer?.toId===personId?{$unset:{hostOffer:''}}:{})},{session});
   await event([hostId,personId],session);await queueLiveMediaEffect('remove',spaceRoomName(current._id),session,current._id,personId);
 }};
 if(outer)await work(outer);else await transaction(work);
}
