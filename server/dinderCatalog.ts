import {randomUUID,createHash} from 'node:crypto';
import type {ClientSession} from 'mongodb';
import basedCooking from '../data/dinder/based-cooking.json';
import {z} from 'zod';
import {rows} from './db';
import {mealSchema,type Meal} from '../shared/dinder';
import {dinderCategoryFilters} from '../shared/dinderCategories';
import {DINDER_REVIEW_VERSION,reviewedDinderMeal} from './dinderReview';

export interface MealRow extends Meal {_id:string;orderKey?:string|null;catalogApproved?:boolean;catalogReviewVersion?:string;catalogReviewReason?:string|null}
interface CatalogState {_id:string;categories?:string[];ready?:boolean;nextSyncAt?:number;lease?:string;leaseUntil?:number;letter?:number;offset?:number;after?:string;revision?:string;count?:number}
const states=()=>rows<CatalogState>('dinderCatalog');
export const mealOrderKey=(id:string)=>createHash('sha256').update(id).digest('hex');
export async function dinderCatalogMeta(session?:ClientSession){
 const sources=await states().find({_id:{$in:['themealdb','based-cooking']}},{session,projection:{categories:1,ready:1}}).limit(2).toArray();
 const current=await states().findOne({_id:'review',revision:DINDER_REVIEW_VERSION},{session,projection:{categories:1}});
 return {categories:current?.categories?.length?current.categories:dinderCategoryFilters(sources.flatMap(source=>source.categories||[])).sort(),ready:sources.some(source=>source.ready)};
}
/** Publish this individually reviewed version in bounded batches; source records and old matches are retained. */
export async function reviewDinderCatalog(){
 const lease=randomUUID(),now=Date.now();
 try{await states().updateOne({_id:'review'},{$setOnInsert:{revision:DINDER_REVIEW_VERSION,ready:false,after:'',categories:[],leaseUntil:0}},{upsert:true});}catch(error){if((error as {code?:number}).code!==11000)throw error;}
 await states().updateOne({_id:'review',revision:{$ne:DINDER_REVIEW_VERSION}},{$set:{revision:DINDER_REVIEW_VERSION,ready:false,after:'',categories:[],leaseUntil:0},$unset:{lease:''}});
 const state=await states().findOneAndUpdate({_id:'review',revision:DINDER_REVIEW_VERSION,ready:{$ne:true},leaseUntil:{$lte:now}},{$set:{lease,leaseUntil:now+60000}},{returnDocument:'after'});
 if(!state)return;
 try{
  const batch=await rows<MealRow>('dinderMeals').find(state.after?{_id:{$gt:state.after}}:{}).sort({_id:1}).limit(100).toArray(),meals=batch.map(meal=>reviewedDinderMeal(mealSchema.parse(meal)));
  if(meals.length)await rows<MealRow>('dinderMeals').bulkWrite(meals.map(meal=>({updateOne:{filter:{_id:meal.id},update:{$set:{category:meal.category,catalogApproved:meal.catalogApproved,catalogReviewVersion:meal.catalogReviewVersion,catalogReviewReason:meal.catalogReviewReason}}}})));
  const categories=[...new Set([...(state.categories||[]),...meals.filter(meal=>meal.catalogApproved).map(meal=>meal.category)])].sort();
  await states().updateOne({_id:state._id,lease},{$set:{categories,ready:batch.length<100,after:batch.at(-1)?._id||state.after||'',leaseUntil:0},$unset:{lease:''}});
 }catch(error){await states().updateOne({_id:state._id,lease},{$set:{leaseUntil:now+30000},$unset:{lease:''}});throw error;}
}
/** Backfill stable mixed-source ordering in bounded batches, preserving every meal ID and saved swipe. */
export async function orderDinderCatalog(){
 const lease=randomUUID(),now=Date.now();
 try{await states().updateOne({_id:'ordering'},{$setOnInsert:{ready:false,leaseUntil:0}},{upsert:true});}catch(error){if((error as {code?:number}).code!==11000)throw error;}
 const state=await states().findOneAndUpdate({_id:'ordering',ready:{$ne:true},leaseUntil:{$lte:now}},{$set:{lease,leaseUntil:now+60000}},{returnDocument:'after'});
 if(!state)return;
 const batch=await rows<MealRow>('dinderMeals').find({orderKey:null},{projection:{id:1}}).sort({_id:1}).limit(100).toArray();
 if(batch.length)await rows<MealRow>('dinderMeals').bulkWrite(batch.map(meal=>({updateOne:{filter:{_id:meal._id},update:{$set:{orderKey:mealOrderKey(meal.id)}}}})));
 await states().updateOne({_id:state._id,lease},{$set:{ready:batch.length<100,leaseUntil:0},$unset:{lease:''}});
}
/** The checked-in public-domain snapshot contains only recipes with a real source photograph. */
export async function seedBasedCooking(){
 const lease=randomUUID(),now=Date.now();
 try{await states().updateOne({_id:'based-cooking'},{$setOnInsert:{offset:0,leaseUntil:0}},{upsert:true});}catch(error){if((error as {code?:number}).code!==11000)throw error;}
 const state=await states().findOneAndUpdate({_id:'based-cooking',leaseUntil:{$lte:now},$or:[{revision:{$ne:basedCooking.revision}},{ready:{$ne:true}}]},{$set:{lease,leaseUntil:now+60000}},{returnDocument:'after'});
 if(!state)return;
 try{
  const offset=state.revision===basedCooking.revision?state.offset||0:0,meals=basedCooking.meals.slice(offset,offset+100).map(value=>mealSchema.parse(value));
  if(meals.length)await rows<MealRow>('dinderMeals').bulkWrite(meals.map(meal=>({updateOne:{filter:{_id:meal.id},update:{$set:{...reviewedDinderMeal(meal),orderKey:mealOrderKey(meal.id)}},upsert:true}})));
  const next=offset+meals.length,categories=[...new Set(basedCooking.meals.map(meal=>reviewedDinderMeal(meal)).filter(meal=>meal.catalogApproved).map(meal=>meal.category))].sort();
  await states().updateOne({_id:state._id,lease},{$set:{revision:basedCooking.revision,offset:next,count:basedCooking.meals.length,categories,ready:next>=basedCooking.meals.length,leaseUntil:0},$unset:{lease:''}});
 }catch(error){await states().updateOne({_id:state._id,lease},{$set:{leaseUntil:now+60000},$unset:{lease:''}});throw error;}
}
const sourceMeal=z.object({idMeal:z.string().regex(/^\d{1,12}$/),strMeal:z.string(),strCategory:z.string(),strArea:z.string().nullish(),strMealThumb:z.string(),strSource:z.string().nullish(),strInstructions:z.string().nullish()}).catchall(z.unknown());
const safeUrl=(value:unknown)=>{try{const url=new URL(String(value));return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}};
export function parseMealDB(value:unknown):Meal{
 const raw=sourceMeal.parse(value),ingredients:Meal['ingredients']=[];
 for(let index=1;index<=20;index++){const name=String(raw[`strIngredient${index}`]||'').trim();if(name)ingredients.push({name,measure:String(raw[`strMeasure${index}`]||'').trim()});}
 const imageUrl=safeUrl(raw.strMealThumb);if(!imageUrl||new URL(imageUrl).hostname!=='www.themealdb.com')throw Error('Invalid meal image.');
 return mealSchema.parse({id:raw.idMeal,name:raw.strMeal.trim(),category:raw.strCategory.trim(),area:raw.strArea||'',sourceName:'TheMealDB',imageUrl,sourceUrl:safeUrl(raw.strSource)||`https://www.themealdb.com/meal/${raw.idMeal}`,instructions:raw.strInstructions||'',ingredients});
}
/** One fixed upstream, one bounded alphabet page per tick. Catalog reads never fetch a remote URL. */
export async function syncDinderCatalog(fetcher=fetch){
 const now=Date.now(),lease=randomUUID();
 try{await states().updateOne({_id:'themealdb'},{$setOnInsert:{letter:0,nextSyncAt:0,leaseUntil:0}},{upsert:true});}catch(error){if((error as {code?:number}).code!==11000)throw error;}
 const state=await states().findOneAndUpdate({_id:'themealdb',nextSyncAt:{$lte:now},leaseUntil:{$lte:now}},{$set:{lease,leaseUntil:now+60000}},{returnDocument:'after'});
 if(!state)return;
 try{
  const letter=state.letter||0,key=process.env.THEMEALDB_API_KEY||'1';
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(key))throw Error('Invalid meal API configuration.');
  const response=await fetcher(`https://www.themealdb.com/api/json/v1/${key}/search.php?f=${String.fromCharCode(97+letter)}`,{signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok)throw Error('Meal catalog is temporarily unavailable.');
  const reader=response.body?.getReader();if(!reader)throw Error('Meal catalog response is empty.');
  const chunks:Uint8Array[]=[];let bytes=0;
  try{while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>4*1024*1024)throw Error('Meal catalog page is too large.');chunks.push(next.value);}}finally{await reader.cancel().catch(()=>{});}
  const body=Buffer.concat(chunks).toString('utf8');
  const data=z.object({meals:z.array(z.unknown()).max(500).nullable()}).parse(JSON.parse(body));
  const meals=(data.meals||[]).map(parseMealDB);
  if(meals.length)await rows<MealRow>('dinderMeals').bulkWrite(meals.map(meal=>({updateOne:{filter:{_id:meal.id},update:{$set:{...reviewedDinderMeal(meal),orderKey:mealOrderKey(meal.id)}},upsert:true}})));
  const categories=[...new Set([...(state.categories||[]),...meals.map(meal=>meal.category)])].sort();
  await states().updateOne({_id:state._id,lease},{$set:{categories,ready:state.ready||meals.length>0,letter:letter===25?0:letter+1,nextSyncAt:letter===25?now+7*86400000:now+2000,leaseUntil:0},$unset:{lease:''}});
 }catch(error){await states().updateOne({_id:state._id,lease},{$set:{leaseUntil:0,nextSyncAt:now+60000},$unset:{lease:''}});throw error;}
}
export function startDinderCatalogWorker(){
 let pending:Promise<void>|undefined;
 const tick=()=>{if(!pending)pending=(async()=>{await orderDinderCatalog();await reviewDinderCatalog();await seedBasedCooking();await syncDinderCatalog();})().catch(error=>console.error('Dinder catalog:',error instanceof Error?error.message:'unavailable')).finally(()=>{pending=undefined;});};
 tick();const timer=setInterval(tick,2500);
 return async()=>{clearInterval(timer);await pending;};
}
