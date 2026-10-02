import {randomUUID} from 'node:crypto';
import type {ClientSession} from 'mongodb';
import {rows} from './db';
import {users,hash} from './auth';
import {AppError,requireValue} from './errors';
import {isPersonHidden} from './peopleHides';
import {notificationType,notificationRule,existingNotificationTypes,type NotificationType,type NotificationRuleInput} from '../shared/notificationSettings';

interface SettingsRow {_id:string;types?:Partial<Record<NotificationType,boolean>>}
interface RuleRow {_id:string;userId:string;rule:NotificationRuleInput;signature:string;kind:NotificationRuleInput['kind'];personId?:string;postId?:string;enabled:boolean;revision:number;createdAt:string;indexedAt?:string;nextAt?:number;cursor?:string;dateKey?:string;armed?:boolean;alertEpoch?:number}
const settings=()=>rows<SettingsRow>('notificationSettings'),rules=()=>rows<RuleRow>('notificationRules');
const output=(row:RuleRow)=>({id:row._id,rule:row.rule,enabled:row.enabled,revision:row.revision,createdAt:row.createdAt,...(['talk_topic','post_topic'].includes(row.kind)?{indexing:!row.indexedAt}:{})});
export async function notificationEnabled(userId:string,type:NotificationType,session?:ClientSession){
 const row=await settings().findOne({_id:userId},{session});return row?.types?.[type]??existingNotificationTypes.includes(type);
}
export async function notificationPreferences(userId:string,session?:ClientSession){
 const row=await settings().findOne({_id:userId},{session});return {items:notificationType.options.map(type=>({type,enabled:row?.types?.[type]??existingNotificationTypes.includes(type)}))};
}
export async function setNotificationPreference(userId:string,type:NotificationType,enabled:boolean,session?:ClientSession){
 await settings().updateOne({_id:userId},{$set:{[`types.${type}`]:enabled}},{upsert:true,session});
 return {type,enabled};
}
async function validateRule(userId:string,rule:NotificationRuleInput,session?:ClientSession){
 if('timeZone'in rule)try{new Intl.DateTimeFormat('en-US',{timeZone:rule.timeZone});}catch{throw new AppError(422,'notification_timezone','Choose a valid time zone.');}
 if('personId'in rule){
  if(rule.personId===userId)throw new AppError(422,'notification_self','Choose another person to watch.');
  requireValue(await users().findOne({_id:rule.personId,handle:{$type:'string'},suspendedAt:null},{session,projection:{_id:1}}),'This person is unavailable.');
  if(await rows('blocks').findOne({members:{$all:[userId,rule.personId]}},{session})||await isPersonHidden(userId,rule.personId,session))throw new AppError(404,'not_found','This person is unavailable.');
 }
 if('postId'in rule){
  const post=requireValue(await rows('posts').findOne({_id:rule.postId,deletedAt:{$exists:false},moderatedAt:{$exists:false}},{session,projection:{userId:1}}),'This post is unavailable.');
  if(await rows('blocks').findOne({members:{$all:[userId,post.userId]}},{session}))throw new AppError(404,'not_found','This post is unavailable.');
 }
}
export async function createNotificationRule(userId:string,input:unknown,session?:ClientSession){
 const rule=notificationRule.parse(input);await validateRule(userId,rule,session);
 const signature=hash(`${userId}:${JSON.stringify(rule)}`);
 if(await rules().findOne({userId,signature},{session,projection:{_id:1}}))throw new AppError(409,'notification_rule_exists','This notification watch already exists.');
 const scheduled=['birthday','anniversary','credit_low','storage_high'].includes(rule.kind);
 const row:RuleRow={_id:randomUUID(),userId,rule,signature,kind:rule.kind,...('personId'in rule?{personId:rule.personId}:{}),...('postId'in rule?{postId:rule.postId}:{}),enabled:true,revision:1,createdAt:new Date().toISOString(),...(scheduled?{nextAt:Date.now(),cursor:'',armed:true,alertEpoch:0}:{})};
 try{await rules().insertOne(row,{session});}catch(error){if((error as {code?:number}).code===11000)throw new AppError(409,'notification_rule_exists','This notification watch already exists.');throw error;}
 if(rule.kind==='talk_topic'||rule.kind==='post_topic')await rows('notificationRuleJobs').updateOne({_id:row._id},{$set:{action:'upsert',availableAt:Date.now(),attempts:0}},{upsert:true,session});
 return output(row);
}
export async function listNotificationRules(userId:string,before?:string,session?:ClientSession){
 let cursor:{at:string;id:string}|null=null;if(before)try{const value=JSON.parse(Buffer.from(before,'base64url').toString());if(typeof value.at!=='string'||typeof value.id!=='string')throw Error();cursor=value;}catch{throw new AppError(422,'notification_cursor','Reload notification settings.');}
 const found=await rules().find({userId,...(cursor?{$or:[{createdAt:{$lt:cursor.at}},{createdAt:cursor.at,_id:{$lt:cursor.id}}]}:{})},{session}).sort({createdAt:-1,_id:-1}).limit(31).toArray();
 const page=found.slice(0,30),personIds=page.flatMap(row=>'personId'in row.rule?[row.rule.personId]:[]),people=await users().find({_id:{$in:personIds}},{session,projection:{handle:1,name:1}}).limit(personIds.length).toArray(),names=new Map(people.map(person=>[person._id,person.handle?`@${person.handle}`:String(person.name||'Member')]));
 return {items:page.map(row=>({...output(row),...('personId'in row.rule?{targetName:names.get(row.rule.personId)||'Member'}:{})})),nextCursor:found.length>30?Buffer.from(JSON.stringify({at:found[29].createdAt,id:found[29]._id})).toString('base64url'):null};
}
export async function setNotificationRule(userId:string,id:string,revision:number,enabled:boolean,session?:ClientSession){
 const row=requireValue(await rules().findOne({_id:id,userId},{session}),'This notification rule is unavailable.');
 if(row.revision!==revision)throw new AppError(409,'notification_rule_changed','Read the current notification rule before changing it.');
 const updated=await rules().findOneAndUpdate({_id:id,userId,revision},{$set:{enabled,...(enabled&&['birthday','anniversary','credit_low','storage_high'].includes(row.kind)?{nextAt:Date.now()}:{} )},$inc:{revision:1}},{session,returnDocument:'after'});
 if(!updated)throw new AppError(409,'notification_rule_changed','Read the current notification rule before changing it.');return output(updated);
}
export async function deleteNotificationRule(userId:string,id:string,revision:number,session?:ClientSession){
 const row=await rules().findOne({_id:id,userId,revision},{session});if(!row)throw new AppError(409,'notification_rule_changed','Read the current notification rule before deleting it.');
 const result=await rules().deleteOne({_id:id,userId,revision},{session});if(!result.deletedCount)throw new AppError(409,'notification_rule_changed','Read the current notification rule before deleting it.');
 if(row.kind==='talk_topic'||row.kind==='post_topic')await rows('notificationRuleJobs').updateOne({_id:id},{$set:{action:'delete',availableAt:Date.now(),attempts:0}},{upsert:true,session});
 return {deleted:true,id};
}
