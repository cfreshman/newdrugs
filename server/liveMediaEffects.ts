import {randomUUID} from 'node:crypto';
import {TrackSource} from '@livekit/protocol';
import {RoomServiceClient} from 'livekit-server-sdk';
import type {ClientSession} from 'mongodb';
import {config} from './config';
import {rows} from './db';

type EffectKind='close'|'speaker'|'remove';
interface Effect {_id:string;kind:EffectKind;room:string;spaceId?:string;personId?:string;availableAt:number;lease?:string;leaseUntil?:number;attempts:number}
export async function queueLiveMediaEffect(kind:EffectKind,room:string,session:ClientSession,spaceId?:string,personId?:string){
 await rows<Effect>('liveMediaEffects').insertOne({_id:randomUUID(),kind,room,...(spaceId?{spaceId}:{}),...(personId?{personId}:{}),availableAt:Date.now(),attempts:0},{session});
}
const service=()=>new RoomServiceClient(config.LIVEKIT_URL,config.LIVEKIT_API_KEY,config.LIVEKIT_API_SECRET,{requestTimeout:5000});
const unavailable=(error:unknown)=>{const value=error as {code?:string|number;message?:string};return value.code==='not_found'||value.code===5||/not found|does not exist/i.test(value.message||'');};
async function apply(effect:Effect){
 if(!config.LIVEKIT_URL||!config.LIVEKIT_API_KEY||!config.LIVEKIT_API_SECRET)throw Error('Live media is not configured.');
 const rooms=service();
 try{
  if(effect.kind==='close'){await rooms.deleteRoom(effect.room);return;}
  const space=await rows('spaces').findOne({_id:effect.spaceId},{projection:{status:1,speakerIds:1}});
  if(!space||space.status!=='live')return;
  if(effect.kind==='remove'){
   if(await rows('spaceRemovals').findOne({_id:`${effect.spaceId}:${effect.personId}`}))await rooms.removeParticipant(effect.room,effect.personId!,{revokeTokenTs:BigInt(Math.floor(Date.now()/1000))});
   return;
  }
  const speaker=(space.speakerIds as string[]||[]).includes(effect.personId!);
  await rooms.updateParticipant(effect.room,effect.personId!,{permission:{canPublish:speaker,canSubscribe:true,canPublishData:false,canPublishSources:speaker?[TrackSource.MICROPHONE]:[]}});
 }catch(error){if(!unavailable(error))throw error;}
}
let running=false;
export async function processLiveMediaEffects(limit=8){
 if(running)return;running=true;
 try{for(let count=0;count<limit;count++){
  const now=Date.now(),lease=randomUUID();
  const effect=await rows<Effect>('liveMediaEffects').findOneAndUpdate({availableAt:{$lte:now},$or:[{leaseUntil:{$lte:now}},{leaseUntil:{$exists:false}}]},{$set:{lease,leaseUntil:now+20000}},{sort:{availableAt:1,_id:1},returnDocument:'after'});
  if(!effect)break;
  try{await apply(effect);await rows('liveMediaEffects').deleteOne({_id:effect._id,lease});}
  catch(error){console.error('Live media update:',error instanceof Error?error.name:'Error');const attempts=effect.attempts+1;await rows('liveMediaEffects').updateOne({_id:effect._id,lease},{$set:{attempts,availableAt:Date.now()+Math.min(300000,1000*2**Math.min(attempts,8)),leaseUntil:0}});}
 }}finally{running=false;}
}
export function startLiveMediaEffectWorker(){const timer=setInterval(()=>void processLiveMediaEffects().catch(error=>console.error('Live media queue:',error instanceof Error?error.name:'Error')),1000);return async()=>{clearInterval(timer);};}
