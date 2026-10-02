import {randomUUID} from 'node:crypto';
import type {ClientSession} from 'mongodb';
import {rows,transaction} from './db';
import {users,hash} from './auth';
import {enqueueStoredPush} from './push';
import {isPersonHidden} from './peopleHides';
import {embed} from './search/embeddings';
import {matchNotificationRules} from './search/backend';
import type {NotificationRuleInput} from '../shared/notificationSettings';

type EventKind='talk_open'|'talk_first_live'|'post_create'|'post_reply'|'circle_new';
interface EventRow {_id:string;kind:EventKind;actorId:string;resourceId:string;recipientId?:string;parentId?:string;rootId?:string;mutualCount?:number;stage:number;cursor:string;vector?:number[];status:'queued'|'working'|'done';availableAt:number;lease?:string;leaseUntil?:number;attempts:number;createdAt:string;expiresAt?:Date}
interface RuleRow {_id:string;userId:string;kind:NotificationRuleInput['kind'];rule:NotificationRuleInput;enabled:boolean;createdAt:string;indexedAt?:string}
const events=()=>rows<EventRow>('notificationEvents'),rules=()=>rows<RuleRow>('notificationRules');
export async function enqueueNotificationEvent(kind:EventKind,actorId:string,resourceId:string,session:ClientSession,extra:Partial<Pick<EventRow,'recipientId'|'parentId'|'rootId'|'mutualCount'>>={}){
 const id=`${kind}:${resourceId}:${extra.recipientId||''}${kind==='circle_new'?`:${extra.mutualCount||0}`:''}`;
 await events().updateOne({_id:id},{$setOnInsert:{kind,actorId,resourceId,...extra,stage:0,cursor:'',status:'queued',availableAt:Date.now(),attempts:0,createdAt:new Date().toISOString()}},{upsert:true,session});
}
async function authorized(userId:string,event:EventRow){
 if(userId===event.actorId||!await users().findOne({_id:userId,handle:{$type:'string'},suspendedAt:null},{projection:{_id:1}}))return false;
 if(await rows('blocks').findOne({members:{$all:[userId,event.actorId]}},{projection:{_id:1}}))return false;
 if(await isPersonHidden(userId,event.actorId))return false;
 if(event.kind.startsWith('talk')){
  if(await rows('spacePresence').findOne({userId},{projection:{_id:1}}))return false;
  if(await rows('spaceRemovals').findOne({spaceId:event.resourceId,userId},{projection:{_id:1}}))return false;
 }
 return true;
}
export async function deliverDirectAlert(userId:string,actorId:string,resourceType:'space'|'post'|'person'|'log'|'credits'|'storage'|'agents'|'account',resourceId:string,title:string,text:string,eventKey:string,photoId?:string,ruleId?:string){
 await transaction(async session=>{
  if(ruleId&&!await rows('notificationRules').findOne({_id:ruleId,userId,enabled:true},{session,projection:{_id:1}}))return;
  const id=hash(`alert:${userId}:${eventKey}`),now=new Date().toISOString();
  const inserted=await rows('notifications').updateOne({_id:id},{$setOnInsert:{userId,actorId,kind:'alert',alertType:eventKey.split(':')[0],ruleId,resourceType,resourceId,...(resourceType==='person'?{pairId:[userId,actorId].sort().join(':')}:{}) ,title,text,...(photoId?{photoId}:{}),readAt:null,createdAt:now}},{upsert:true,session});
  if(!inserted.upsertedCount)return;
  await enqueueStoredPush(userId,actorId,resourceId,'alert',id,session);
  await rows('recordEvents').insertOne({_id:randomUUID(),userIds:[userId],payload:{keys:['notifications']},notificationUsers:[userId],expiresAt:new Date(Date.now()+3600000)},{session});
 });
}
async function deliver(event:EventRow,userId:string,ruleId:string|undefined,actorName:string,photoId:string|undefined){
 if(!await authorized(userId,event))return;
 let resourceType:'space'|'post'|'person',title:string,text='';
 if(event.kind==='talk_open'){resourceType='space';title=`${actorName} opened a Talk`;}
 else if(event.kind==='talk_first_live'){resourceType='space';title='A Talk just opened';}
 else if(event.kind==='post_create'){resourceType='post';title=`${actorName} posted`;}
 else if(event.kind==='post_reply'){resourceType='post';title='New reply in a thread you watch';}
 else{resourceType='person';title=`${actorName} is in your Circle`;text=`${event.mutualCount||1} mutual friend${event.mutualCount===1?'':'s'}`;}
 if(resourceType==='space'){
  const source=await rows('spaces').findOne({_id:event.resourceId,status:'live'},{projection:{title:1,hostId:1}});if(!source||source.hostId!==event.actorId)return;text=String(source.title);
 }else if(resourceType==='post'){
  const source=await rows('posts').findOne({_id:event.resourceId,userId:event.actorId,deletedAt:{$exists:false},moderatedAt:{$exists:false}},{projection:{text:1}});if(!source)return;text=String(source.text||'').slice(0,180);
 }else{
  const pair=[userId,event.actorId].sort().join(':');if(!await users().findOne({_id:event.actorId,discoverable:true,suspendedAt:null},{projection:{_id:1}}))return;
  const summary=await rows('circlePairs').findOne({_id:pair,mutualCount:{$gte:event.mutualCount||1}},{projection:{previewIds:1,mutualCount:1}});if(!summary)return;
  const ids=(summary.previewIds as string[]||[]).slice(0,3),friends=await users().find({_id:{$in:ids},suspendedAt:null},{projection:{handle:1,name:1}}).limit(ids.length).toArray(),connections=await rows('connections').find({_id:{$in:ids.map(id=>[userId,id].sort().join(':'))},status:'accepted'},{projection:{_id:1}}).limit(ids.length).toArray(),blocks=await rows('blocks').find({pairId:{$in:ids.map(id=>[userId,id].sort().join(':'))}},{projection:{pairId:1}}).limit(ids.length).toArray();
  const connected=new Set(connections.map(item=>item._id)),blocked=new Set(blocks.map(item=>item.pairId)),names=ids.flatMap(id=>{const person=friends.find(item=>item._id===id),pair=[userId,id].sort().join(':');return person&&connected.has(pair)&&!blocked.has(pair)?[person.handle?`@${person.handle}`:String(person.name||'Friend')]:[]});
  const count=Number(summary.mutualCount);text=`${count} mutual friend${count===1?'':'s'}${names.length?`: ${names.join(', ')}`:''}`;
 }
 await deliverDirectAlert(userId,event.actorId,resourceType,event.resourceId,title,text,`${resourceType}:${event.resourceId}`,photoId,ruleId);
}
export async function processNotificationEvent(){
 const lease=randomUUID(),now=Date.now();
 const event=await events().findOneAndUpdate({$or:[{status:'queued',availableAt:{$lte:now}},{status:'working',leaseUntil:{$lte:now}}]},{$set:{status:'working',lease,leaseUntil:now+60000},$inc:{attempts:1}},{sort:{createdAt:1,_id:1},returnDocument:'after'});
 if(!event)return;
 try{
  const actor=await users().findOne({_id:event.actorId,suspendedAt:null},{projection:{handle:1,name:1,photos:1}});
  if(!actor){await events().updateOne({_id:event._id,lease},{$set:{status:'done',expiresAt:new Date(Date.now()+86400000)},$unset:{lease:'',leaseUntil:''}});return;}
  const actorName=actor.handle?`@${actor.handle}`:String(actor.name||'Someone'),photoId=actor.photos?.[0];
  if(event.stage===1){
   const kind=event.kind==='talk_open'?'talk_topic':'post_topic';
   if(!await rules().findOne({kind,enabled:true,createdAt:{$lte:event.createdAt}},{projection:{_id:1}})){await events().updateOne({_id:event._id,lease},{$set:{status:'done',expiresAt:new Date(Date.now()+86400000)},$unset:{lease:'',leaseUntil:''}});return;}
   if(await rules().findOne({kind,enabled:true,createdAt:{$lte:event.createdAt},indexedAt:{$exists:false}},{projection:{_id:1}})){await events().updateOne({_id:event._id,lease},{$set:{status:'queued',availableAt:Date.now()+10000},$unset:{lease:'',leaseUntil:''}});return;}
   const source=event.kind==='talk_open'?await rows('spaces').findOne({_id:event.resourceId,status:'live'},{projection:{title:1,description:1}}):await rows('posts').findOne({_id:event.resourceId,deletedAt:{$exists:false},moderatedAt:{$exists:false}},{projection:{text:1}});
   if(!source){await events().updateOne({_id:event._id,lease},{$set:{status:'done',expiresAt:new Date(Date.now()+86400000)},$unset:{lease:'',leaseUntil:''}});return;}
   const text=event.kind==='talk_open'?`title: ${String(source.title)}\ndescription: ${String(source.description||'')}`:String(source.text||'');
   const vector=event.vector||await embed(text,'document');if(!event.vector)await events().updateOne({_id:event._id,lease},{$set:{vector}});
   const offset=Number(event.cursor)||0,matches=await matchNotificationRules(kind,vector,offset,50);
   const current=await rules().find({_id:{$in:matches.map(item=>item.id)},kind,enabled:true},{projection:{userId:1,rule:1,createdAt:1,indexedAt:1}}).limit(matches.length).toArray(),byId=new Map(current.map(row=>[row._id,row]));
   for(const match of matches){const rule=byId.get(match.id);if(!rule||!rule.indexedAt||rule.createdAt>event.createdAt||!('minScore'in rule.rule)||match.score<rule.rule.minScore)continue;await deliver(event,rule.userId,rule._id,actorName,photoId);}
   await events().updateOne({_id:event._id,lease},matches.length<50?{$set:{status:'done',expiresAt:new Date(Date.now()+86400000)},$unset:{lease:'',leaseUntil:''}}:{$set:{status:'queued',cursor:String(offset+matches.length),availableAt:Date.now()},$unset:{lease:'',leaseUntil:''}});return;
  }
  const filter=event.kind==='talk_open'?{kind:'talk_person',personId:event.actorId,enabled:true}:event.kind==='post_create'?{kind:'post_person',personId:event.actorId,enabled:true}:event.kind==='post_reply'?{kind:'thread_activity',postId:{$in:[event.parentId,event.rootId].filter(Boolean)},enabled:true}:event.kind==='circle_new'?{kind:'circle_new',userId:event.recipientId,enabled:true}:{_id:{$gt:event.cursor}};
  if(event.kind==='talk_first_live'){
   const page=await rows('notificationSettings').find({'types.talk_first_live':true,...(event.cursor?{_id:{$gt:event.cursor}}:{})},{projection:{_id:1}}).sort({_id:1}).limit(50).toArray();
   for(const row of page)await deliver(event,row._id,undefined,actorName,photoId);
   await events().updateOne({_id:event._id,lease},page.length<50?{$set:{status:'done',expiresAt:new Date(Date.now()+86400000)},$unset:{lease:'',leaseUntil:''}}:{$set:{status:'queued',cursor:page.at(-1)!._id,availableAt:Date.now()},$unset:{lease:'',leaseUntil:''}});return;
  }
  const page=await rules().find({...filter,...(event.cursor?{_id:{$gt:event.cursor}}:{})} as Record<string,unknown>).sort({_id:1}).limit(50).toArray();
  for(const rule of page){if(rule.createdAt>event.createdAt)continue;if(event.kind==='circle_new'&&rule.rule.kind==='circle_new'&&(event.mutualCount||0)<rule.rule.minMutuals)continue;await deliver(event,rule.userId,rule._id,actorName,photoId);}
  const topic=event.kind==='talk_open'||event.kind==='post_create';
  await events().updateOne({_id:event._id,lease},page.length<50?topic?{$set:{status:'queued',stage:1,cursor:'',availableAt:Date.now()},$unset:{lease:'',leaseUntil:''}}:{$set:{status:'done',expiresAt:new Date(Date.now()+86400000)},$unset:{lease:'',leaseUntil:''}}:{$set:{status:'queued',cursor:page.at(-1)!._id,availableAt:Date.now()},$unset:{lease:'',leaseUntil:''}});
 }catch(error){await events().updateOne({_id:event._id,lease},{$set:{status:'queued',availableAt:Date.now()+Math.min(3600000,1000*2**Math.min(event.attempts,10))},$unset:{lease:'',leaseUntil:''}});console.error('Notification event:',error instanceof Error?error.name:'Error');}
}
export function startNotificationWorker(){let stopped=false,running:Promise<unknown>|undefined;const tick=()=>{if(stopped||running)return;running=processNotificationEvent().catch(error=>console.error('Notification worker:',error instanceof Error?error.name:'Error')).finally(()=>{running=undefined;});};tick();const timer=setInterval(tick,1000);return async()=>{stopped=true;clearInterval(timer);await running;};}
