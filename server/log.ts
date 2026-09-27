import {Temporal} from '@js-temporal/polyfill';
import {workGate} from './workGate';
import {searchLog} from './search/log';
import type {LogSearchInput} from '../shared/logSearch';
import {publishLogChange} from './recordEvents';
import {projectInvite} from './logInvites';
import {ownBirthdaySchema,type OwnBirthday} from '../shared/logBirthday';
import {config} from './config';
import {destinationPath} from '../shared/navigation';
import type {LogContact} from '../shared/logJoining';
import {enqueueLogPush} from './push';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import type {ClientSession,Filter} from 'mongodb';
import {rows} from './db';
import {users,type Actor} from './auth';
import {AppError,requireValue} from './errors';
import {uploads,ownUpload,retainUploads,deleteUpload} from './uploads';
import {logPreferencesSchema,logQueryGroups,logPlainText,type LogEntry,type LogFields,type LogContribution,type LogList,type LogCalendarPage} from '../shared/log';
interface LogRow extends LogFields {calendarMonthDay?:string;_id:string;liveEventVersion?:number;historicalPeople?:string[];joinKey?:string;ownerId:string;members:string[];invited:string[];contributions:(LogContribution&{userId:string;hasContributed?:boolean})[];revision:number;createdAt:string;updatedAt:string;deletedAt?:string}
const entries=()=>rows<LogRow>('logEntries');
async function excluded(userId:string,session?:ClientSession){return (await rows('blocks').find({members:userId},{session}).toArray()).flatMap(row=>(row.members as string[]).filter(id=>id!==userId));}
async function access(userId:string,session?:ClientSession):Promise<Filter<LogRow>>{const blocked=await excluded(userId,session);return {deletedAt:{$exists:false},members:{$nin:blocked},$or:[{members:userId},{invited:userId}]};}
const activeMemberStages=()=>[{$lookup:{from:'users',localField:'members',foreignField:'_id',pipeline:[{$match:{suspendedAt:{$type:'string'}}},{$project:{_id:1}},{$limit:1}],as:'_suspendedMembers'}},{$match:{'_suspendedMembers.0':{$exists:false}}},{$unset:'_suspendedMembers'}];
async function visibleEntries(filter:Filter<LogRow>,session?:ClientSession,sort?:Record<string,1|-1>,limit?:number,projection?:Record<string,1>){return entries().aggregate<LogRow>([{$match:filter},...(sort?[{$sort:sort}]:[]),...activeMemberStages(),...(limit?[{$limit:limit}]:[]),...(projection?[{$project:projection}]:[])],{session,maxTimeMS:10000}).toArray();}
export async function logFileVisibleTo(userId:string,ownerId:string,fileId:string){return Boolean((await visibleEntries({$and:[await access(userId),{contributions:{$elemMatch:{userId:ownerId,fileIds:fileId}}}]},undefined,undefined,1))[0]);}
export async function logAttachmentLocations(userId:string,fileIds:string[]|undefined,session?:ClientSession,entryIds?:string[]){return visibleEntries({$and:[await access(userId,session),{...(entryIds?{_id:{$in:entryIds}}:{}),members:userId,contributions:{$elemMatch:{userId,...(fileIds?{fileIds:{$in:fileIds}}:{})}}}]},session,undefined,undefined,{title:1,date:1,'contributions.userId':1,'contributions.fileIds':1});}
export async function hasSharedHangouts(userId:string,personId:string,session?:ClientSession){if(userId===personId)return false;return Boolean((await visibleEntries({$and:[await access(userId,session),{members:{$all:[userId,personId]}}]},session,undefined,1,{_id:1}))[0]);}
export async function logEntryFor(userId:string,id:string,session?:ClientSession){return requireValue((await visibleEntries({$and:[{_id:id},await access(userId,session)]},session,undefined,1))[0],'This Log entry is unavailable.');}
export async function projectLogEntries(records:LogRow[],userId:string,session?:ClientSession,preview=false):Promise<LogEntry[]>{
 if(!records.length)return [];
 const ids=[...new Set(records.flatMap(row=>[...row.members,...row.invited]))],fileIds=[...new Set(records.flatMap(row=>row.contributions.flatMap(person=>person.fileIds)))];
 const people=await users().find({_id:{$in:ids}},{session,projection:{name:1,handle:1,photos:1,discoverable:1,suspendedAt:1}}).toArray();
 const files=await uploads().find({_id:{$in:fileIds},ready:true,deletedAt:{$exists:false},moderatedAt:{$exists:false}},{session}).toArray();
 const byPerson=new Map(people.map(person=>[person._id,person])),byFile=new Map(files.map(file=>[file._id,file]));
 const visible=new Set(people.filter(person=>person._id===userId||!person.suspendedAt&&person.discoverable).map(person=>person._id));
 for(const row of records)if(row.members.includes(userId))for(const id of row.members)if(!byPerson.get(id)?.suspendedAt)visible.add(id);
 const unresolved=ids.filter(id=>!visible.has(id)&&!byPerson.get(id)?.suspendedAt);
 if(unresolved.length){
  const shared=await entries().aggregate<{_id:string}>([{$match:{members:userId,deletedAt:{$exists:false},$and:[{members:{$in:unresolved}}]}},{$unwind:'$members'},{$match:{members:{$in:unresolved}}},{$group:{_id:'$members'}}],{session}).toArray();shared.forEach(row=>visible.add(row._id));
  const connections=await rows('connections').find({members:userId,$and:[{members:{$in:unresolved}}],$or:[{status:{$in:['pending','accepted']}},{status:'declined',toId:userId}]},{session,projection:{members:1}}).toArray();for(const row of connections)for(const id of row.members as string[])if(unresolved.includes(id))visible.add(id);
 }
 const person=(id:string)=>{const user=byPerson.get(id);return {userId:id,profileVisible:visible.has(id),name:user?.name||user?.handle||'Member',...(user?.handle?{handle:user.handle}:{}),...(user?.photos?.[0]&&visible.has(id)?{photoId:user.photos[0]}:{})};};
 return records.map(row=>({id:row._id,ownerId:row.ownerId,...(row.historicalPeople?.length?{historicalPeople:row.historicalPeople}:{}),title:row.title,date:row.date,place:row.place,links:row.links,recurrence:row.recurrence,coverFileId:byFile.has(row.coverFileId||'')?row.coverFileId:null,revision:row.revision,createdAt:row.createdAt,updatedAt:row.updatedAt,membership:row.members.includes(userId)?'member':row.invited.includes(userId)?'invited':'declined',contributors:row.contributions.filter(c=>row.members.includes(c.userId)).map(c=>({...person(c.userId),note:preview?c.note.slice(0,500):c.note,...(preview&&c.note.length>500?{noteTruncated:true}:{}),files:c.fileIds.flatMap(id=>{const file=byFile.get(id);return file&&file.userId===c.userId?[{id:file._id,name:file.name,mime:file.mime,bytes:file.bytes,url:`/api/files/${file._id}`}]:[];})})),invitations:row.invited.map(person)}));
}
async function project(row:LogRow,userId:string,session?:ClientSession,preview=false){return (await projectLogEntries([row],userId,session,preview))[0];}

async function media(userId:string,ids:string[],entryId:string,session?:ClientSession){
 for(const id of ids){
  const file=await ownUpload(userId,id,session);
  if(!file.ready||!['image/','audio/','video/'].some(prefix=>file.mime.startsWith(prefix))||!['log_media','agent_input'].includes(file.purpose))throw new AppError(422,'log_media','Choose a ready photo, audio recording or video.');
  if(file.logEntryId&&file.logEntryId!==entryId||await entries().findOne({_id:{$ne:entryId},'contributions.fileIds':id,deletedAt:{$exists:false}},{session})||await rows('posts').findOne({fileIds:id,deletedAt:{$exists:false}},{session})||await users().findOne({photos:id},{session}))throw new AppError(422,'log_file_owned','Upload a separate file for this hangout.');
  await uploads().updateOne({_id:id,userId},{$set:{logEntryId:entryId},$inc:{referenceRevision:1}},{session});
  await retainUploads(userId,[id],file.purpose,session);
 }
}
async function removeMedia(actor:Actor,ids:string[],session?:ClientSession){
 for(const id of new Set(ids))if(await uploads().findOne({_id:id,userId:actor.userId,deletedAt:{$exists:false},moderatedAt:{$exists:false}},{session}))await deleteUpload(actor,id,session);
}
async function notification(row:LogRow,actorId:string,userId:string,kind:'log_invitation'|'log_update'|'log_added',session?:ClientSession){await rows('notifications').updateOne({_id:`log:${row._id}:${userId}`},{$set:{userId,actorId,entryId:row._id,kind,title:kind==='log_added'?'You were added to a hangout':kind==='log_invitation'?'An invitation to a shared Log entry':'A new contribution to a hangout',text:'',revision:row.revision,readAt:null,createdAt:new Date().toISOString()}},{upsert:true,session});await enqueueLogPush(userId,actorId,row._id,row.revision,session,kind);}
async function save(row:LogRow,revision:number,actor:Actor,session?:ClientSession){
 if(row.revision!==revision)throw new AppError(409,'log_changed','This entry changed. Reload it before saving.');
 const previous=await entries().findOne({_id:row._id,revision},{session,projection:{members:1,invited:1,date:1}});
 row.updatedAt=new Date().toISOString();row.revision++;row.liveEventVersion=1;row.calendarMonthDay=row.recurrence==='none'?'':row.date.slice(5);
 const result=await entries().replaceOne({_id:row._id,revision},{...row},{session});if(!result.matchedCount)throw new AppError(409,'log_changed','This entry changed. Reload it before saving.');
 await publishLogChange(previous,row,session);
 return project(row,actor.userId,session);
}
/** Match Logcal: alert once on a member's first content, not on every save. */
function contribution(row:LogRow,userId:string,value:LogContribution){
 const previous=row.contributions.find(person=>person.userId===userId);
 const already=previous?.hasContributed??Boolean(row.ownerId===userId||previous?.note.trim()||previous?.fileIds.length);
 const hasContent=Boolean(value.note.trim()||value.fileIds.length),first=!already&&hasContent;
 row.contributions=row.contributions.map(person=>person.userId===userId?{...value,userId,hasContributed:already||hasContent}:person);
 return first;
}
async function notifyFirstContribution(row:LogRow,actorId:string,session?:ClientSession){for(const member of row.members)if(member!==actorId)await notification(row,actorId,member,'log_update',session);}
function queryFilter(query:string){return logQueryGroups(query).map(group=>({$and:group.map(term=>{const regex=new RegExp(term.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i'),match={$or:[{title:regex},{place:regex},{'contributions.note':regex}]};return term.exclude?{$nor:[match]}:match;})}));}
async function list(userId:string,d:LogList,session?:ClientSession,full=false){
 if(d.calendarDay&&(d.from||d.through||d.recurring))throw new AppError(422,'log_dates','Use calendarDay without from, through or recurring.');
 if(d.from&&d.through&&d.from>d.through)throw new AppError(422,'log_dates','The end date must follow the start date.');
 const filter:Filter<LogRow>[]=[await access(userId,session),d.scope==='invitations'?{invited:userId}:{members:userId}];
 if(d.scope==='private')filter.push({members:{$size:1},invited:{$size:0}});if(d.scope==='shared')filter.push({$or:[{'members.1':{$exists:true}},{'invited.0':{$exists:true}}]});
 if(d.calendarDay)filter.push(calendarDateFilter(d.calendarDay,d.includeAnniversaries));
 if(d.personId)filter.push({members:d.personId});if(d.recurring)filter.push({recurrence:{$ne:'none'}});
 if(d.from||d.through)filter.push({date:{...(d.from?{$gte:d.from}:{}),...(d.through?{$lte:d.through}:{})}});
 const groups=queryFilter(d.query||'');if(groups.length)filter.push({$or:groups});
 const signature=createHash('sha256').update(JSON.stringify(['date-created-v2',userId,d.from,d.through,d.query,d.personId,d.scope,d.recurring,...(d.calendarDay?[d.calendarDay,d.includeAnniversaries]:[])])).digest('hex');
 if(d.before){try{const cursor=JSON.parse(Buffer.from(d.before,'base64url').toString());if(cursor.signature!==signature||typeof cursor.id!=='string'||typeof cursor.date!=='string'||typeof cursor.createdAt!=='string')throw Error();filter.push({$or:[{date:{$lt:cursor.date}},{date:cursor.date,createdAt:{$lt:cursor.createdAt}},{date:cursor.date,createdAt:cursor.createdAt,_id:{$lt:cursor.id}}]});}catch{throw new AppError(422,'log_cursor','Reload this Log view.');}}
 const found=await visibleEntries({$and:filter},session,{date:-1,createdAt:-1,_id:-1},d.limit+1),page=found.slice(0,d.limit),last=page.at(-1);
 const items=await projectLogEntries(page,userId,session,!full);
 return {items,nextCursor:found.length>d.limit&&last?Buffer.from(JSON.stringify({date:last.date,createdAt:last.createdAt,id:last._id,signature})).toString('base64url'):null};
}
const calendarReads=workGate(4,256);
function calendarDateFilter(day:string,anniversaries:boolean):Filter<LogRow>{
 if(!anniversaries)return {date:day};
 const date=Temporal.PlainDate.from(day),monthDays=[day.slice(5)];
 if(date.month===2&&date.day===28&&!date.inLeapYear)monthDays.push('02-29');
 return {$or:[{date:day},{calendarMonthDay:{$in:monthDays},date:{$lt:day}}]};
}
async function calendar(userId:string,d:{from:string;through:string;today:string;scope:string;query?:string;personId?:string},session?:ClientSession):Promise<LogCalendarPage>{
 const first=Temporal.PlainDate.from(d.from),count=first.until(Temporal.PlainDate.from(d.through)).days+1;
 if(count<1||count>42)throw new AppError(422,'log_dates','Choose a calendar range of at most 42 days.');
 const filter:Filter<LogRow>[]=[await access(userId,session),{members:userId}];
 if(d.scope==='private')filter.push({members:{$size:1},invited:{$size:0}});
 if(d.scope==='shared')filter.push({$or:[{'members.1':{$exists:true}},{'invited.0':{$exists:true}}]});
 if(d.personId)filter.push({members:d.personId});const groups=queryFilter(d.query||'');if(groups.length)filter.push({$or:groups});
 // Each indexed day stops at ten authorized rows. Dense days never load their full history.
 const result=await Promise.all(Array.from({length:count},(_,offset)=>calendarReads.run(async()=>{
  const date=first.add({days:offset}).toString();
  const found=await visibleEntries({$and:[...filter,calendarDateFilter(date,date>d.today)]},session,{date:-1,createdAt:-1,_id:-1},10,{_id:1,date:1,title:1,createdAt:1,coverFileId:1,'contributions.userId':1,'contributions.fileIds':1,members:1});
  return {date,found:found.slice(0,9),more:found.length>9};
 })));
 const source=[...new Map(result.flatMap(day=>day.found).map(row=>[row._id,row])).values()];
 const ids=[...new Set(source.flatMap(row=>row.contributions.filter(c=>row.members.includes(c.userId)).flatMap(c=>c.fileIds)))];
 const files=await uploads().find({_id:{$in:ids},ready:true,deletedAt:{$exists:false},moderatedAt:{$exists:false},mime:{$regex:'^image/'}},{session,projection:{userId:1,name:1,mime:1,bytes:1}}).toArray();
 const byFile=new Map(files.map(file=>[file._id,file]));
 const tiles=new Map(source.map(row=>{const photos=row.contributions.filter(c=>row.members.includes(c.userId)).flatMap(c=>c.fileIds.flatMap(id=>{const file=byFile.get(id);return file?.userId===c.userId?[file]:[];})),cover=photos.find(file=>file._id===row.coverFileId)||photos[0];return [row._id,{id:row._id,date:row.date,title:row.title,createdAt:row.createdAt,cover:cover?{id:cover._id,name:cover.name,mime:cover.mime,bytes:cover.bytes,url:`/api/files/${cover._id}`}:null}];}));
 return {days:result.map(day=>({date:day.date,more:day.more,items:day.found.map(row=>tiles.get(row._id)!)})),indexing:Boolean(await entries().findOne({members:userId,calendarMonthDay:{$exists:false},deletedAt:{$exists:false}},{session,projection:{_id:1}}))};
}
export async function backfillLogCalendar(){
 const batch=await entries().find({calendarMonthDay:{$exists:false}},{projection:{_id:1}}).limit(100).toArray();
 if(batch.length)await entries().updateMany({_id:{$in:batch.map(row=>row._id)},calendarMonthDay:{$exists:false}},[{$set:{calendarMonthDay:{$cond:[{$eq:['$recurrence','none']},'',{$substrBytes:['$date',5,5]}]}}}]);
 return batch.length;
}
export function startLogCalendarWorker(){let stopped=false,running:Promise<unknown>|undefined;const tick=()=>{if(stopped||running)return;running=backfillLogCalendar().catch(error=>console.error('Calendar indexing:',error.name)).finally(()=>{running=undefined;});};tick();const timer=setInterval(tick,1000);return async()=>{stopped=true;clearInterval(timer);await running;};}
async function contactRows(actor:Actor,session?:ClientSession):Promise<LogContact[]>{
 const userId=actor.userId,blocked=await excluded(userId,session);
 const shared=await entries().aggregate<{_id:string;count:number}>([{$match:{$and:[await access(userId,session),{members:userId}]}},...activeMemberStages(),{$unwind:'$members'},{$match:{members:{$ne:userId}}},{$group:{_id:'$members',count:{$sum:1}}}],{session}).toArray();
 const canReadFriends=!actor.background||actor.accountActivity;
 const friends=canReadFriends?(await rows('connections').find({members:userId,status:'accepted'},{session,projection:{members:1}}).toArray()).flatMap(row=>(row.members as string[]).filter(id=>id!==userId)):[];
 const ids=[...new Set([...shared.map(row=>row._id),...friends])].filter(id=>!blocked.includes(id));
 const people=await users().find({_id:{$in:ids},handle:{$type:'string'},suspendedAt:null},{session,projection:{name:1,handle:1,photos:1}}).toArray();
 return people.map(person=>({id:person._id,name:person.name||person.handle||'Member',...(person.handle?{handle:person.handle}:{}),...(person.photos?.[0]?{photoId:person.photos[0]}:{}),sharedHangouts:shared.find(row=>row._id===person._id)?.count||0,...(canReadFriends?{friend:friends.includes(person._id)}:{})})).sort((a,b)=>b.sharedHangouts-a.sharedHangouts||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
async function fencePairs(actorId:string,members:string[],session?:ClientSession){for(const other of [...new Set(members)].filter(id=>id!==actorId).sort())await rows<{_id:string;revision:number}>('contactPairs').updateOne({_id:[actorId,other].sort().join(':')},{$inc:{revision:1}},{session,upsert:true});}
async function compatible(personId:string,members:string[],session?:ClientSession){
 requireValue(await users().findOne({_id:personId,handle:{$type:'string'},suspendedAt:null},{session,projection:{_id:1}}),'This person is unavailable.');
 const blocked=await excluded(personId,session);if(members.some(id=>blocked.includes(id))||await users().findOne({_id:{$in:members},suspendedAt:{$type:'string'}},{session,projection:{_id:1}}))throw new AppError(404,'unavailable','This hangout is unavailable.');
}
async function byCode(userId:string,code:string,session?:ClientSession){requireValue(/^[a-f0-9]{32}$/.test(code),'This hangout code is unavailable.');const row=requireValue(await entries().findOne({joinKey:code,deletedAt:{$exists:false}},{session}),'This hangout code is unavailable.');await compatible(userId,row.members,session);return row;}
async function joinRow(row:LogRow,actor:Actor,session?:ClientSession){
 if(row.members.includes(actor.userId))return project(row,actor.userId,session);
 await fencePairs(actor.userId,row.members,session);await compatible(actor.userId,row.members,session);
 if(row.members.length>=20)throw new AppError(422,'log_members','A hangout can include up to 20 people.');
 row.members.push(actor.userId);row.invited=row.invited.filter(id=>id!==actor.userId);row.contributions.push({userId:actor.userId,note:'',fileIds:[],hasContributed:false});
 await rows('notifications').updateMany({userId:actor.userId,entryId:row._id},{$set:{readAt:new Date().toISOString()}},{session});
 return save(row,row.revision,actor,session);
}

export async function logOperation(name:string,d:Record<string,unknown>,actor:Actor,session?:ClientSession):Promise<unknown>{
 const userId=actor.userId,now=new Date().toISOString();
 if(name==='log.calendar')return calendar(userId,d as any,session);
 if(name==='log.search')return searchLog(d as unknown as LogSearchInput,actor);
 if(name==='log.birthday_get'){const row=await rows('logBirthdays').findOne({_id:userId},{session});return {birthday:row?{month:row.month,day:row.day,...(typeof row.year==='number'?{year:row.year}:{})}:null};}
 if(name==='log.birthday_update'){
  if(!d.birthday){await rows('logBirthdays').deleteOne({_id:userId},{session});return {birthday:null};}
  const value=d.birthday as OwnBirthday,prior=await rows('logBirthdays').findOne({_id:userId},{session}),year=value.year===undefined?prior?.year:value.year;
  const birthday=ownBirthdaySchema.parse({month:value.month,day:value.day,...(typeof year==='number'?{year}:{})});
  await rows('logBirthdays').updateOne({_id:userId},{$set:{...birthday,updatedAt:now},...(year===null?{$unset:{year:''}}:{})},{session,upsert:true});return {birthday};
 }
 if(name==='log.birthdays'){
  const blocked=await excluded(userId,session),connections=!actor.background||actor.accountActivity?await rows('connections').find({members:userId,status:'accepted'},{session}).toArray():[];
  const ids=[...new Set([userId,...connections.flatMap(row=>(row.members as string[]).filter(id=>!blocked.includes(id)))])];
  const people=(await users().find({_id:{$in:ids},suspendedAt:null},{session,projection:{name:1,handle:1}}).toArray()).map(person=>({id:person._id,name:person.name,handle:person.handle})),saved=await rows('logBirthdays').find({_id:{$in:people.map(person=>person.id)}},{session}).toArray();
  return {items:saved.map(row=>{const person=people.find(person=>person.id===row._id)!;return {personId:row._id,name:person.name,handle:person.handle,month:row.month,day:row.day};})};
 }

 if(name==='log.contacts'){
  const all=(await contactRows(actor,session)).filter(person=>!d.query||`${person.name} ${person.handle||''}`.toLowerCase().includes(String(d.query).toLowerCase()));
  const limit=Number(d.limit||20),signature=createHash('sha256').update(JSON.stringify([userId,d.query||''])).digest('hex');let offset=0;
  if(d.before){try{const cursor=JSON.parse(Buffer.from(String(d.before),'base64url').toString());if(cursor.signature!==signature||!Number.isInteger(cursor.offset)||cursor.offset<0)throw Error();offset=cursor.offset;}catch{throw new AppError(422,'log_cursor','Reload the people picker.');}}
  return {items:all.slice(offset,offset+limit),nextCursor:offset+limit<all.length?Buffer.from(JSON.stringify({signature,offset:offset+limit})).toString('base64url'):null};
 }
 if(name==='log.join_preview'){const row=await byCode(userId,String(d.code),session);return projectInvite(row,String(d.code),userId,session);}
 if(name==='log.join'){
  if(Boolean(d.code)===Boolean(d.entryId))throw new AppError(422,'log_code','Use a scanned code or a legacy pending invitation.');
  const row=d.code?await byCode(userId,String(d.code),session):await logEntryFor(userId,String(d.entryId),session);
  if(!d.code&&!row.invited.includes(userId)&&!row.members.includes(userId))throw new AppError(403,'log_join','Use the hangout’s join code.');
  return joinRow(row,actor,session);
 }

 if(name==='log.preferences')return logPreferencesSchema.parse((({arrangement,views,todayPresentation}:any)=>({arrangement,views,todayPresentation}))(await rows('logPreferences').findOne({_id:userId},{session})||{}));
 if(name==='log.preferences_update'){const value=logPreferencesSchema.parse(d);if(new Set(value.views.map(v=>v.id)).size!==value.views.length)throw new AppError(422,'log_views','Saved views must have different IDs.');await rows('logPreferences').updateOne({_id:userId},{$set:value},{upsert:true,session});return value;}
 if(name==='log.list'||name==='log.export'){const result=await list(userId,d as unknown as LogList,session,name==='log.export');return name==='log.export'?{...result,text:logPlainText(result.items)}:result;}
 if(name==='log.create'){
  const fields=d.entry as LogFields,contribution=d.contribution as LogContribution,entryId=randomUUID();await media(userId,contribution.fileIds,entryId,session);
  if(fields.coverFileId&&(!contribution.fileIds.includes(fields.coverFileId)||!await uploads().findOne({_id:fields.coverFileId,ready:true,mime:{$regex:'^image/'}},{session})))throw new AppError(422,'log_cover','Choose a cover from this entry’s attachments.');
  const row:LogRow={...fields,calendarMonthDay:fields.recurrence==='none'?'':fields.date.slice(5),liveEventVersion:1,_id:entryId,joinKey:randomBytes(16).toString('hex'),ownerId:userId,members:[userId],invited:[],contributions:[{...contribution,userId,hasContributed:true}],revision:1,createdAt:now,updatedAt:now};await entries().insertOne(row,{session});await publishLogChange(null,row,session);return project(row,userId,session);
 }
 if(name==='log.people'){
  const ids=(await entries().aggregate<{_id:string}>([{$match:{$and:[await access(userId,session),{members:userId}]}},...activeMemberStages(),{$unwind:'$members'},{$group:{_id:'$members'}}],{session}).toArray()).map(row=>row._id);
  const people=await users().find({_id:{$in:ids}},{session,projection:{name:1,handle:1}}).sort({name:1,_id:1}).toArray();return {items:people.map(person=>({userId:person._id,name:person.name||person.handle||'Member',...(person.handle?{handle:person.handle}:{})}))};
 }
 const row=['log.delete','log.leave'].includes(name)?requireValue(await entries().findOne({_id:String(d.entryId),members:userId,deletedAt:{$exists:false}},{session}),'This Log entry is unavailable.'):await logEntryFor(userId,String(d.entryId),session);
 if(name==='log.neighbors'){
  const allowed=await access(userId,session),result:{previous:LogEntry|null;next:LogEntry|null}={previous:null,next:null};
  for(const direction of ['previous','next'] as const){const comparison=direction==='previous'?'$lt':'$gt',order=direction==='previous'?-1:1;
   const adjacent=(await visibleEntries({$and:[allowed,{members:userId},{$or:[{date:{[comparison]:row.date}},{date:row.date,createdAt:{[comparison]:row.createdAt}},{date:row.date,createdAt:row.createdAt,_id:{[comparison]:row._id}}]}]},session,{date:order,createdAt:order,_id:order},1))[0];if(adjacent)result[direction]=await project(adjacent,userId,session);
  }return result;
 }

 if(name==='log.code'){
  if(!row.members.includes(userId))throw new AppError(403,'log_member','Join the hangout before sharing its code.');
  if(!row.joinKey||d.reset){row.joinKey=randomBytes(16).toString('hex');await entries().updateOne({_id:row._id},{$set:{joinKey:row.joinKey}},{session});await publishLogChange(row,row,session);}
  return {entryId:row._id,code:row.joinKey,url:new URL(destinationPath({view:'log_join',resourceId:row.joinKey}),config.uiOrigin).href};
 }
 if(name!=='log.get'&&row.revision!==Number(d.revision))throw new AppError(409,'log_changed','This entry changed. Review the latest version before saving.');
 if(name==='log.get')return project(row,userId,session);
 if(name==='log.respond'){
  if(!row.invited.includes(userId))throw new AppError(409,'log_invitation','This invitation is no longer pending.');
  row.invited=row.invited.filter(id=>id!==userId);
  if(d.accept){row.members.push(userId);row.contributions.push({userId,note:'',fileIds:[],hasContributed:false});}
  await rows('notifications').updateMany({userId,entryId:row._id},{$set:{readAt:now}},{session});
  // Declining returns the already-authorized preview; later reads no longer have access.
  return save(row,Number(d.revision),actor,session);
 }
 if(!row.members.includes(userId))throw new AppError(403,'log_membership','Accept the invitation before changing this entry.');
 if(name==='log.update'){
  const previous=row.contributions.find(c=>c.userId===userId)?.fileIds||[],entry=d.entry as LogFields;let first=false;
  if(d.contribution){const value=d.contribution as LogContribution;await media(userId,value.fileIds,row._id,session);first=contribution(row,userId,value);}
  if(entry.coverFileId&&(!row.contributions.some(c=>c.fileIds.includes(entry.coverFileId!))||!await uploads().findOne({_id:entry.coverFileId,ready:true,mime:{$regex:'^image/'}},{session})))throw new AppError(422,'log_cover','Choose a photo from this entry’s attachments.');
  Object.assign(row,entry);if(row.coverFileId&&!row.contributions.some(c=>c.fileIds.includes(row.coverFileId!)))row.coverFileId=null;const result=await save(row,Number(d.revision),actor,session);if(first)await notifyFirstContribution(row,userId,session);await removeMedia(actor,previous.filter(id=>!row.contributions.some(c=>c.fileIds.includes(id))),session);return result;
 }
 if(name==='log.contribute'){
  const previous=row.contributions.find(c=>c.userId===userId)?.fileIds||[],value=d.contribution as LogContribution;await media(userId,value.fileIds,row._id,session);const first=contribution(row,userId,value);
  if(row.coverFileId&&!row.contributions.some(c=>c.fileIds.includes(row.coverFileId!)))row.coverFileId=null;
  const result=await save(row,Number(d.revision),actor,session);if(first)await notifyFirstContribution(row,userId,session);await removeMedia(actor,previous.filter(id=>!value.fileIds.includes(id)),session);return result;
 }
 if(name==='log.add_person'){
  const personId=String(d.personId);if(row.members.includes(personId))return project(row,userId,session);
  if(row.members.length>=20)throw new AppError(422,'log_members','A hangout can include up to 20 people.');
  if(!(await contactRows(actor,session)).some(person=>person.id===personId))throw new AppError(403,'log_contact','Choose someone from a previous hangout or your New Drugs friends. New people can scan the hangout code.');
  await fencePairs(personId,row.members,session);await compatible(personId,row.members,session);
  row.members.push(personId);row.invited=row.invited.filter(id=>id!==personId);row.contributions.push({userId:personId,note:'',fileIds:[],hasContributed:false});
  const result=await save(row,Number(d.revision),actor,session);
  await notification(row,userId,personId,'log_added',session);return result;
 }
 if(name==='log.revoke'){
  if(row.ownerId!==userId)throw new AppError(403,'log_owner','Only the creator can withdraw invitations.');
  row.invited=row.invited.filter(id=>id!==d.personId);await rows('notifications').deleteMany({entryId:row._id,userId:d.personId},{session});return save(row,Number(d.revision),actor,session);
 }
 if(name==='log.leave'||name==='log.delete'){
  const fileIds=row.contributions.find(c=>c.userId===userId)?.fileIds||[];
  row.members=row.members.filter(id=>id!==userId);row.contributions=row.contributions.filter(c=>c.userId!==userId);
  if(row.coverFileId&&!row.contributions.some(c=>c.fileIds.includes(row.coverFileId!)))row.coverFileId=null;
  if(!row.members.length){row.deletedAt=now;row.title='';row.place='';row.links=[];row.invited=[];row.historicalPeople=[];row.joinKey=undefined;}
  await save(row,Number(d.revision),actor,session);await removeMedia(actor,fileIds,session);await rows('notifications').deleteMany({entryId:row._id,...(row.members.length?{userId}:{})},{session});
  return name==='log.leave'?{left:true}:{deleted:true};
 }
 throw new AppError(404,'operation','Unknown Log operation.');
}
