import {z} from 'zod';
import {Temporal} from '@js-temporal/polyfill';

export const cookingMode=z.literal('virtual');
export const DEFAULT_DINNER_START='17:30';
export const cookingDate=z.iso.date();
export const cookingTimeZone=z.string().min(1).max(64).refine(value=>{try{Temporal.Now.zonedDateTimeISO(value);return true;}catch{return false;}},'Choose a valid timezone.');
export const dinnerTime=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/,'Choose a dinner start time.');
export const dinderPreferences=z.object({startTime:dinnerTime,timeZone:cookingTimeZone,mode:cookingMode,carrySwipes:z.boolean(),excludedCategories:z.array(z.string()).default([]),revision:z.number().int().nonnegative()});
export type DinderPreferences=z.infer<typeof dinderPreferences>;
export const cookingPlan=z.object({userId:z.string(),date:cookingDate,startTime:dinnerTime,timeZone:cookingTimeZone,desiredAt:z.iso.datetime(),cutoffAt:z.iso.datetime()});
export type CookingPlan=z.infer<typeof cookingPlan>;
export const mealSchema=z.object({
 id:z.string(),name:z.string(),category:z.string(),area:z.string(),imageUrl:z.url(),
 sourceUrl:z.url(),sourceName:z.string().optional(),instructions:z.string(),ingredients:z.array(z.object({name:z.string(),measure:z.string()})),
});
export type Meal=z.infer<typeof mealSchema>;
export const mealCardSchema=mealSchema.omit({instructions:true,ingredients:true});
export type MealCard=z.infer<typeof mealCardSchema>;
export function mealThumbnail(url:string){return new URL(url).hostname==='www.themealdb.com'?`${url}/medium`:url;}
export const dinderPerson=z.object({id:z.string(),name:z.string(),handle:z.string().optional(),photoId:z.string().optional(),profileAvailable:z.boolean()});
export const dinderMatch=z.object({
 id:z.uuid(),meal:mealSchema,members:z.array(z.string()).length(2),people:z.array(dinderPerson).length(2),
 date:cookingDate,startAt:z.iso.datetime(),deadlineAt:z.iso.datetime(),plans:z.array(cookingPlan).length(2),mode:cookingMode,status:z.enum(['matched','cancelled']),revision:z.number().int().positive(),
 postponeVotes:z.array(z.string()),againVotes:z.array(z.string()).default([]),nextMatchId:z.uuid().optional(),createdAt:z.string(),updatedAt:z.string(),
});
export type DinderMatch=z.infer<typeof dinderMatch>;
export const dinderMessage=z.object({id:z.string(),matchId:z.uuid(),fromId:z.string(),text:z.string(),createdAt:z.string(),clientId:z.string().optional()});
export type DinderMessage=z.infer<typeof dinderMessage>;
export const dinderDeck=z.object({items:z.array(mealSchema),categories:z.array(z.string()),preferences:dinderPreferences,nextCursor:z.string().nullable(),catalogReady:z.boolean(),plan:cookingPlan,match:dinderMatch.nullable()});
export type DinderDeck=z.infer<typeof dinderDeck>;
export const dinderMatchPage=z.object({items:z.array(dinderMatch),nextCursor:z.string().nullable()});
export const dinderMessagePage=z.object({items:z.array(dinderMessage),nextCursor:z.string().nullable(),match:dinderMatch});
export const dinderOutputs={
 'dinder.preferences':z.object({preferences:dinderPreferences.nullable()}),'dinder.preferences_update':dinderPreferences,
 'dinder.deck':dinderDeck,
 'dinder.catalog':z.object({items:z.array(mealCardSchema),nextCursor:z.string().nullable(),total:z.number().int().nonnegative()}),
 'dinder.recipe':mealSchema,
 'dinder.swipe':z.object({mealId:z.string(),liked:z.boolean(),preferences:dinderPreferences,match:dinderMatch.nullable()}),
 'dinder.back':z.object({meal:mealSchema,preferences:dinderPreferences,plan:cookingPlan}),
 'dinder.again':dinderMatch,
 'dinder.calendar':z.object({items:z.array(z.object({date:cookingDate,matchId:z.uuid(),mealName:z.string(),imageUrl:z.url(),personName:z.string(),startAt:z.iso.datetime()}))}),
 'dinder.matches':dinderMatchPage,'dinder.get':dinderMatch,'dinder.cancel':dinderMatch,'dinder.postpone':dinderMatch,
 'dinder.messages':dinderMessagePage,'dinder.message_send':dinderMessage,
 'dinder.mark_read':z.object({read:z.literal(true)}),
};
export function dateInZone(timeZone:string,now=Date.now()){return Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(timeZone).toPlainDate().toString();}
export function addCookingDays(date:string,days:number){return Temporal.PlainDate.from(date).add({days}).toString();}
export function cookingDayEnd(date:string,timeZone:string){return new Date(Temporal.PlainDate.from(date).add({days:1}).toZonedDateTime({timeZone,plainTime:'00:00'}).epochMilliseconds);}
export const DINNER_NOTICE_MS=3*60*60*1000;
export const DINNER_WINDOW_MS=60*60*1000;
/** Calendar arithmetic preserves the local wall-clock time through DST. A missing time shifts forward; an ambiguous time uses its first occurrence. */
export function dinnerPlan(userId:string,preferences:Pick<DinderPreferences,'startTime'|'timeZone'>,date:string):CookingPlan{
 const day=Temporal.PlainDate.from(date),time=Temporal.PlainTime.from(preferences.startTime);
 const desired=day.toZonedDateTime({timeZone:preferences.timeZone,plainTime:time}).epochMilliseconds;
 return {userId,date,startTime:preferences.startTime,timeZone:preferences.timeZone,desiredAt:new Date(desired).toISOString(),cutoffAt:new Date(desired-DINNER_NOTICE_MS).toISOString()};
}
export function nextDinnerPlan(userId:string,preferences:Pick<DinderPreferences,'startTime'|'timeZone'>,now=Date.now()):CookingPlan{
 const today=dateInZone(preferences.timeZone,now),plan=dinnerPlan(userId,preferences,today);
 return now<Date.parse(plan.cutoffAt)?plan:dinnerPlan(userId,preferences,addCookingDays(today,1));
}
export function compatibleDinnerPlans(a:CookingPlan,b:CookingPlan,now=Date.now()){
 return Math.abs(Date.parse(a.desiredAt)-Date.parse(b.desiredAt))<=DINNER_WINDOW_MS&&now<Math.min(Date.parse(a.cutoffAt),Date.parse(b.cutoffAt));
}
export function dinnerSchedule(a:CookingPlan,b:CookingPlan){return {startAt:new Date(Math.round((Date.parse(a.desiredAt)+Date.parse(b.desiredAt))/120000)*60000).toISOString(),deadlineAt:new Date(Math.min(Date.parse(a.cutoffAt),Date.parse(b.cutoffAt))).toISOString()};}
