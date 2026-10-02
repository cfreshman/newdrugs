import {randomBytes,randomUUID} from 'node:crypto';
import type {ClientSession} from 'mongodb';
import {users,hash} from './auth';
import {rows} from './db';
import {AppError,requireValue} from './errors';
import type {AgentAccess} from '../shared/agentAccess';
import {notificationEnabled} from './notificationSettings';
import {enqueueStoredPush} from './push';
export interface AgentToken {_id:string;userId:string;hash:string;name:string;scope:'read'|'write';createdAt:string;expiresAt:Date|null;revokedAt:string|null}
/** Serialize issuance for this owner so every path shares the 20-connection cap. */
export async function insertAgentToken(userId:string,access:AgentAccess,session:ClientSession,prepared?:{id:string;hash:string}){
 const owner=requireValue(await users().findOne({_id:userId},{session}),'Your session has expired.');
 if(owner.suspendedAt)throw new AppError(403,'account_suspended','This account is suspended.');
 if(!owner.handle)throw new AppError(403,'account_required','Save your account before connecting an agent.');
 await users().updateOne({_id:userId},{$inc:{credentialRevision:1}},{session});
 if(await rows('tokens').countDocuments({userId,revokedAt:null},{session})>=20)throw new AppError(422,'token_limit','Revoke an old connection first.');
 const token=prepared?undefined:`nd_${randomBytes(32).toString('base64url')}`;
 const now=Date.now(),record:AgentToken={_id:prepared?.id||randomUUID(),userId,hash:prepared?.hash||hash(token!),name:access.name,scope:access.scope,createdAt:new Date(now).toISOString(),expiresAt:access.expiresInDays===null?null:new Date(now+access.expiresInDays*86400000),revokedAt:null};
 await rows<AgentToken>('tokens').insertOne(record,{session});
 if(await notificationEnabled(userId,'security_credential',session)){
  const noticeId=hash(`security_credential:${record._id}`);
  await rows('notifications').insertOne({_id:noticeId,userId,actorId:userId,kind:'alert',alertType:'security_credential',resourceType:'agents',resourceId:userId,title:`New connected agent: ${record.name}`,text:'',readAt:null,createdAt:record.createdAt},{session});
  await enqueueStoredPush(userId,userId,userId,'alert',noticeId,session);
  await rows('recordEvents').insertOne({_id:randomUUID(),userIds:[userId],payload:{keys:['notifications']},notificationUsers:[userId],expiresAt:new Date(Date.now()+3600000)},{session});
 }
 return {record,token};
}
