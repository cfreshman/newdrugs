import {randomUUID} from 'node:crypto';
import type {ClientSession} from 'mongodb';
import {rows} from './db';
import {users,type Actor,type User} from './auth';
import {AppError,requireValue} from './errors';
import {notificationEnabled} from './notificationSettings';
import {enqueueStoredPush} from './push';
import type {IouEntry,IouSummary} from '../shared/ious';

interface Ledger {_id:string;members:[string,string];balanceCents:number;revision:number;createdAt:string;updatedAt:string;lastEntryId?:string}
interface Entry extends Omit<IouEntry,'id'> {_id:string}
const ledgers=()=>rows<Ledger>('iousLedgers'),entries=()=>rows<Entry>('iousEntries');
const pair=(a:string,b:string)=>[a,b].sort().join(':');
const label=(user:User)=>user.handle?`@${user.handle}`:user.name||'Someone';
const person=(user:User)=>({id:user._id,name:user.name||user.handle||'Member',...(user.handle?{handle:user.handle}:{}),...(user.photos?.[0]?{photoId:user.photos[0]}:{})});
const entryView=(row:Entry):IouEntry=>({id:row._id,pairId:row.pairId,actorId:row.actorId,kind:row.kind,debtorId:row.debtorId,creditorId:row.creditorId,amountCents:row.amountCents,reason:row.reason,balanceAfterCents:row.balanceAfterCents,createdAt:row.createdAt,revision:row.revision});
const balanceFor=(row:Ledger,userId:string)=>row.members[0]===userId?row.balanceCents:-row.balanceCents;
export function iouBalanceChange(actorIsFirst:boolean,currentCents:number,kind:'owe'|'settle',direction:'me_to_them'|'them_to_me',amountCents:number){
 const actorBalance=actorIsFirst?currentCents:-currentCents;
 if(kind==='settle'&&(direction==='me_to_them'?actorBalance>-amountCents:actorBalance<amountCents))throw new AppError(422,'ious_settlement','The settlement is more than this person currently owes in that direction.');
 const actorDelta=(direction==='them_to_me'?1:-1)*(kind==='owe'?1:-1)*amountCents,next=currentCents+(actorIsFirst?actorDelta:-actorDelta);
 if(!Number.isSafeInteger(next))throw new AppError(422,'ious_balance','This IOU balance is too large.');
 return next;
}
export function iouRecordTransition(actorIsFirst:boolean,currentCents:number,input:{kind:'owe'|'settle'|'payment';direction?:'me_to_them'|'them_to_me';amountCents?:number}){
 const actorBalance=actorIsFirst?currentCents:-currentCents;
 if(input.kind==='owe'){
  if(!input.direction||!input.amountCents)throw new AppError(422,'ious_amount','Choose who owes whom and an amount.');
  return {balanceCents:iouBalanceChange(actorIsFirst,currentCents,'owe',input.direction,input.amountCents),amountCents:input.amountCents,direction:input.direction};
 }
 if(input.direction||input.kind==='settle'&&input.amountCents!==undefined||input.kind==='payment'&&!input.amountCents)throw new AppError(422,'ious_amount','Settled up uses the full balance; partial payment needs an amount.');
 const outstanding=Math.abs(actorBalance);
 if(!outstanding)throw new AppError(422,'ious_settlement','This IOU is already settled.');
 const amountCents=input.kind==='settle'?outstanding:input.amountCents!;
 if(input.kind==='payment'&&amountCents>=outstanding)throw new AppError(422,'ious_settlement','Use Settled up for the full remaining balance.');
 const direction=actorBalance>0?'them_to_me':'me_to_them';
 return {balanceCents:iouBalanceChange(actorIsFirst,currentCents,'settle',direction,amountCents),amountCents,direction};
}
async function summary(row:Ledger,userId:string,personUser:User,last?:Entry|null):Promise<IouSummary>{return {person:person(personUser),balanceCents:balanceFor(row,userId),revision:row.revision,updatedAt:row.updatedAt,lastEntry:last?entryView(last):null};}
export async function listIous(userId:string,before?:string,session?:ClientSession){
 let cursor:{updatedAt:string;id:string}|undefined;try{if(before){const parsed=JSON.parse(Buffer.from(before,'base64url').toString());if(typeof parsed.updatedAt!=='string'||typeof parsed.id!=='string')throw Error();cursor=parsed;}}catch{throw new AppError(422,'ious_cursor','Start this IOU list again.');}
 const found=await ledgers().find({members:userId,...(cursor?{$or:[{updatedAt:{$lt:cursor.updatedAt}},{updatedAt:cursor.updatedAt,_id:{$lt:cursor.id}}]}:{})},{session}).sort({updatedAt:-1,_id:-1}).limit(31).toArray(),page=found.slice(0,30);
 const otherIds=page.map(row=>row.members.find(id=>id!==userId)!),people=await users().find({_id:{$in:otherIds}},{session,projection:{name:1,handle:1,photos:1}}).toArray(),lastIds=page.flatMap(row=>row.lastEntryId?[row.lastEntryId]:[]),last=lastIds.length?await entries().find({_id:{$in:lastIds}},{session}).toArray():[];
 return {items:await Promise.all(page.flatMap(row=>{const other=people.find(person=>person._id===row.members.find(id=>id!==userId));return other?[summary(row,userId,other,last.find(entry=>entry._id===row.lastEntryId))]:[];})),nextCursor:found.length>30?Buffer.from(JSON.stringify({updatedAt:page.at(-1)!.updatedAt,id:page.at(-1)!._id})).toString('base64url'):null};
}
export async function getIou(userId:string,personId:string,before?:number,session?:ClientSession){
 const other=requireValue(await users().findOne({_id:personId,handle:{$type:'string'}},{session,projection:{name:1,handle:1,photos:1,paymentHandles:1}}),'This person is unavailable.'),row=await ledgers().findOne({_id:pair(userId,personId),members:userId},{session});
 const allowed=Boolean((row||await rows('connections').findOne({_id:pair(userId,personId),status:'accepted'},{session,projection:{_id:1}}))&&!await rows('blocks').findOne({pairId:pair(userId,personId)},{session,projection:{_id:1}}));
 const paymentHandles=allowed?{venmo:other.paymentHandles?.venmo||'',cashApp:other.paymentHandles?.cashApp||''}:{venmo:'',cashApp:''};
 if(!row)return {person:person(other),balanceCents:0,revision:0,updatedAt:'',lastEntry:null,entries:[],nextCursor:null,paymentHandles};
 const found=await entries().find({pairId:row._id,...(before?{revision:{$lt:before}}:{})},{session}).sort({revision:-1}).limit(31).toArray(),page=found.slice(0,30),last=row.lastEntryId?await entries().findOne({_id:row.lastEntryId},{session}):null;
 return {...await summary(row,userId,other,last),entries:page.map(entryView),nextCursor:found.length>30?String(page.at(-1)!.revision):null,paymentHandles};
}
export async function recordIou(actor:Actor,input:{personId:string;kind:'owe'|'settle'|'payment';direction?:'me_to_them'|'them_to_me';amountCents?:number;revision?:number;reason:string},session:ClientSession){
 const actorUser=requireValue(await users().findOne({_id:actor.userId,handle:{$type:'string'},suspendedAt:null},{session}),'Save your account before recording an IOU.');
 if(input.personId===actor.userId)throw new AppError(422,'ious_self','Choose another person.');
 const other=requireValue(await users().findOne({_id:input.personId,handle:{$type:'string'},suspendedAt:null},{session}),'This person is unavailable.');
 const id=pair(actor.userId,input.personId),prior=await ledgers().findOne({_id:id},{session});
 if(input.kind==='settle'&&input.revision!==prior?.revision)throw new AppError(409,'ious_changed','This IOU changed. Read its current balance before settling up.');
 if(!prior){
  const connection=await rows('connections').findOne({_id:id,status:'accepted'},{session,projection:{_id:1}});
  if(!connection||await rows('blocks').findOne({pairId:id},{session,projection:{_id:1}}))throw new AppError(403,'ious_connection','Start an IOU with an accepted friend.');
 }
 const first=[actor.userId,input.personId].sort()[0];
 const change=iouRecordTransition(first===actor.userId,prior?.balanceCents||0,input);
 const debtorId=change.direction==='me_to_them'?actor.userId:input.personId,creditorId=change.direction==='me_to_them'?input.personId:actor.userId;
 const now=new Date().toISOString(),revision=(prior?.revision||0)+1,entry:Entry={_id:randomUUID(),pairId:id,actorId:actor.userId,kind:input.kind,debtorId,creditorId,amountCents:change.amountCents,reason:input.reason,balanceAfterCents:change.balanceCents,createdAt:now,revision};
 const updated=prior?await ledgers().findOneAndUpdate({_id:id,revision:prior.revision},{$set:{balanceCents:change.balanceCents,revision,updatedAt:now,lastEntryId:entry._id}},{session,returnDocument:'after'}):await ledgers().findOneAndUpdate({_id:id,revision:{$exists:false}},{$setOnInsert:{members:[first,first===actor.userId?input.personId:actor.userId] as [string,string],createdAt:now},$set:{balanceCents:change.balanceCents,revision,updatedAt:now,lastEntryId:entry._id}},{session,upsert:true,returnDocument:'after'});
 if(!updated)throw new AppError(409,'ious_changed','This IOU changed. Try again.');
 await entries().insertOne(entry,{session});
 if(await notificationEnabled(input.personId,'iou',session)){
  const amount=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(change.amountCents/100),name=label(actorUser),title=input.kind==='owe'?debtorId===input.personId?`You owe ${name} ${amount}`:`${name} owes you ${amount}`:input.kind==='settle'?debtorId===actor.userId?`${name} settled up ${amount}`:`${name} recorded your ${amount} settlement`:debtorId===actor.userId?`${name} made a ${amount} partial payment`:`${name} recorded your ${amount} partial payment`;
  await rows('notifications').insertOne({_id:entry._id,userId:input.personId,actorId:actor.userId,kind:'iou',pairId:id,entryId:entry._id,title,text:input.reason?`For ${input.reason}`:'',readAt:null,createdAt:now},{session});
  await enqueueStoredPush(input.personId,actor.userId,actor.userId,'iou',entry._id,session);
 }
 await rows('recordEvents').insertOne({_id:randomUUID(),userIds:[actor.userId,input.personId],payload:{keys:['ious','notifications']},expiresAt:new Date(Date.now()+3600000)},{session});
 return {ledger:await summary(updated,actor.userId,other,entry),entry:entryView(entry)};
}
