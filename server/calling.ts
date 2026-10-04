import {randomUUID} from 'node:crypto';
import {TrackSource} from '@livekit/protocol';
import {AccessToken,RoomServiceClient} from 'livekit-server-sdk';
import type {ClientSession} from 'mongodb';
import type {CallAccess,CallPage,CallRecord} from '../shared/calling';
import {config} from './config';
import {rows,transaction} from './db';
import {users} from './auth';
import {AppError,requireValue} from './errors';
import {queueLiveMediaEffect} from './liveMediaEffects';
import {notificationEnabled} from './notificationSettings';
import {enqueueStoredPush} from './push';

interface CallRow extends Omit<CallRecord,'id'> {_id:string;members:string[];active:boolean}
const calls=()=>rows<CallRow>('calls');
const roomName=(id:string)=>`${config.APP_ENV}:call:${id}`;
export const liveMediaReady=()=>Boolean(config.LIVEKIT_URL&&config.LIVEKIT_PUBLIC_URL&&config.LIVEKIT_API_KEY&&config.LIVEKIT_API_SECRET);
export const liveRoomService=()=>{if(!liveMediaReady())throw new AppError(503,'calling_unavailable','Live calling is not available yet.');return new RoomServiceClient(config.LIVEKIT_URL,config.LIVEKIT_API_KEY,config.LIVEKIT_API_SECRET,{requestTimeout:5});};
const view=(row:CallRow):CallRecord=>({id:row._id,connectionId:row.connectionId,callerId:row.callerId,calleeId:row.calleeId,status:row.status,createdAt:row.createdAt,...(row.joinedAt?{joinedAt:row.joinedAt}:{}),...(row.endedAt?{endedAt:row.endedAt}:{}),...(row.endedBy?{endedBy:row.endedBy}:{})});
async function connection(userId:string,connectionId:string,session?:ClientSession,active=true){
 const row=requireValue(await rows('connections').findOne({_id:connectionId,members:userId,...(active?{status:'accepted'}:{})},{session}),'This conversation is unavailable.');
 if(active&&row.status!=='accepted')throw new AppError(403,'connection_required','Video calls need an accepted connection.');
 const members=row.members as string[],other=members.find(id=>id!==userId);
 if(members.length!==2||!other||await rows('blocks').findOne({members:{$all:[userId,other]}},{session})||await users().findOne({_id:{$in:members},suspendedAt:{$type:'string'}},{session,projection:{_id:1}}))throw new AppError(404,'unavailable','This conversation is unavailable.');
 return {row,other,members};
}
async function event(members:string[],session:ClientSession){await rows('recordEvents').insertOne({_id:randomUUID(),userIds:members,payload:{keys:['calls']},notificationUsers:members,expiresAt:new Date(Date.now()+3600000)},{session});}
export async function callHistory(userId:string,connectionId:string):Promise<CallPage>{
 await connection(userId,connectionId,undefined,false);
 const found=await calls().find({connectionId,members:userId}).sort({createdAt:-1,_id:-1}).limit(20).toArray();
 return {items:found.map(view),active:found.find(row=>row.active)?.status==='ended'?null:found.find(row=>row.active)?view(found.find(row=>row.active)!):null};
}
export async function incomingCall(userId:string){
 const row=await calls().find({calleeId:userId,active:true,status:'waiting'}).sort({createdAt:-1,_id:-1}).limit(1).next();
 if(!row)return null;try{await connection(userId,row.connectionId);return view(row);}catch{return null;}
}
export async function activeCall(userId:string){
 const row=await calls().find({members:userId,active:true}).sort({createdAt:-1,_id:-1}).limit(1).next();
 if(!row)return {call:null,otherName:''};
 try{await connection(userId,row.connectionId);}catch{return {call:null,otherName:''};}
 const other=await users().findOne({_id:row.callerId===userId?row.calleeId:row.callerId},{projection:{handle:1,name:1}});
 return {call:view(row),otherName:other?.handle?`@${other.handle}`:String(other?.name||'your friend')};
}
export async function startCall(userId:string,connectionId:string){
 if(!liveMediaReady())throw new AppError(503,'calling_unavailable','Live calling is not available yet.');
 return transaction(async session=>{
  const {other,members}=await connection(userId,connectionId,session);
  const existing=await calls().findOne({connectionId,active:true},{session});if(existing)return view(existing);
  if(await calls().findOne({members:userId,active:true},{session,projection:{_id:1}}))throw new AppError(409,'call_active','End your current call before starting another.');
  const now=new Date().toISOString(),row:CallRow={_id:randomUUID(),connectionId,callerId:userId,calleeId:other,members,active:true,status:'waiting',createdAt:now};
  try{await calls().insertOne(row,{session});}catch(error){if((error as {code?:number}).code===11000)throw new AppError(409,'call_started','A call has already started in this conversation.');throw error;}
  if(await notificationEnabled(other,'call',session)){const noticeId=`call:${row._id}:${other}`;await rows('notifications').insertOne({_id:noticeId,userId:other,actorId:userId,connectionId,callId:row._id,kind:'call',text:'',readAt:null,createdAt:now},{session});await enqueueStoredPush(other,userId,connectionId,'call',noticeId,session);}
  await event(members,session);return view(row);
 });
}
export async function joinCall(userId:string,id:string){
 return transaction(async session=>{
  const row=requireValue(await calls().findOne({_id:id,calleeId:userId,active:true},{session}),'This call is no longer available.');
  await connection(userId,row.connectionId,session);
  if(row.status==='waiting'){
   const now=new Date().toISOString();await calls().updateOne({_id:id,active:true,status:'waiting'},{$set:{status:'connected',joinedAt:now}},{session});row.status='connected';row.joinedAt=now;
   await rows('notifications').updateOne({_id:`call:${id}:${userId}`},{$set:{readAt:now}},{session});await event(row.members,session);
  }
  return view(row);
 });
}
export async function endCall(id:string,userId?:string,outer?:ClientSession){
 const work=async(session:ClientSession)=>{
  const row=await calls().findOne({_id:id,active:true},{session});if(!row)return null;
  if(userId){if(!row.members.includes(userId))throw new AppError(404,'not_found','This call is unavailable.');await connection(userId,row.connectionId,session);}
  const now=new Date().toISOString();await calls().updateOne({_id:id,active:true},{$set:{active:false,status:'ended',endedAt:now,endedBy:userId||'system'}},{session});
  await event(row.members,session);await queueLiveMediaEffect('close',roomName(id),session);return {...view(row),status:'ended' as const,endedAt:now,endedBy:userId||'system'};
 };
 return outer?work(outer):transaction(work);
}
export async function endCallForConnection(connectionId:string,session?:ClientSession){const row=await calls().findOne({connectionId,active:true},{session});if(row)await endCall(row._id,undefined,session);}
export async function callAccess(userId:string,id:string):Promise<CallAccess>{
 const row=requireValue(await calls().findOne({_id:id,active:true}),'This call is no longer available.');
 if(!row.members.includes(userId))throw new AppError(404,'not_found','This call is unavailable.');
 await connection(userId,row.connectionId);
 if(row.status!=='connected')throw new AppError(409,'call_join','Wait for the other person to answer before opening video.');
 const service=liveRoomService();await service.createRoom({name:roomName(id),maxParticipants:2,emptyTimeout:120,departureTimeout:20});
 const owner=requireValue(await users().findOne({_id:userId},{projection:{handle:1,name:1}}));
 const token=new AccessToken(config.LIVEKIT_API_KEY,config.LIVEKIT_API_SECRET,{identity:userId,name:owner.handle?`@${owner.handle}`:String(owner.name||'Member'),ttl:'2m'});
 token.addGrant({roomJoin:true,room:roomName(id),canPublish:true,canPublishSources:[TrackSource.CAMERA,TrackSource.MICROPHONE],canSubscribe:true,canPublishData:false});
 return {url:config.LIVEKIT_PUBLIC_URL,token:await token.toJwt(),call:view(row)};
}
export async function callWebhook(event:{event:string;room?:{name?:string};participant?:{identity?:string}}){
 const prefix=`${config.APP_ENV}:call:`,name=event.room?.name;
 if(!name?.startsWith(prefix))return;
 if(event.event==='participant_left'||event.event==='room_finished')await endCall(name.slice(prefix.length));
}
