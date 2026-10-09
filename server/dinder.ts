import {ObjectId,type ClientSession} from 'mongodb';
import {randomUUID} from 'node:crypto';
import {addCookingDays,nextDinnerPlan,dinnerPlan,compatibleDinnerPlans,dinnerSchedule,DINNER_WINDOW_MS,DEFAULT_DINNER_START,mealSchema,mealCardSchema,type CookingPlan,type DinderPreferences} from '../shared/dinder';
import {hash,users,type Actor,type User} from './auth';
import {rows,transaction,type Row} from './db';
import {AppError,requireValue} from './errors';
import {profileVisibleTo} from './profileVisibility';
import {notificationEnabled} from './notificationSettings';
import {enqueueStoredPush} from './push';
import {dinderCatalogMeta,mealOrderKey,type MealRow} from './dinderCatalog';
import {dinderCategory,dinderCategoryFilters} from '../shared/dinderCategories';

interface MatchRow {_id:string;mealId:string;members:string[];plans:CookingPlan[];startAt:string;deadlineAt:string;mode:'virtual';status:'matched'|'cancelled';revision:number;postponeVotes:string[];againVotes?:string[];nextMatchId?:string;createdAt:string;updatedAt:string}
interface DayRow {_id:string;userId:string;date:string;timeZone:string;matchId?:string}
interface LikeRow {_id:string;userId:string;mealId:string;date:string;mode:string;plan:CookingPlan;areaCell?:string;desiredAt:string;expiresAt:Date;createdAt:string}
interface PreferencesRow extends DinderPreferences {_id:string}
interface ChoiceRow {_id:string;userId:string;mealId:string;liked:boolean;pending:boolean;updatedAt:string}
interface RolloverRow {_id:string;nextAt:number;leaseUntil:number;lease?:string;after?:string;desiredAt?:string}
const pairId=(a:string,b:string)=>[a,b].sort().join(':');
const days=()=>rows<DayRow>('dinderDays'),matches=()=>rows<MatchRow>('dinderMatches');
const dayId=(userId:string,date:string)=>hash(`dinder-day:${userId}:${date}`);
async function preferencesFor(userId:string,session?:ClientSession,timeZone?:string):Promise<PreferencesRow>{
 const saved=await rows<PreferencesRow>('dinderPreferences').findOne({_id:userId},{session});
 if(saved)return {...saved,mode:'virtual',carrySwipes:saved.carrySwipes??false,excludedCategories:dinderCategoryFilters(saved.excludedCategories||[])};
 if(!timeZone)throw new AppError(422,'timezone_required','Open Dinder in the app or choose your timezone.');
 return {_id:userId,startTime:DEFAULT_DINNER_START,timeZone,mode:'virtual',carrySwipes:false,excludedCategories:[],revision:0};
}
async function contactLock(a:string,b:string,session?:ClientSession){await rows<{_id:string;revision:number}>('contactPairs').updateOne({_id:pairId(a,b)},{$inc:{revision:1}},{session,upsert:true});}
async function allowedPeople(userId:string,otherId:string,session?:ClientSession){
 const [other,block]=await Promise.all([users().findOne({_id:otherId,handle:{$type:'string'},suspendedAt:null},{session}),rows('blocks').findOne({pairId:pairId(userId,otherId)},{session,projection:{_id:1}})]);
 return other&&!block?other:null;
}
export async function dinderMatchFor(userId:string,id:string,session?:ClientSession){
 const match=requireValue(await matches().findOne({_id:id,members:userId},{session}),'This meal match is unavailable.');
 if(!await allowedPeople(userId,match.members.find(member=>member!==userId)!,session))throw new AppError(404,'unavailable','This meal match is unavailable.');
 return match;
}
async function projection(match:MatchRow,userId:string,session?:ClientSession,known?:Map<string,User>){
 const people=known||new Map((await users().find({_id:{$in:match.members}},{session}).toArray()).map(person=>[person._id,person]));
 const meal=requireValue(await rows<MealRow>('dinderMeals').findOne({_id:match.mealId},{session}),'This recipe is unavailable.');
 const recipe=mealSchema.parse(meal);
 return {id:match._id,meal:recipe,members:match.members,date:match.plans.find(plan=>plan.userId===userId)!.date,startAt:match.startAt,deadlineAt:match.deadlineAt,plans:match.plans,mode:'virtual' as const,status:match.status,revision:match.revision,postponeVotes:match.postponeVotes,againVotes:match.againVotes||[],...(match.nextMatchId?{nextMatchId:match.nextMatchId}:{}),createdAt:match.createdAt,updatedAt:match.updatedAt,
  people:await Promise.all(match.members.map(async id=>{const person=requireValue(people.get(id));return {id,name:person.name,handle:person.handle,...(person.photos?.[0]?{photoId:person.photos[0]}:{}),profileAvailable:match.status==='matched'||await profileVisibleTo(userId,person,session)};}))};
}
async function change(match:MatchRow,session?:ClientSession){await rows('recordEvents').insertOne({_id:randomUUID(),userIds:match.members,payload:{keys:['dinder']},expiresAt:new Date(Date.now()+3600000)},{session});}
async function notify(userId:string,actorId:string,match:MatchRow,kind:'dinder_match'|'dinder_message',text:string,messageId?:string,session?:ClientSession){
 if(!await notificationEnabled(userId,kind,session))return;
 const id=hash(`${kind}:${match._id}:${userId}`);
 await rows('notifications').updateOne({_id:id},{$set:{userId,actorId,kind,matchId:match._id,text,...(messageId?{messageId}:{}),readAt:null,createdAt:new Date().toISOString()}},{session,upsert:true});
 await enqueueStoredPush(userId,actorId,match._id,kind,id,session);
}
const messageProjection=(row:Row)=>({id:row._id,matchId:String(row.matchId),fromId:String(row.fromId),text:row.moderatedAt?'Message removed by moderation.':String(row.text),createdAt:String(row.createdAt),...(row.clientId?{clientId:String(row.clientId)}:{})});
export async function dinderOperation(name:string,input:Record<string,unknown>,actor:Actor,session?:ClientSession){
 const userId=actor.userId,options={session},limit=Number(input.limit||10),clock=Date.now(),now=new Date(clock).toISOString();
 if(name==='dinder.recipe')return mealSchema.parse(requireValue(await rows<MealRow>('dinderMeals').findOne({_id:String(input.mealId)},options),'This recipe is unavailable.'));
 if(name==='dinder.catalog'){
  const cursor=input.before?requireValue(await rows<MealRow>('dinderMeals').findOne({_id:String(input.before)},{...options,projection:{name:1}}),'This catalog position is unavailable.'):null;
  const [found,total]=await Promise.all([rows<MealRow>('dinderMeals').find({catalogApproved:true,...(cursor?{$or:[{name:{$gt:cursor.name}},{name:cursor.name,_id:{$gt:cursor._id}}]}:{})},options).sort({name:1,_id:1}).limit(limit+1).toArray(),rows('dinderMeals').countDocuments({catalogApproved:true},{maxTimeMS:2000})]);
  const items=found.slice(0,limit);return {items:items.map(meal=>mealCardSchema.parse(meal)),nextCursor:found.length>limit?items.at(-1)!._id:null,total};
 }
 if(name==='dinder.preferences'){const value=await rows<PreferencesRow>('dinderPreferences').findOne({_id:userId},options);return {preferences:value||input.timeZone?await preferencesFor(userId,session,input.timeZone as string|undefined):null};}
 if(name==='dinder.preferences_update'){
  const stored=await rows<PreferencesRow>('dinderPreferences').findOne({_id:userId},options),previous=stored?{...stored,excludedCategories:dinderCategoryFilters(stored.excludedCategories||[])}:null;
  const next:PreferencesRow={_id:userId,startTime:String(input.startTime),timeZone:String(input.timeZone),mode:'virtual',carrySwipes:input.carrySwipes===undefined?previous?.carrySwipes??false:Boolean(input.carrySwipes),excludedCategories:dinderCategoryFilters(input.excludedCategories===undefined?previous?.excludedCategories||[]:input.excludedCategories as string[]),revision:(previous?.revision||0)+1};
  if(previous&&previous.startTime===next.startTime&&previous.timeZone===next.timeZone&&previous.mode===next.mode&&previous.carrySwipes===next.carrySwipes&&JSON.stringify(previous.excludedCategories||[])===JSON.stringify(next.excludedCategories))return {...next,revision:previous.revision};
  await rows<PreferencesRow>('dinderPreferences').replaceOne({_id:userId},next,{...options,upsert:true});
  if(previous&&(previous.startTime!==next.startTime||previous.timeZone!==next.timeZone||previous.mode!==next.mode||JSON.stringify(previous.excludedCategories||[])!==JSON.stringify(next.excludedCategories)))await rows('dinderLikes').deleteMany({userId},options);
  if(next.carrySwipes)await rows<RolloverRow>('dinderRollovers').updateOne({_id:userId},{$set:{nextAt:clock,leaseUntil:0},$unset:{lease:'',after:'',desiredAt:''}},{...options,upsert:true});
  else await rows('dinderRollovers').deleteOne({_id:userId},options);
  await rows('recordEvents').insertOne({_id:randomUUID(),userIds:[userId],payload:{keys:['dinder']},expiresAt:new Date(clock+3600000)},options);
  return next;
 }
 if(name==='dinder.deck'){
  const preferences=await preferencesFor(userId,session,input.timeZone as string|undefined),plan=nextDinnerPlan(userId,preferences,clock),date=plan.date,mode='virtual';
  const day=await days().findOne({_id:dayId(userId,date)},options);
  let match=null;if(day?.matchId){try{match=await projection(await dinderMatchFor(userId,day.matchId,session),userId,session);}catch(error){if(!(error instanceof AppError&&error.status===404))throw error;}}
  const ordered=Boolean((await rows('dinderCatalog').findOne({_id:'ordering'},options))?.ready),cursor=ordered&&input.before?await rows<MealRow>('dinderMeals').findOne({_id:String(input.before)},options):null;
  const key=cursor?.orderKey||(input.before?mealOrderKey(String(input.before)):''),after=input.before?(ordered?{$or:[{orderKey:{$gt:key}},{orderKey:key,_id:{$gt:String(input.before)}}]}:{_id:{$gt:String(input.before)}}):{};
  const category=input.category?{category:dinderCategory(String(input.category))}:{category:{$nin:preferences.excludedCategories}},scan=await rows<MealRow>('dinderMeals').find({catalogApproved:true,...category,...after},options).sort(ordered?{orderKey:1,_id:1}:{_id:1}).limit(61).toArray();
  const page=scan.slice(0,60),swipes=await rows('dinderSwipes').find({userId,desiredAt:plan.desiredAt,mode,mealId:{$in:page.map(meal=>meal._id)}},{...options,projection:{mealId:1}}).limit(60).toArray();
  const carried=preferences.carrySwipes?await rows<ChoiceRow>('dinderChoices').find({userId,pending:true,liked:true,mealId:{$in:page.map(meal=>meal._id)}},options).limit(60).toArray():[];
  const seen=new Set([...swipes,...carried].map(swipe=>swipe.mealId)),visible=page.filter(meal=>!seen.has(meal._id)),items=visible.slice(0,limit).map(meal=>mealSchema.parse(meal));
  const state=await dinderCatalogMeta(session),nextCursor=visible.length>limit?visible[limit-1]._id:scan.length>60?page.at(-1)!._id:null;
  return {items,categories:state.categories,preferences,nextCursor,catalogReady:state.ready,plan,match};
 }
 if(name==='dinder.matches'){
  const cursor=input.before?requireValue(await matches().findOne({_id:String(input.before),members:userId},options)):null;
  const found=await matches().find({members:userId,...(cursor?{$or:[{createdAt:{$lt:cursor.createdAt}},{createdAt:cursor.createdAt,_id:{$lt:cursor._id}}]}:{})},options).sort({createdAt:-1,_id:-1}).limit(limit*3+1).toArray();
  const scanned=found.slice(0,limit*3),ids=[...new Set(scanned.flatMap(match=>match.members))];
  const [people,blocks]=await Promise.all([users().find({_id:{$in:ids},suspendedAt:null},options).limit(ids.length).toArray(),rows('blocks').find({pairId:{$in:ids.filter(id=>id!==userId).map(id=>pairId(userId,id))}},options).limit(ids.length).toArray()]);
  const known=new Map(people.map(person=>[person._id,person])),blocked=new Set(blocks.map(block=>block.pairId));
  const visible=scanned.filter(match=>match.members.every(id=>known.has(id))&&!blocked.has(pairId(...match.members as [string,string]))),page=visible.slice(0,limit);
  return {items:await Promise.all(page.map(match=>projection(match,userId,session,known))),nextCursor:visible.length>limit?page.at(-1)!._id:found.length>limit*3?scanned.at(-1)!._id:null};
 }
 if(name==='dinder.swipe'){
  const preferences=await preferencesFor(userId,session,input.timeZone as string|undefined),plan=nextDinnerPlan(userId,preferences,clock),date=plan.date,timeZone=preferences.timeZone,mode='virtual',mealId=String(input.mealId),liked=Boolean(input.liked);
  // Bind the visible card to its slot: crossing a cutoff never silently signs someone up for tomorrow.
  if(input.desiredAt!==plan.desiredAt||Number(input.preferencesRevision)!==preferences.revision)throw new AppError(409,'dinder_slot_changed','Your dinner window changed. Reload the meals before swiping.');
  if(preferences.revision===0){preferences.revision=1;await rows<PreferencesRow>('dinderPreferences').insertOne(preferences,options);}
  const meal=requireValue(await rows<MealRow>('dinderMeals').findOne({_id:mealId},options),'This recipe is unavailable.');
  if(meal.catalogApproved!==true)throw new AppError(409,'dinder_slot_changed','This recipe is no longer in the meal library. Refresh to choose another.');
  if(preferences.excludedCategories.includes(meal.category))throw new AppError(409,'dinder_slot_changed','Your category filters changed. Refresh the recipes.');
  await days().updateOne({_id:dayId(userId,date)},{$setOnInsert:{userId,date,timeZone}}, {...options,upsert:true});
  const day=requireValue(await days().findOne({_id:dayId(userId,date)},options));
  if(day.matchId){
   const prior=requireValue(await matches().findOne({_id:day.matchId,members:userId},options));
   await contactLock(userId,prior.members.find(member=>member!==userId)!,session);
   if(prior.status==='matched'&&await allowedPeople(userId,prior.members.find(member=>member!==userId)!,session))return {mealId,liked,preferences,match:await projection(prior,userId,session)};
   prior.status='cancelled';prior.revision++;prior.updatedAt=now;await matches().replaceOne({_id:prior._id},prior,options);
   for(const previous of prior.plans)await days().updateOne({_id:dayId(previous.userId,previous.date),matchId:prior._id},{$unset:{matchId:''}},options);
   await change(prior,session);
  }
  const swipeId=hash(`dinder-swipe:${userId}:${plan.desiredAt}:${mode}:${mealId}`);
  const priorChoice=await rows<ChoiceRow>('dinderChoices').findOne({_id:hash(`dinder-choice:${userId}:${mealId}`)},options),priorLike=await rows<LikeRow>('dinderLikes').findOne({_id:swipeId},options);
  await rows('dinderLastSwipes').updateOne({_id:userId},{$set:{swipeId,mealId,desiredAt:plan.desiredAt,priorChoice:priorChoice||null,priorLike:priorLike||null}},{...options,upsert:true});
  await rows('dinderSwipes').updateOne({_id:swipeId},{$set:{userId,mealId,date,desiredAt:plan.desiredAt,mode,liked,updatedAt:now}},{...options,upsert:true});
  await rows<ChoiceRow>('dinderChoices').updateOne({_id:hash(`dinder-choice:${userId}:${mealId}`)},{$set:{userId,mealId,liked,pending:liked,updatedAt:now}},{...options,upsert:true});
  if(!liked){await rows('dinderLikes').deleteOne({_id:swipeId},options);return {mealId,liked,preferences,match:null};}
  // Serialize a meal/day queue so two simultaneous YES swipes cannot miss each other.
  await rows<{_id:string;revision:number}>('dinderQueues').updateOne({_id:hash(`dinder-queue:${mode}:${mealId}:`)},{$inc:{revision:1}},{...options,upsert:true});
  await rows<LikeRow>('dinderLikes').updateOne({_id:swipeId},{$set:{userId,mealId,date,mode,plan,desiredAt:plan.desiredAt,areaCell:'',expiresAt:new Date(plan.cutoffAt)},$setOnInsert:{createdAt:now}},{...options,upsert:true});
  const preferred=Date.parse(plan.desiredAt),candidates=await rows<LikeRow>('dinderLikes').find({mealId,mode,areaCell:'',userId:{$ne:userId},desiredAt:{$gte:new Date(preferred-DINNER_WINDOW_MS).toISOString(),$lte:new Date(preferred+DINNER_WINDOW_MS).toISOString()},expiresAt:{$gt:new Date(clock)}},options).sort({desiredAt:1,createdAt:1,_id:1}).limit(48).toArray();
  for(const candidate of candidates){
   await contactLock(userId,candidate.userId,session);
   const other=await allowedPeople(userId,candidate.userId,session);if(!other)continue;
   if(await rows('peopleHides').findOne({$or:[{userId,personId:candidate.userId},{userId:candidate.userId,personId:userId}]},{...options,projection:{_id:1}}))continue;
   if(!compatibleDinnerPlans(plan,candidate.plan,Date.now()))continue;
   const otherDay=await days().findOne({_id:dayId(candidate.userId,candidate.date)},options);if(!otherDay||otherDay.matchId)continue;
   requireValue(await users().findOneAndUpdate({_id:other._id,suspendedAt:null},{$inc:{dinderRevision:1}},{...options,returnDocument:'after'}));
   const plans=[plan,candidate.plan],match:MatchRow={_id:randomUUID(),mealId,members:[userId,other._id].sort(),plans,...dinnerSchedule(plan,candidate.plan),mode:'virtual',status:'matched',revision:1,postponeVotes:[],createdAt:now,updatedAt:now};
   await matches().insertOne(match,options);
   for(const memberPlan of plans){const member=memberPlan.userId;await days().updateOne({_id:dayId(member,memberPlan.date)},{$set:{matchId:match._id}},options);await rows('dinderLikes').deleteMany({userId:member,date:memberPlan.date},options);await rows<ChoiceRow>('dinderChoices').updateOne({_id:hash(`dinder-choice:${member}:${mealId}`)},{$set:{pending:false}},options);await notify(member,match.members.find(id=>id!==member)!,match,'dinder_match',meal.name,undefined,session);}
   await change(match,session);const projected=await projection(match,userId,session);
   if(Date.now()>=Date.parse(match.deadlineAt))throw new AppError(409,'dinder_slot_changed','The matching cutoff passed. Reload the meals before swiping.');
   return {mealId,liked,preferences,match:projected};
  }
  await rows('recordEvents').insertOne({_id:randomUUID(),userIds:[userId],payload:{keys:['dinder']},expiresAt:new Date(Date.now()+3600000)},options);
  return {mealId,liked,preferences,match:null};
 }
 if(name==='dinder.back'){
  const preferences=await preferencesFor(userId,session,input.timeZone as string|undefined),plan=nextDinnerPlan(userId,preferences,clock);
  if(input.desiredAt!==plan.desiredAt||input.preferencesRevision!==preferences.revision)throw new AppError(409,'dinder_slot_changed','Your dinner window changed. Refresh the recipes.');
  if((await days().findOne({_id:dayId(userId,plan.date)},options))?.matchId)throw new AppError(409,'already_matched','Unmatch before changing a matched recipe.');
  const previous=requireValue(await rows('dinderLastSwipes').findOne({_id:userId,mealId:String(input.mealId),desiredAt:plan.desiredAt},options),'There is no previous swipe to undo.');
  const choiceId=hash(`dinder-choice:${userId}:${String(previous.mealId)}`);
  if(previous.priorChoice)await rows('dinderChoices').replaceOne({_id:choiceId},previous.priorChoice as Row,{...options,upsert:true});else await rows('dinderChoices').deleteOne({_id:choiceId},options);
  if(previous.priorLike)await rows('dinderLikes').replaceOne({_id:String(previous.swipeId)},previous.priorLike as Row,{...options,upsert:true});else await rows('dinderLikes').deleteOne({_id:String(previous.swipeId)},options);
  await rows('dinderSwipes').deleteOne({_id:String(previous.swipeId)},options);await rows('dinderLastSwipes').deleteOne({_id:userId},options);
  const {_id,...meal}=requireValue(await rows<MealRow>('dinderMeals').findOne({_id:String(previous.mealId)},options));return {meal,preferences,plan};
 }
 if(name==='dinder.calendar'){
  const from=String(input.from),to=String(input.to);if(to<from||Date.parse(to)-Date.parse(from)>799*86400000)throw new AppError(422,'calendar_range','Choose a calendar range of at most 800 days.');const found=await days().find({userId,date:{$gte:from,$lte:to},matchId:{$type:'string'}},options).sort({date:1}).limit(800).toArray();
  const records=await matches().find({_id:{$in:found.map(day=>day.matchId!)},members:userId,status:'matched'},options).limit(800).toArray(),otherIds=[...new Set(records.flatMap(match=>match.members.filter(id=>id!==userId)))],mealIds=[...new Set(records.map(match=>match.mealId))];
  const people=await users().find({_id:{$in:otherIds},suspendedAt:null},{...options,projection:{name:1,handle:1}}).limit(800).toArray(),blocked=await rows('blocks').find({pairId:{$in:otherIds.map(id=>pairId(userId,id))}},options).limit(800).toArray(),meals=await rows<MealRow>('dinderMeals').find({_id:{$in:mealIds}},{...options,projection:{name:1,imageUrl:1}}).limit(800).toArray();
  const byPerson=new Map(people.map(person=>[person._id,person])),byMeal=new Map(meals.map(meal=>[meal._id,meal])),blockedPairs=new Set(blocked.map(block=>block.pairId));
  return {items:records.flatMap(match=>{const id=match.members.find(id=>id!==userId)!,person=byPerson.get(id),meal=byMeal.get(match.mealId);return person&&meal&&!blockedPairs.has(pairId(userId,id))?[{date:match.plans.find(plan=>plan.userId===userId)!.date,matchId:match._id,mealName:meal.name,imageUrl:meal.imageUrl,personName:person.handle?`@${person.handle}`:person.name,startAt:match.startAt}]:[];})};
 }
 const match=await dinderMatchFor(userId,String(input.matchId),session),otherId=match.members.find(id=>id!==userId)!;
 if(name==='dinder.get')return projection(match,userId,session);
 if(name==='dinder.messages'){
  const cursor=input.before?requireValue(await rows('dinderMessages').findOne({_id:String(input.before),matchId:match._id},options)):null;
  const found=await rows('dinderMessages').find({matchId:match._id,...(cursor?{$or:[{createdAt:{$lt:cursor.createdAt}},{createdAt:cursor.createdAt,_id:{$lt:cursor._id}}]}:{})},options).sort({createdAt:-1,_id:-1}).limit(limit+1).toArray();
  return {items:found.slice(0,limit).map(messageProjection),nextCursor:found.length>limit?found[limit-1]._id:null,match:await projection(match,userId,session)};
 }
 await contactLock(userId,otherId,session);
 requireValue(await users().findOneAndUpdate({_id:otherId,suspendedAt:null},{$inc:{dinderRevision:1}},{...options,returnDocument:'after'}),'This meal match is unavailable.');
 if(name==='dinder.mark_read'){
  const boundary=input.messageId?requireValue(await rows('dinderMessages').findOne({_id:String(input.messageId),matchId:match._id},options)):null;
  await rows('notifications').updateMany({userId,matchId:match._id,readAt:null,$or:[{kind:'dinder_match'},...(boundary?[{kind:'dinder_message',messageId:{$lte:boundary._id}}]:[])]},{$set:{readAt:now}},options);return {read:true};
 }
 if(match.status!=='matched')throw new AppError(409,'meal_match_ended','This meal match has ended. Your messages are kept.');
 if(name==='dinder.message_send'){
  const prior=await rows('dinderMessages').findOne({matchId:match._id,fromId:userId,clientId:String(input.clientId)},options);if(prior){if(prior.text!==input.text)throw new AppError(409,'message_conflict','This message ID was already used.');return messageProjection(prior);}
  const row:Row={_id:new ObjectId().toHexString(),matchId:match._id,fromId:userId,text:String(input.text),clientId:String(input.clientId),createdAt:now};
  await rows('dinderMessages').insertOne(row,options);await notify(otherId,userId,match,'dinder_message','New message about your meal',row._id,session);await change(match,session);return messageProjection(row);
 }
 if(match.revision!==Number(input.revision))throw new AppError(409,'meal_match_changed','This meal match changed. Reload it before trying again.');
 if(name==='dinder.again'){
  match.againVotes=input.vote?[...new Set([...(match.againVotes||[]),userId])]:(match.againVotes||[]).filter(id=>id!==userId);
  if(match.againVotes.length===2&&!match.nextMatchId){
   const plans=match.plans.map(plan=>dinnerPlan(plan.userId,plan,addCookingDays(plan.date,7)));
   if(!compatibleDinnerPlans(plans[0],plans[1],clock))throw new AppError(409,'cooking_time_changed','Next week is outside the matching window.');
   for(const plan of plans)if((await days().findOne({_id:dayId(plan.userId,plan.date)},options))?.matchId)throw new AppError(409,'cooking_day_taken','One of you already has a match on that day.');
   const next:MatchRow={_id:randomUUID(),mealId:match.mealId,members:match.members,plans,...dinnerSchedule(plans[0],plans[1]),mode:'virtual',status:'matched',revision:1,postponeVotes:[],againVotes:[],createdAt:now,updatedAt:now};
   await matches().insertOne(next,options);
   const meal=requireValue(await rows<MealRow>('dinderMeals').findOne({_id:match.mealId},options));
   for(const plan of plans){await days().updateOne({_id:dayId(plan.userId,plan.date)},{$set:{userId:plan.userId,date:plan.date,timeZone:plan.timeZone,matchId:next._id}},{...options,upsert:true});await rows('dinderLikes').deleteMany({userId:plan.userId,date:plan.date},options);await notify(plan.userId,next.members.find(id=>id!==plan.userId)!,next,'dinder_match',meal.name,undefined,session);}
   match.nextMatchId=next._id;await change(next,session);
  }
  match.revision++;match.updatedAt=now;
 }else if(name==='dinder.cancel'){
  match.status='cancelled';match.revision++;match.updatedAt=now;
  for(const plan of match.plans)await days().updateOne({_id:dayId(plan.userId,plan.date),matchId:match._id},{$unset:{matchId:''}},options);
 }else if(name==='dinder.postpone'){
  match.postponeVotes=input.vote?[...new Set([...match.postponeVotes,userId])]:match.postponeVotes.filter(id=>id!==userId);
  if(match.postponeVotes.length===2){
   const plans=match.plans.map(plan=>dinnerPlan(plan.userId,plan,addCookingDays(plan.date,1)));
   if(!compatibleDinnerPlans(plans[0],plans[1],clock))throw new AppError(409,'cooking_time_changed','The next day is outside your matching window. Choose a new meal instead.');
   for(const plan of plans){const old=requireValue(await days().findOne({_id:dayId(plan.userId,match.plans.find(previous=>previous.userId===plan.userId)!.date)},options));const next=await days().findOne({_id:dayId(plan.userId,plan.date)},options);if(next?.matchId)throw new AppError(409,'cooking_day_taken','One of you already has a meal match on the next day.');await days().updateOne({_id:dayId(plan.userId,plan.date)},{$set:{userId:plan.userId,date:plan.date,timeZone:plan.timeZone,matchId:match._id}},{...options,upsert:true});await days().updateOne({_id:old._id,matchId:match._id},{$unset:{matchId:''}},options);await rows('dinderLikes').deleteMany({userId:plan.userId,date:plan.date},options);}
   match.plans=plans;Object.assign(match,dinnerSchedule(plans[0],plans[1]));match.postponeVotes=[];
  }
  match.revision++;match.updatedAt=now;
 }else throw new AppError(404,'operation_unknown','Unknown meal operation.');
 await matches().replaceOne({_id:match._id},match,options);await change(match,session);return projection(match,userId,session);
}

/** Saved opt-in authorizes replay, fenced on the same user document as settings and suspension. One owner and at most eight choices per tick. */
export async function replayDinderChoices(){
 const lease=randomUUID(),clock=Date.now(),rollovers=rows<RolloverRow>('dinderRollovers');
 const work=await rollovers.findOneAndUpdate({nextAt:{$lte:clock},leaseUntil:{$lte:clock}},{$set:{lease,leaseUntil:clock+120000}},{sort:{nextAt:1},returnDocument:'after'});if(!work)return;
 try{
  const preferences=await rows<PreferencesRow>('dinderPreferences').findOne({_id:work._id});
  if(!preferences?.carrySwipes){await rollovers.deleteOne({_id:work._id,lease});return;}
  const plan=nextDinnerPlan(work._id,preferences,clock),after=work.desiredAt===plan.desiredAt?work.after:undefined;
  const choices=await rows<ChoiceRow>('dinderChoices').find({userId:work._id,liked:true,pending:true,...(after?{_id:{$gt:after}}:{})}).sort({_id:1}).limit(9).toArray();
  let matched=false;
  for(const choice of choices.slice(0,8)){
   matched=await transaction(async session=>{
    const owner=await users().findOneAndUpdate({_id:work._id,handle:{$type:'string'},suspendedAt:null},{$inc:{dinderRevision:1}},{session,returnDocument:'after'});
    const current=await rows<PreferencesRow>('dinderPreferences').findOne({_id:work._id},{session});
    if(!owner||!current?.carrySwipes||current.revision!==preferences.revision||!await rollovers.findOne({_id:work._id,lease},{session})||!await rows<ChoiceRow>('dinderChoices').findOne({_id:choice._id,liked:true,pending:true},{session}))return false;
    const meal=await rows<MealRow>('dinderMeals').findOne({_id:choice.mealId},{session});if(!meal||meal.catalogApproved!==true||dinderCategoryFilters(current.excludedCategories||[]).includes(meal.category))return false;
    const livePlan=nextDinnerPlan(work._id,current),result=await dinderOperation('dinder.swipe',{mealId:choice.mealId,liked:true,desiredAt:livePlan.desiredAt,preferencesRevision:current.revision},{userId:work._id,source:'external',scope:'write'},session) as {match:unknown};
    return Boolean(result.match);
   });
   if(matched)break;
  }
  await rollovers.updateOne({_id:work._id,lease},{$set:{nextAt:!matched&&choices.length>8?Date.now()+2500:Date.parse(plan.cutoffAt),desiredAt:plan.desiredAt,leaseUntil:0,...(!matched&&choices.length>8?{after:choices[7]._id}:{})},$unset:{lease:'',...(!matched&&choices.length>8?{}:{after:''})}});
 }catch(error){await rollovers.updateOne({_id:work._id,lease},{$set:{nextAt:Date.now()+30000,leaseUntil:0},$unset:{lease:''}});throw error;}
}
export function startDinderRolloverWorker(){let pending:Promise<void>|undefined;const tick=()=>{if(!pending)pending=replayDinderChoices().catch(error=>console.error('Dinder carry-over:',error instanceof Error?error.name:'unavailable')).finally(()=>{pending=undefined;});};tick();const timer=setInterval(tick,2500);return async()=>{clearInterval(timer);await pending;};}
