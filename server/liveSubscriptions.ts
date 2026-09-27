import {randomUUID} from 'node:crypto';
import type {Request,Response} from 'express';
import {rows} from './db';
import {browserActor} from './auth';
import {AppError} from './errors';
export const liveInstance=randomUUID();
export interface LiveLease {_id:string;userId:string;sessionId:string;channel:string;connectionId:string;instance:string;keys:string[]|null;expiresAt:Date}
export const liveLeases=()=>rows<LiveLease>('liveSubscriptions');
export function recordKeys(value:unknown):string[]|null {
 if(value===undefined||value===null)return null;
 const keys=typeof value==='string'?value.split(','):Array.isArray(value)?value:[];
 return [...new Set(keys.filter((key):key is string=>typeof key==='string'&&/^[a-z_]{1,40}$/.test(key)))].slice(0,32);
}
export async function acquireLiveLease(userId:string,sessionId:string,channel:string,keys:string[]|null){
 const connectionId=randomUUID();
 for(let slot=0;slot<8;slot++){
  try{const lease=await liveLeases().findOneAndUpdate({_id:`${userId}:${slot}`,$or:[{expiresAt:{$lte:new Date()}},{channel}]},{$set:{userId,sessionId,channel,connectionId,instance:liveInstance,keys,expiresAt:new Date(Date.now()+180000)}},{upsert:true,returnDocument:'after'});if(lease)return lease;}
  catch(error){if((error as {code?:number}).code!==11000)throw error;}
 }
 throw new AppError(429,'live_limit','Too many live connections for this account.');
}
export async function updateLiveInterests(req:Request,res:Response){
 const actor=browserActor(req),channel=String(req.body?.channel||'');
 if(!/^[a-zA-Z0-9-]{1,100}$/.test(channel))throw new AppError(422,'live_channel','Invalid connection.');
 await liveLeases().updateOne({userId:actor.userId,channel,expiresAt:{$gt:new Date()}},{$set:{keys:recordKeys(req.body?.keys)||[]}});res.json({ok:true});
}
