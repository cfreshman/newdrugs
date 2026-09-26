import type { ClientSession } from 'mongodb';
import { rows } from './db';
import { hash, users } from './auth';
import { enqueueAutomationPush } from './push';
export async function automationNotice(userId:string, automationId:string, key:string, title:string, text:string, session?:ClientSession) {
  const id='automation:'+hash(`${automationId}:${key}`),now=new Date().toISOString();
  const inserted=await rows('notifications').updateOne({_id:id},{$setOnInsert:{userId,actorId:userId,kind:'automation_status',automationId,title,text,readAt:null,createdAt:now}},{session,upsert:true});
  if(inserted.upsertedCount&&await users().findOne({_id:userId,inboxPushEnabled:true},{session}))await enqueueAutomationPush(userId,id,automationId,session);
}
