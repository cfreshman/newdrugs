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

interface SpaceRow {_id:string;title:string;description:string;hostId:string;status:'live'|'ended';revision:number;createdAt:string;endedAt?:string;speakerIds:string[]}
interface PresenceRow {_id:string;spaceId:string;userId:string;sid:string;joinedAt:string}
interface RequestRow {_id:string;spaceId:string;personId:string;status:'pending'|'approved'|'declined';createdAt:string;updatedAt:string}
const spaces=()=>rows<SpaceRow>('spaces'),requests=()=>rows<RequestRow>('spaceSpeakerRequests'),presence=()=>rows<PresenceRow>('spacePresence');
export const spaceRoomName=(id:string)=>`${config.APP_ENV}:space:${id}`;
async function account(userId:string,session?:ClientSession){return requireValue(await users().findOne({_id:userId,handle:{$type:'string'},suspendedAt:null},{session}),'Save your account before joining a Talk space.');}
async function allowed(userId:string,row:SpaceRow,session?:ClientSession){
 if(await users().findOne({_id:row.hostId,suspendedAt:{$type:'string'}},{session,projection:{_id:1}})||userId!==row.hostId&&await rows('blocks').findOne({members:{$all:[userId,row.hostId]}},{session})||await rows('spaceRemovals').findOne({_id:`${row._id}:${userId}`},{session}))throw new AppError(404,'space_unavailable','This Talk space is unavailable.');
}
async function owned(userId:string,id:string,session?:ClientSession){const row=requireValue(await spaces().findOne({_id:id},{session}),'This Talk space is unavailable.');await allowed(userId,row,session);return row;}
async function projectMany(source:SpaceRow[],userId:string,session?:ClientSession){
 if(!source.length)return [];
 const active=await presence().find({spaceId:{$in:source.map(row=>row._id)}},{session,projection:{spaceId:1,userId:1,joinedAt:1}}).limit(source.length*101).toArray();
 const ids=[...new Set([...source.flatMap(row=>row.speakerIds),...active.map(row=>row.userId)])],requestIds=source.map(row=>`${row._id}:${userId}`);
 const [people,ownRequests]=await Promise.all([users().find({_id:{$in:ids}},{session,projection:{handle:1,name:1,photos:1,suspendedAt:1}}).toArray(),requests().find({_id:{$in:requestIds}},{session,projection:{status:1}}).toArray()]);
 const byPerson=new Map(people.map(person=>[person._id,person])),byRequest=new Map(ownRequests.map(row=>[row._id,row])),bySpace=new Map<string,PresenceRow[]>();
 for(const row of active){const list=bySpace.get(row.spaceId)||[];list.push(row);bySpace.set(row.spaceId,list);}
 const publicPerson=(person:(typeof people)[number])=>({id:person._id,name:person.handle?`@${person.handle}`:String(person.name||'Member'),...(person.photos?.[0]?{photoId:person.photos[0]}:{})});
 return source.filter(row=>byPerson.has(row.hostId)&&!byPerson.get(row.hostId)?.suspendedAt).map(row=>{
  const host=byPerson.get(row.hostId),members=row.speakerIds.flatMap(id=>{const person=byPerson.get(id);return person&&!person.suspendedAt?[person]:[]});
  const connected=(bySpace.get(row._id)||[]).sort((a,b)=>a.joinedAt.localeCompare(b.joinedAt)).flatMap(item=>{const person=byPerson.get(item.userId);return person&&!person.suspendedAt?[person]:[]});
  const speaking=new Set(row.speakerIds),presentSpeakers=connected.filter(person=>speaking.has(person._id)),presentListeners=connected.filter(person=>!speaking.has(person._id));
  return {id:row._id,title:row.title,description:row.description,hostId:row.hostId,hostName:host?.handle?`@${host.handle}`:String(host?.name||'Member'),status:row.status,revision:row.revision,createdAt:row.createdAt,...(row.endedAt?{endedAt:row.endedAt}:{}),speakerIds:members.map(person=>person._id),speakers:members.map(publicPerson),speakingCount:presentSpeakers.length,listeningCount:presentListeners.length,presentSpeakers:presentSpeakers.slice(0,4).map(publicPerson),presentListeners:presentListeners.slice(0,4).map(publicPerson),myRole:row.hostId===userId?'host':row.speakerIds.includes(userId)?'speaker':'listener',myRequest:byRequest.get(`${row._id}:${userId}`)?.status||null};
 });
}
async function project(row:SpaceRow,userId:string,session?:ClientSession){return (await projectMany([row],userId,session))[0];}
async function event(userIds:string[],session?:ClientSession){if(userIds.length)await rows('recordEvents').insertOne({_id:randomUUID(),userIds:[...new Set(userIds)],payload:{keys:['spaces']},expiresAt:new Date(Date.now()+3600000)},{session});}
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
  if(await spaces().findOne({hostId:userId,status:'live'},{session,projection:{_id:1}}))throw new AppError(409,'space_active','End your current Talk space before opening another.');
  const row:SpaceRow={_id:randomUUID(),hostId:userId,title:String(d.title).trim(),description:String(d.description).trim(),status:'live',revision:1,createdAt:now,speakerIds:[userId]};
  try{await spaces().insertOne(row,{session});}catch(error){if((error as {code?:number}).code===11000)throw new AppError(409,'space_active','End your current Talk space before opening another.');throw error;}
  if(session)await enqueueSearch('spaces',row._id,session);
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
 if(row.status!=='live')throw new AppError(409,'space_ended','This Talk space has ended.');
 if(name==='spaces.request_speak'){
  if(row.speakerIds.includes(userId))throw new AppError(409,'already_speaking','You can already speak in this Talk space.');
  const id=`${row._id}:${userId}`;
  await requests().updateOne({_id:id},{$set:{status:'pending',updatedAt:now},$setOnInsert:{spaceId:row._id,personId:userId,createdAt:now}},{session,upsert:true});
  await event([row.hostId,userId],session);const person=await account(userId,session);
  return {spaceId:row._id,personId:userId,name:person.handle?`@${person.handle}`:String(person.name||'Member'),status:'pending',createdAt:now};
 }
 if(name==='spaces.cancel_request'){
  await requests().deleteOne({_id:`${row._id}:${userId}`,status:'pending'},{session});await event([row.hostId,userId],session);return {cancelled:true};
 }
 if(row.hostId!==userId)throw new AppError(403,'space_host','Only the host can manage this Talk space.');
 if(row.revision!==Number(d.revision))throw new AppError(409,'space_changed','Read the current Talk space before changing it.');
 if(name==='spaces.end'){
  row.status='ended';row.endedAt=now;row.revision++;await spaces().replaceOne({_id:row._id,revision:Number(d.revision)},row,{session});await presence().deleteMany({spaceId:row._id},{session});await event(row.speakerIds,session);if(session){await queueLiveMediaEffect('close',spaceRoomName(row._id),session);await enqueueSearch('spaces',row._id,session);}return project(row,userId,session);
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
  row.speakerIds=row.speakerIds.filter(id=>id!==personId);row.revision++;await spaces().replaceOne({_id:row._id,revision:Number(d.revision)},row,{session});await requests().updateOne({_id:`${row._id}:${personId}`},{$set:{status:'declined',updatedAt:now}},{session});await event([row.hostId,personId],session);if(session)await queueLiveMediaEffect('speaker',spaceRoomName(row._id),session,row._id,personId);
  return {space:await project(row,userId,session),personId};
 }
 if(name==='spaces.remove_person'){
  await rows('spaceRemovals').updateOne({_id:`${row._id}:${personId}`},{$setOnInsert:{spaceId:row._id,userId:personId,removedAt:now}},{session,upsert:true});
  await presence().deleteOne({_id:`${row._id}:${personId}`},{session});
  row.speakerIds=row.speakerIds.filter(id=>id!==personId);row.revision++;await spaces().replaceOne({_id:row._id,revision:Number(d.revision)},row,{session});await event([row.hostId,personId],session);if(session)await queueLiveMediaEffect('remove',spaceRoomName(row._id),session,row._id,personId);
  return {space:await project(row,userId,session),personId,removed:true};
 }
 throw new AppError(404,'unknown_operation','Unknown Talk operation.');
}

export async function spaceAccess(userId:string,id:string){
 if(!liveMediaReady())throw new AppError(503,'spaces_unavailable','Live Talk is not available yet.');
 await account(userId);const row=await owned(userId,id);if(row.status!=='live')throw new AppError(409,'space_ended','This Talk space has ended.');
 const service=liveRoomService();await service.createRoom({name:spaceRoomName(id),maxParticipants:100,emptyTimeout:120,departureTimeout:90});
 const owner=await account(userId),speaker=row.speakerIds.includes(userId);
 const token=new AccessToken(config.LIVEKIT_API_KEY,config.LIVEKIT_API_SECRET,{identity:userId,name:owner.handle?`@${owner.handle}`:String(owner.name||'Member'),metadata:JSON.stringify({photoId:owner.photos?.[0]||null}),ttl:'2m'});
 token.addGrant({roomJoin:true,room:spaceRoomName(id),canPublish:speaker,canPublishSources:speaker?[TrackSource.MICROPHONE]:[],canSubscribe:true,canPublishData:false});
 return {url:config.LIVEKIT_PUBLIC_URL,token:await token.toJwt(),space:await project(row,userId)};
}
export async function spaceWebhook(signal:{event:string;room?:{name?:string};participant?:{identity?:string;sid?:string}}){
 const prefix=`${config.APP_ENV}:space:`,name=signal.room?.name;if(!name?.startsWith(prefix))return;
 const id=name.slice(prefix.length),row=await spaces().findOne({_id:id,status:'live'});if(!row){if(signal.event==='room_finished')await presence().deleteMany({spaceId:id});return;}
 const participantId=signal.participant?.identity;
 if(participantId&&['participant_joined','participant_left'].includes(signal.event)){
  const key=`${id}:${participantId}`,sid=signal.participant?.sid||'';
  if(signal.event==='participant_joined')await presence().updateOne({_id:key},{$set:{spaceId:id,userId:participantId,sid,joinedAt:new Date().toISOString()}},{upsert:true});
  else await presence().deleteOne(sid?{_id:key,sid}:{_id:key});
  const current=await presence().find({spaceId:id},{projection:{userId:1}}).limit(101).toArray();
  await event([row.hostId,participantId,...row.speakerIds,...current.map(person=>person.userId)]);
  return;
 }
 // A browser refresh briefly disconnects the host. Keep the space until its
 // explicit end or LiveKit's empty-room departure timeout.
 if(signal.event==='room_finished'){
  await transaction(async session=>{const current=await spaces().findOne({_id:id,status:'live'},{session});if(!current)return;const now=new Date().toISOString(),present=await presence().find({spaceId:id},{session,projection:{userId:1}}).limit(101).toArray();await spaces().updateOne({_id:id,status:'live'},{$set:{status:'ended',endedAt:now},$inc:{revision:1}},{session});await presence().deleteMany({spaceId:id},{session});await event([...current.speakerIds,...present.map(person=>person.userId)],session);await queueLiveMediaEffect('close',spaceRoomName(id),session);await enqueueSearch('spaces',id,session);});
 }
}
/** Reconcile a bounded page of live rooms with LiveKit. Webhooks keep presence
 * immediate; this also repairs missed webhooks and rooms open during rollout. */
export async function reconcileSpacePresence(limit=5,cursor=''){
 const batch=await spaces().find({status:'live',...(cursor?{_id:{$gt:cursor}}:{})},{projection:{_id:1,hostId:1,speakerIds:1}}).sort({_id:1}).limit(limit).toArray();
 if(!batch.length)return {cursor:'',count:0};
 const service=liveRoomService();
 for(const room of batch){
  let live:ParticipantInfo[];
  try{live=await service.listParticipants(spaceRoomName(room._id));}
  catch(error){if((error as {status?:number}).status===404)live=[];else{console.error('Talk presence reconciliation:',room._id,error instanceof Error?error.name:'Error');continue;}}
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
   const removed=await presence().deleteOne({_id:prior._id,sid:prior.sid});if(removed.deletedCount)changed=true;
  }
  if(changed)await event([room.hostId,...room.speakerIds,...connected.keys(),...current.map(person=>person.userId)]);
 }
 return {cursor:batch.at(-1)!._id,count:batch.length};
}
export function startSpacePresenceWorker(){
 let stopped=false,running:Promise<unknown>|undefined,cursor='';
 const tick=()=>{if(stopped||running||!liveMediaReady())return;running=reconcileSpacePresence(5,cursor).then(result=>{cursor=result.cursor;}).catch(error=>console.error('Talk presence worker:',error instanceof Error?error.name:'Error')).finally(()=>{running=undefined;});};
 tick();const timer=setInterval(tick,10000);
 return async()=>{stopped=true;clearInterval(timer);await running;};
}
export async function removeSpaceParticipantForBlock(first:string,second:string,outer?:ClientSession){
 const work=async(session:ClientSession)=>{for(const [hostId,personId] of [[first,second],[second,first]]){
  const row=await spaces().findOne({hostId,status:'live'},{session,projection:{_id:1}});if(!row)continue;
   const current=await spaces().findOne({_id:row._id,status:'live'},{session});if(!current)continue;
   const now=new Date().toISOString();await rows('spaceRemovals').updateOne({_id:`${current._id}:${personId}`},{$setOnInsert:{spaceId:current._id,userId:personId,removedAt:now}},{session,upsert:true});
   await spaces().updateOne({_id:current._id,status:'live'},{$pull:{speakerIds:personId},$inc:{revision:1}},{session});
   await event([hostId,personId],session);await queueLiveMediaEffect('remove',spaceRoomName(current._id),session,current._id,personId);
 }};
 if(outer)await work(outer);else await transaction(work);
}
