import type {ClientSession} from 'mongodb';
import {rows,type Row} from './db';
import {hash,users,type Actor} from './auth';
import {AppError,requireValue} from './errors';
import {notificationEnabled} from './notificationSettings';
import {enqueueStoredPush} from './push';
import type {QuizAnswers} from '../shared/quizzes';

interface QuizRow {_id:string;members:string[];answers:Record<string,QuizAnswers>;revision:number;createdAt:string;updatedAt:string}
interface QuizView {_id:string;userId:string;quizId:string;otherId:string;pinned:boolean;bff:boolean;bothAnswered:boolean;answerCount:number;quizRevision:number;createdAt:string;sortKey:string}
const pairId=(a:string,b:string)=>[a,b].sort().join(':');
const viewId=(userId:string,quizId:string)=>hash(`quiz-view:${userId}:${quizId}`);
const countAnswers=(answers:QuizAnswers|undefined)=>answers?Object.values(answers).filter(Boolean).length:0;
const hasAnswers=(answers:QuizAnswers|undefined)=>countAnswers(answers)>0;
export const quizSortKey=(bff:boolean,pinned:boolean,bothAnswered:boolean,answerCount:number,createdAt:string,quizId:string)=>`${Number(bff)}:${Number(pinned)}:${Number(bothAnswered)}:${String(answerCount).padStart(2,'0')}:${createdAt}:${quizId}`;
function score(row:QuizRow){const counts=row.members.map(id=>countAnswers(row.answers[id]));return {bothAnswered:counts.every(count=>count>0),answerCount:counts.reduce((total,count)=>total+count,0)};}
function person(user:Row){return {id:user._id,name:String(user.name||user.handle||'Member'),...(user.handle?{handle:String(user.handle)}:{}),...(Array.isArray(user.photos)&&user.photos[0]?{photoId:String(user.photos[0])}:{})};}
async function otherPerson(userId:string,personId:string,session?:ClientSession){
 if(userId===personId)throw new AppError(422,'quiz_person','Choose another person.');
 if(await rows('blocks').findOne({pairId:pairId(userId,personId)},{session}))throw new AppError(404,'unavailable','This quiz is unavailable.');
 return requireValue(await users().findOne({_id:personId,suspendedAt:{$not:{$type:'string'}}},{session}),'This person is unavailable.');
}
async function syncView(row:QuizRow,userId:string,session?:ClientSession){
 const collection=rows<QuizView>('quizViews'),id=viewId(userId,row._id),prior=await collection.findOne({_id:id},{session});
 if(prior&&prior.quizRevision>=row.revision)return prior;
 const otherId=row.members.find(id=>id!==userId)!,ranking=score(row),pinned=prior?.pinned||false,bff=Boolean(await rows('bffs').findOne({_id:hash(`bff:${userId}:${otherId}`)},{session,projection:{_id:1}}));
 const fields={...ranking,bff,quizRevision:row.revision,sortKey:quizSortKey(bff,pinned,ranking.bothAnswered,ranking.answerCount,row.createdAt,row._id)};
 await collection.updateOne({_id:id},{$set:fields,$setOnInsert:{userId,quizId:row._id,otherId,pinned,createdAt:row.createdAt}},{session,upsert:true});
 return {...prior,_id:id,userId,quizId:row._id,otherId,pinned,createdAt:row.createdAt,...fields};
}
async function forViewer(row:QuizRow,userId:string,session?:ClientSession,known?:Map<string,Row>,pinned=false,bff=false){
 const members=row.members,people=known||new Map((await users().find({_id:{$in:members}},{session}).toArray()).map(user=>[user._id,user]));
 const other=members.find(id=>id!==userId)!;
 return {id:row._id,members,people:members.map(id=>person(people.get(id)||{_id:id,name:'Member'})),answers:row.answers||{},myAnswered:hasAnswers(row.answers[userId]),otherAnswered:hasAnswers(row.answers[other]),pinned,bff,revision:row.revision,createdAt:row.createdAt,updatedAt:row.updatedAt};
}
export async function quizOperation(name:string,input:Record<string,unknown>,actor:Actor,session?:ClientSession){
 const userId=actor.userId,options={session},limit=Number(input.limit||20);
 if(name==='quizzes.list'){
  const cursor=input.before?await rows<QuizView>('quizViews').findOne({_id:String(input.before),userId},options):null;
  if(input.before&&!cursor)throw new AppError(409,'quiz_page_changed','This quiz page changed. Start from the first page.');
  const scanLimit=limit*3,found=await rows<QuizView>('quizViews').find({userId,...(cursor?{sortKey:{$lt:cursor.sortKey}}:{})},{...options,maxTimeMS:10000}).sort({sortKey:-1}).limit(scanLimit+1).toArray();
  const scanned=found.slice(0,scanLimit),quizIds=scanned.map(view=>view.quizId),otherIds=[...new Set(scanned.map(view=>view.otherId))];
  const [quizzes,people,blocks,owner]=await Promise.all([
   quizIds.length?rows<QuizRow>('quizzes').find({_id:{$in:quizIds}},options).toArray():[],
   otherIds.length?users().find({_id:{$in:otherIds},suspendedAt:{$not:{$type:'string'}}},options).toArray():[],
   otherIds.length?rows('blocks').find({pairId:{$in:otherIds.map(id=>pairId(userId,id))}},{...options,projection:{pairId:1}}).limit(otherIds.length).toArray():[],
   users().findOne({_id:userId},options),
  ]);
  const quizById=new Map(quizzes.map(row=>[row._id,row])),active=new Map(people.map(value=>[value._id,value])),blocked=new Set(blocks.map(row=>String(row.pairId)));
  const visible=scanned.flatMap(view=>{const quiz=quizById.get(view.quizId);return quiz&&active.has(view.otherId)&&!blocked.has(pairId(userId,view.otherId))?[{view,quiz}]:[];});
  const page=visible.slice(0,limit),nextCursor=visible.length>limit?visible[limit-1].view._id:found.length>scanLimit?scanned.at(-1)?._id:null;
  const known=new Map([...people,...(owner?[owner]:[])].map(value=>[value._id,value]));
  return {items:await Promise.all(page.map(({view,quiz})=>forViewer(quiz,userId,session,known,view.pinned,view.bff))),nextCursor:nextCursor||null};
 }
 const personId=String(input.personId),other=await otherPerson(userId,personId,session),id=pairId(userId,personId);
 const existing=await rows<QuizRow>('quizzes').findOne({_id:id,members:userId},options);
 if(name==='quizzes.get'){
  if(!existing&&!await rows('connections').findOne({_id:id,status:'accepted'},options))throw new AppError(404,'unavailable','Quizzes are available with friends.');
  const view=existing?await rows<QuizView>('quizViews').findOne({_id:viewId(userId,id)},options):null;
  return {person:person(other),quiz:existing?await forViewer(existing,userId,session,undefined,Boolean(view?.pinned),Boolean(view?.bff)||Boolean(await rows('bffs').findOne({_id:hash(`bff:${userId}:${personId}`)},{session,projection:{_id:1}}))):null};
 }
 if(name==='quizzes.create'){
  if(existing)throw new AppError(409,'quiz_exists','You already have a quiz with this friend.');
  if(!await rows('connections').findOne({_id:id,status:'accepted'},options))throw new AppError(403,'friend_required','You can start a quiz with a friend.');
  const now=new Date().toISOString(),answers=input.answers as QuizAnswers;
  const row:QuizRow={_id:id,members:[userId,personId].sort(),answers:{[userId]:answers},revision:1,createdAt:now,updatedAt:now};
  try{await rows<QuizRow>('quizzes').insertOne(row,{session});}catch(error){if((error as {code?:number}).code===11000)throw new AppError(409,'quiz_exists','You already have a quiz with this friend.');throw error;}
  for(const member of row.members)await syncView(row,member,session);
  if(await notificationEnabled(personId,'quiz',session)){
   const noticeId=hash(`quiz:${id}:${personId}`),created=await rows('notifications').updateOne({_id:noticeId},{$setOnInsert:{userId:personId,actorId:userId,kind:'quiz',quizId:id,readAt:null,createdAt:now}},{...options,upsert:true});
   if(created.upsertedCount)await enqueueStoredPush(personId,userId,id,'quiz',noticeId,session);
  }
  const view=await rows<QuizView>('quizViews').findOne({_id:viewId(userId,id)},options);
  return forViewer(row,userId,session,undefined,Boolean(view?.pinned),Boolean(view?.bff));
 }
 if(name==='quizzes.answer'){
  if(!existing)throw new AppError(404,'unavailable','This quiz is unavailable.');
  const updated=await rows<QuizRow>('quizzes').findOneAndUpdate({_id:id,members:userId,revision:Number(input.revision)},{$set:{[`answers.${userId}`]:input.answers,updatedAt:new Date().toISOString()},$inc:{revision:1}},{...options,returnDocument:'after'});
  if(!updated)throw new AppError(409,'quiz_changed','This quiz changed. Reload it before saving.');
  for(const member of updated.members)await syncView(updated,member,session);
  const view=await rows<QuizView>('quizViews').findOne({_id:viewId(userId,id)},options);
  return forViewer(updated,userId,session,undefined,Boolean(view?.pinned),Boolean(view?.bff));
 }
 if(name==='quizzes.pin'){
  if(!existing)throw new AppError(404,'unavailable','This quiz is unavailable.');
  const pinned=Boolean(input.pinned),view=await syncView(existing,userId,session);
  if(view.bff)throw new AppError(409,'bff_quiz','Change BFF status from this person’s profile.');
  await rows<QuizView>('quizViews').updateOne({_id:view._id,userId},{$set:{pinned,sortKey:quizSortKey(false,pinned,view.bothAnswered,view.answerCount,view.createdAt,id)}},options);
  return {personId,pinned};
 }
 throw new AppError(404,'operation_unknown','Unknown quiz operation.');
}

export async function setQuizBff(userId:string,personId:string,bff:boolean,session?:ClientSession){
 const quizId=pairId(userId,personId),quiz=await rows<QuizRow>('quizzes').findOne({_id:quizId,members:userId},{session});
 if(!quiz)return;
 const view=await syncView(quiz,userId,session);
 await rows<QuizView>('quizViews').updateOne({_id:view._id,userId},{$set:{bff,sortKey:quizSortKey(bff,view.pinned,view.bothAnswered,view.answerCount,view.createdAt,quizId)}},{session});
}

/** One-time, bounded background backfill for quizzes created before sorted views existed. */
export async function reconcileQuizViews(){
 const state=rows<{_id:string;after?:string;done?:boolean}>('quizViewBackfill');
 let cursor=await state.findOne({_id:'initial'});if(cursor?.done)return;
 while(true){
  const batch=await rows<QuizRow>('quizzes').find(cursor?.after?{_id:{$gt:cursor.after}}:{}).sort({_id:1}).limit(30).toArray();
  for(const quiz of batch)for(const member of quiz.members)await syncView(quiz,member);
  const after=batch.at(-1)?._id||cursor?.after;
  await state.updateOne({_id:'initial'},{$set:{after,done:batch.length<30}},{upsert:true});
  if(batch.length<30)return;
  cursor={_id:'initial',after};
  await new Promise(resolve=>setTimeout(resolve,50));
 }
}
