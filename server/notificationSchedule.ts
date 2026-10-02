import {randomUUID} from 'node:crypto';
import {Temporal} from '@js-temporal/polyfill';
import {rows} from './db';
import {users} from './auth';
import {logEntryFor} from './log';
import {deliverDirectAlert} from './notificationEvents';
import type {NotificationRuleInput} from '../shared/notificationSettings';

interface ScheduledRule {_id:string;userId:string;rule:NotificationRuleInput;kind:NotificationRuleInput['kind'];enabled:boolean;revision:number;nextAt:number;cursor?:string;dateKey?:string;armed?:boolean;alertEpoch?:number;lease?:string;leaseUntil?:number}
const rules=()=>rows<ScheduledRule>('notificationRules');
const localToday=(zone:string)=>Temporal.Now.zonedDateTimeISO(zone).toPlainDate();
function nextMorning(zone:string){const now=Temporal.Now.zonedDateTimeISO(zone);let next=now.with({hour:9,minute:0,second:0,millisecond:0,microsecond:0,nanosecond:0});if(Temporal.ZonedDateTime.compare(next,now)<=0)next=next.add({days:1});return next.epochMilliseconds;}
const matchingDay=(month:number,day:number,target:Temporal.PlainDate)=>month===target.month&&(day===target.day||month===2&&day===29&&target.day===28&&!target.inLeapYear);
export async function processScheduledNotificationRule(){
 const now=Date.now(),lease=randomUUID(),row=await rules().findOneAndUpdate({enabled:true,nextAt:{$lte:now},$or:[{leaseUntil:{$exists:false}},{leaseUntil:{$lte:now}}]},{$set:{lease,leaseUntil:now+60000}},{sort:{nextAt:1,_id:1},returnDocument:'after'});
 if(!row)return;
 try{
  if(row.rule.kind==='credit_low'||row.rule.kind==='storage_high'){
   const owner=await users().findOne({_id:row.userId,handle:{$type:'string'},suspendedAt:null},{projection:{balanceNanos:1,reservedNanos:1,storageBytes:1}});
   if(!owner){await rules().updateOne({_id:row._id,lease},{$set:{nextAt:now+3600000},$unset:{lease:'',leaseUntil:''}});return;}
   const low=row.rule.kind==='credit_low',value=low?Math.max(0,Number(owner.balanceNanos||0)-Number(owner.reservedNanos||0)):Number(owner.storageBytes||0),active=row.rule.kind==='credit_low'?value<row.rule.thresholdNanos:value>=row.rule.thresholdBytes;
   if(active&&row.armed!==false){const title=low?'Your credit is low':'Your storage is nearly full';await deliverDirectAlert(row.userId,row.userId,low?'credits':'storage',row.userId,title,'',`${low?'credit':'storage'}:${row._id}:${row.alertEpoch||0}`,undefined,row._id);}
   await rules().updateOne({_id:row._id,lease},{$set:{armed:!active,nextAt:now+300000,...(!active&&row.armed===false?{alertEpoch:(row.alertEpoch||0)+1}:{})},$unset:{lease:'',leaseUntil:''}});return;
  }
  if(row.rule.kind!=='birthday'&&row.rule.kind!=='anniversary'){await rules().updateOne({_id:row._id,lease},{$unset:{lease:'',leaseUntil:'',nextAt:''}});return;}
  const rule=row.rule,day=row.dateKey?Temporal.PlainDate.from(row.dateKey):localToday(rule.timeZone),target=day.add({days:rule.daysBefore}),key=day.toString();
  if(rule.kind==='birthday'){
   const page=await rows('connections').find({members:row.userId,status:'accepted',...(row.cursor?{_id:{$gt:row.cursor}}:{})},{projection:{members:1}}).sort({_id:1}).limit(50).toArray();
   const ids=page.flatMap(item=>(item.members as string[]).filter(id=>id!==row.userId));
   const [birthdays,people,blocks]=await Promise.all([
    rows('logBirthdays').find({_id:{$in:ids}},{projection:{month:1,day:1}}).limit(ids.length).toArray(),
    users().find({_id:{$in:ids},handle:{$type:'string'},suspendedAt:null},{projection:{handle:1,name:1,photos:1}}).limit(ids.length).toArray(),
    rows('blocks').find({pairId:{$in:page.map(item=>item._id)}},{projection:{pairId:1}}).limit(page.length).toArray(),
   ]);
   const byPerson=new Map(people.map(person=>[person._id,person])),blocked=new Set(blocks.map(item=>item.pairId));
   for(const birthday of birthdays){const person=byPerson.get(birthday._id),connection=page.find(item=>(item.members as string[]).includes(birthday._id));if(!person||!connection||blocked.has(connection._id)||!matchingDay(Number(birthday.month),Number(birthday.day),target))continue;
    const name=person.handle?`@${person.handle}`:String(person.name||'Your friend'),title=rule.daysBefore?`${name}'s birthday is in ${rule.daysBefore} day${rule.daysBefore===1?'':'s'}`:`It's ${name}'s birthday`;
    await deliverDirectAlert(row.userId,birthday._id,'person',birthday._id,title,'',`birthday:${row._id}:${birthday._id}:${key}`,person.photos?.[0],row._id);
   }
   await rules().updateOne({_id:row._id,lease},page.length<50?{$set:{nextAt:nextMorning(rule.timeZone),cursor:'',dateKey:''},$unset:{lease:'',leaseUntil:''}}:{$set:{nextAt:Date.now(),cursor:page.at(-1)!._id,dateKey:key},$unset:{lease:'',leaseUntil:''}});return;
  }
  const days=[target.toString().slice(5),...(target.month===2&&target.day===28&&!target.inLeapYear?['02-29']:[])];
  const page=await rows('logEntries').find({members:row.userId,recurrence:'anniversary',calendarMonthDay:{$in:days},deletedAt:{$exists:false},...(row.cursor?{_id:{$gt:row.cursor}}:{})},{projection:{_id:1,title:1,date:1}}).sort({_id:1}).limit(50).toArray();
  for(const entry of page){if(String(entry.date)>target.toString())continue;try{await logEntryFor(row.userId,entry._id);}catch{continue;}
   const title=rule.daysBefore?`Hangout anniversary in ${rule.daysBefore} day${rule.daysBefore===1?'':'s'}`:'Hangout anniversary today';
   await deliverDirectAlert(row.userId,row.userId,'log',entry._id,title,String(entry.title||''),`anniversary:${row._id}:${entry._id}:${key}`,undefined,row._id);
  }
  await rules().updateOne({_id:row._id,lease},page.length<50?{$set:{nextAt:nextMorning(rule.timeZone),cursor:'',dateKey:''},$unset:{lease:'',leaseUntil:''}}:{$set:{nextAt:Date.now(),cursor:page.at(-1)!._id,dateKey:key},$unset:{lease:'',leaseUntil:''}});
 }catch(error){await rules().updateOne({_id:row._id,lease},{$set:{nextAt:Date.now()+60000},$unset:{lease:'',leaseUntil:''}});console.error('Notification schedule:',error instanceof Error?error.name:'Error');}
}
export function startNotificationSchedule(){let stopped=false,running:Promise<unknown>|undefined;const tick=()=>{if(stopped||running)return;running=processScheduledNotificationRule().catch(error=>console.error('Notification schedule worker:',error instanceof Error?error.name:'Error')).finally(()=>{running=undefined;});};tick();const timer=setInterval(tick,1000);return async()=>{stopped=true;clearInterval(timer);await running;};}
