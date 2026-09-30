import {randomBytes,randomInt,randomUUID,createHash} from 'node:crypto';
import {rows,transaction} from './db';
import {hash,currentUser,type Actor} from './auth';
import {AppError,requireValue} from './errors';
import {config} from './config';
import {insertAgentToken,type AgentToken} from './agentTokens';
import {normalizeUserCode,type AgentAccess,type DevicePreview,type DeviceStart,type DeviceToken} from '../shared/agentAccess';
export const DEVICE_SECONDS=600,DEVICE_INTERVAL=5;
interface DeviceLogin {_id:string;userCodeHash:string;userCode:string;name:string;scope:'read'|'write';status:'pending'|'approved'|'denied';createdAt:Date;expiresAt:Date;interval:number;nextPollAt:Date;tokenId:string;tokenHash:string;userId?:string}
const devices=()=>rows<DeviceLogin>('deviceLogins');
const tokenFor=(secret:string)=>`nd_${createHash('sha256').update('newdrugs-device-token-v1\0').update(secret).digest('base64url')}`;
const alphabet='BCDFGHJKLMNPQRSTVWXZ23456789';
const preview=(row:DeviceLogin):DevicePreview=>({userCode:row.userCode,name:row.name,scope:row.scope,status:row.status,expiresAt:row.expiresAt.toISOString()});
export async function startDeviceLogin(input:{name:string;scope:'read'|'write'}):Promise<DeviceStart>{
 for(let attempt=0;attempt<5;attempt++){
  const secret=randomBytes(32).toString('base64url'),plain=Array.from({length:8},()=>alphabet[randomInt(alphabet.length)]).join(''),userCode=`${plain.slice(0,4)}-${plain.slice(4)}`,now=Date.now();
  const row:DeviceLogin={_id:hash(secret),userCodeHash:hash(userCode),userCode,...input,status:'pending',createdAt:new Date(now),expiresAt:new Date(now+DEVICE_SECONDS*1000),interval:DEVICE_INTERVAL,nextPollAt:new Date(now+DEVICE_INTERVAL*1000),tokenId:randomUUID(),tokenHash:hash(tokenFor(secret))};
  try{await devices().insertOne(row);}catch(error){if((error as {code?:number}).code===11000)continue;throw error;}
  const uri=new URL('/agents/device',config.uiOrigin);return {device_code:secret,user_code:userCode,verification_uri:uri.href,verification_uri_complete:`${uri.href}?code=${encodeURIComponent(userCode)}`,expires_in:DEVICE_SECONDS,interval:DEVICE_INTERVAL};
 }
 throw new AppError(503,'device_unavailable','Try connecting again shortly.');
}
async function savedBrowser(actor:Actor){if(actor.source!=='browser')throw new AppError(403,'browser_only','Approve agent access in the app.');const owner=await currentUser(actor.userId);if(!owner.handle)throw new AppError(403,'account_required','Save your account before connecting an agent.');}
function codeHash(value:string){const code=normalizeUserCode(value);if(!code)throw new AppError(400,'device_code','Enter the code shown by your agent.');return hash(code);}
export async function readDeviceLogin(actor:Actor,userCode:string){
 await savedBrowser(actor);const row=requireValue(await devices().findOne({userCodeHash:codeHash(userCode),expiresAt:{$gt:new Date()}}),'This login request expired or is unavailable.');
 if(row.userId&&row.userId!==actor.userId)throw new AppError(404,'device_unavailable','This login request is unavailable.');return preview(row);
}
export async function decideDeviceLogin(actor:Actor,userCode:string,decision:'approve'|'deny',access?:AgentAccess){
 await savedBrowser(actor);
 return transaction(async session=>{
  const row=requireValue(await devices().findOne({userCodeHash:codeHash(userCode),expiresAt:{$gt:new Date()},status:'pending'},{session}),'This login request expired or was already decided.');
  if(decision==='approve'){
   if(!access)throw new AppError(400,'access','Choose permissions and expiration.');
   row.name=access.name;row.scope=access.scope;row.userId=actor.userId;
  }
  row.status=decision==='approve'?'approved':'denied';await devices().replaceOne({_id:row._id},row,{session});
  if(decision==='approve')await insertAgentToken(actor.userId,access!,session,{id:row.tokenId,hash:row.tokenHash});return preview(row);
 });
}
export type DevicePoll=DeviceToken|{error:'authorization_pending'|'slow_down'|'access_denied'|'expired_token';interval?:number};
/** The device secret and bearer token are never persisted in plaintext. */
export async function pollDeviceLogin(secret:string):Promise<DevicePoll>{
 if(!/^[A-Za-z0-9_-]{43}$/.test(secret))return {error:'expired_token'};
 const result=await transaction(async session=>{
  const row=await devices().findOne({_id:hash(secret)},{session}),now=Date.now();
  if(!row||row.expiresAt.getTime()<=now)return {error:'expired_token'} as const;
  if(row.status==='denied')return {error:'access_denied'} as const;
  const early=row.nextPollAt.getTime()>now,interval=row.interval+(early?5:0);
  await devices().updateOne({_id:row._id},{$set:{interval,nextPollAt:new Date(now+interval*1000)}},{session});
  if(early)return {error:'slow_down',interval} as const;
  if(row.status==='pending')return {error:'authorization_pending',interval} as const;
  const credential=await rows<AgentToken>('tokens').findOne({_id:row.tokenId,userId:row.userId,hash:row.tokenHash,revokedAt:null,$or:[{expiresAt:null},{expiresAt:{$gt:new Date(now)}}]},{session});
  if(!credential)return {error:'access_denied'} as const;
  return {credential};
 });
 if(!result.credential)return result as DevicePoll;
 const credential=result.credential;
 try{await currentUser(credential.userId);}catch{return {error:'access_denied'};}
 return {access_token:tokenFor(secret),token_type:'Bearer',scope:credential.scope,...(credential.expiresAt?{expires_in:Math.max(0,Math.floor((credential.expiresAt.getTime()-Date.now())/1000))}:{})};
}
