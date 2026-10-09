import {randomUUID} from 'node:crypto';
import {beforeAll,beforeEach,afterEach,afterAll,expect,it,vi} from 'vitest';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {users,type User,type Actor} from '../server/auth';
import {executeOperation} from '../server/operations';
import {notificationState} from '../server/notifications';
import {syncDinderCatalog,seedBasedCooking,orderDinderCatalog} from '../server/dinderCatalog';
import {replayDinderChoices} from '../server/dinder';
import {nextDinnerPlan} from '../shared/dinder';
import {localMcp} from '../server/mcp';

const initialClock=Date.parse('2035-06-09T15:00:00Z');
const actor=(userId:string):Actor=>({userId,source:'external',scope:'write'});
const call=(name:string,input:unknown={},userId='a',key=randomUUID(),confirmed=true)=>executeOperation(name,input,actor(userId),key,{confirmed}) as Promise<any>;
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated test database required.');for(const collection of await db().collections())await collection.deleteMany({});}
const meal=(id:string)=>({_id:id,id,name:`Recipe ${id}`,category:'Vegetarian',catalogApproved:true,area:'Italian',imageUrl:'https://www.themealdb.com/images/media/meals/ustsqw1468250014.jpg',sourceUrl:'https://www.themealdb.com/meal/52771',instructions:'Cook the pasta.',ingredients:[{name:'Pasta',measure:'200 g'}]});
beforeAll(async()=>{await connectDatabase();if(db().databaseName!=='newdrugs_test')throw Error('Isolated test database required.');});
beforeEach(async()=>{
 await clean();vi.spyOn(Date,'now').mockReturnValue(initialClock);
 const base:Omit<User,'_id'>={name:'Member',bio:'',city:'',cityKey:'',interests:[],discoverable:false,balanceNanos:0,reservedNanos:0,createdAt:new Date().toISOString()};
 await users().insertMany(['a','b','c','d'].map(id=>({...base,_id:id,handle:id,name:id})));
 await rows('dinderMeals').insertMany([meal('1'),meal('2'),meal('3')]);
 await rows('dinderCatalog').insertOne({_id:'themealdb',categories:['Vegetarian'],ready:true,letter:0,nextSyncAt:0,leaseUntil:0});
 for(const userId of ['a','b','c','d'])await call('dinder.preferences_update',{startTime:'19:00',timeZone:'America/New_York',mode:'virtual'},userId);
});
afterEach(()=>vi.restoreAllMocks());afterAll(async()=>{await clean();await mongo.close();});
async function swipe(userId:string,mealId='1',liked=true,key=randomUUID()){
 const {preferences}=await call('dinder.preferences',{},userId),deck=await call('dinder.deck',{},userId);
 return call('dinder.swipe',{mealId,liked,desiredAt:deck.plan.desiredAt,preferencesRevision:preferences.revision},userId,key);
}
async function match(){await swipe('a');return (await swipe('b')).match;}
it('runs a cooking night through MCP with recipe links and scoped chat reads and writes',async()=>{
 const matched=await match(),mcp=await localMcp(actor('a'),{});
 try{
  const recipe=await mcp.client.callTool({name:'newdrugs_read',arguments:{operation:'dinder.recipe',input:{mealId:matched.meal.id}}});
  expect(recipe.structuredContent).toMatchObject({ok:true,data:{sourceUrl:'https://www.themealdb.com/meal/52771',instructions:'Cook the pasta.'}});
  expect((recipe.structuredContent as any).links).toContainEqual(expect.objectContaining({resourceType:'recipe',url:'https://www.themealdb.com/meal/52771'}));
  const key=randomUUID(),sent=await mcp.client.callTool({name:'newdrugs_execute',arguments:{operation:'dinder.message_send',input:{matchId:matched.id,text:'I have the pasta.',clientId:key},idempotencyKey:key}});
  expect(sent.structuredContent).toMatchObject({ok:true,data:{matchId:matched.id,text:'I have the pasta.'}});
  const messages=await mcp.client.callTool({name:'newdrugs_read',arguments:{operation:'dinder.messages',input:{matchId:matched.id}}});
  expect((messages.structuredContent as any).data.items).toMatchObject([{fromId:'a',text:'I have the pasta.'}]);
 }finally{await mcp.close();}
});

it('pairs mutual meal likes with a scoped conversation, without adding Friends, DMs or Log entries',async()=>{
 await call('dinder.preferences_update',{startTime:'20:00',timeZone:'America/New_York'},'b');
 const first=await swipe('a');expect(first.match).toBeNull();const second=await swipe('b'),matched=second.match;
 expect(matched.members).toEqual(['a','b']);expect(matched.startAt).toBe('2035-06-09T23:30:00.000Z');expect(matched.deadlineAt).toBe('2035-06-09T20:00:00.000Z');
 for(const name of ['connections','directMessages','logEntries'])expect(await rows(name).countDocuments()).toBe(0);
 expect((await call('people.get',{personId:'b'})).id).toBe('b');
 const notices=await notificationState('a');expect(notices.items.find(item=>item.kind==='dinder_match')?.link.url).toContain(`/dinder/${matched.id}`);
});
it('serializes simultaneous likes and multiple meals so nobody gets two dinners in the same slot',async()=>{
 const results=await Promise.all([swipe('a'),swipe('b'),swipe('c')]);
 expect(await rows('dinderMatches').countDocuments()).toBe(1);
 const matched=results.find(result=>result.match)?.match;expect(matched).toBeTruthy();
 const spare=['a','b','c'].find(id=>!matched.members.includes(id))!;
 await swipe('d','2');const pairedAgain=await swipe(matched.members[0],'2');expect(pairedAgain.match.id).toBe(matched.id);
 const second=await swipe(spare,'2');expect(second.match.members).toEqual([spare,'d'].sort());
 expect(await rows('dinderMatches').countDocuments()).toBe(2);
});
it('preserves exact idempotency and rejects a stale card at the three-hour cutoff',async()=>{
 const deck=await call('dinder.deck'),{preferences}=await call('dinder.preferences'),key=randomUUID(),input={mealId:'1',liked:true,desiredAt:deck.plan.desiredAt,preferencesRevision:preferences.revision};
 const first=await call('dinder.swipe',input,'a',key);expect(await call('dinder.swipe',input,'a',key)).toEqual(first);
 vi.mocked(Date.now).mockReturnValue(Date.parse(deck.plan.cutoffAt));
 await expect(call('dinder.swipe',input,'a')).rejects.toMatchObject({code:'dinder_slot_changed'});
 expect((await call('dinder.deck')).plan.date).toBe('2035-06-10');
 expect((await swipe('b')).match).toBeNull();expect(await rows('dinderMatches').countDocuments()).toBe(0);
});
it('does not match different meals or preferred times more than an hour apart',async()=>{
 await swipe('a');expect((await swipe('b','2')).match).toBeNull();
 await call('dinder.preferences_update',{startTime:'20:01',timeZone:'America/New_York'},'b');expect((await swipe('b')).match).toBeNull();
});
it('respects blocks and hides while matching',async()=>{
 await swipe('a');await call('people.block',{personId:'a',blocked:true},'b');expect((await swipe('b')).match).toBeNull();
 await rows('peopleHides').insertOne({_id:'hidden',userId:'c',personId:'a'});expect((await swipe('c')).match.members).toEqual(['b','c']);
 expect((await call('dinder.matches',{},'a')).items).toHaveLength(0);
});
it('authorizes only match participants, respects blocks, and keeps cancelled message history',async()=>{
 const matched=await match(),clientId=randomUUID(),key=randomUUID(),input={matchId:matched.id,text:'I have the pasta.',clientId};
 const message=await call('dinder.message_send',input,'a',key,false);expect(await call('dinder.message_send',input,'a',key,false)).toEqual(message);
 await expect(call('dinder.get',{matchId:matched.id},'c')).rejects.toMatchObject({status:404});
 await expect(call('dinder.messages',{matchId:matched.id},'c')).rejects.toMatchObject({status:404});
 await call('dinder.cancel',{matchId:matched.id,revision:matched.revision},'a');
 expect((await call('dinder.messages',{matchId:matched.id},'b')).items[0].text).toBe('I have the pasta.');
 await expect(call('dinder.message_send',{...input,clientId:randomUUID()},'b',randomUUID(),false)).rejects.toMatchObject({code:'meal_match_ended'});
 expect(await rows('dinderMessages').countDocuments()).toBe(1);
 await call('people.block',{personId:'a',blocked:true},'b');await expect(call('dinder.messages',{matchId:matched.id})).rejects.toMatchObject({status:404});
});
it('moves a dinner only after both people vote, preserving local time and scoped messages',async()=>{
 const matched=await match(),first=await call('dinder.postpone',{matchId:matched.id,revision:matched.revision,vote:true});
 expect(first.date).toBe(matched.date);expect(first.postponeVotes).toEqual(['a']);
 const second=await call('dinder.postpone',{matchId:matched.id,revision:first.revision,vote:true},'b');expect(second.date).toBe('2035-06-10');expect(second.startAt).toBe('2035-06-10T23:00:00.000Z');expect(second.postponeVotes).toEqual([]);
 expect(await rows('dinderMatches').countDocuments()).toBe(1);
});
it('withdraws pending choices on preference changes while leaving committed matches intact',async()=>{
 const matched=await match();await swipe('c');expect(await rows('dinderLikes').countDocuments({userId:'c'})).toBe(1);
 await call('dinder.preferences_update',{startTime:'18:00',timeZone:'America/New_York'},'c');expect(await rows('dinderLikes').countDocuments({userId:'c'})).toBe(0);
 expect(await rows('dinderSwipes').countDocuments({userId:'c'})).toBe(1);
 await call('dinder.preferences_update',{startTime:'18:00',timeZone:'America/New_York'});expect((await call('dinder.get',{matchId:matched.id})).startAt).toBe(matched.startAt);
});
it('keeps newer unseen messages unread when marking an older boundary',async()=>{
 const matched=await match(),first=await call('dinder.message_send',{matchId:matched.id,text:'First',clientId:randomUUID()}),second=await call('dinder.message_send',{matchId:matched.id,text:'Second',clientId:randomUUID()});
 await call('dinder.mark_read',{matchId:matched.id,messageId:first.id},'b');
 expect(await rows('notifications').findOne({userId:'b',kind:'dinder_message',messageId:second.id,readAt:null})).toBeTruthy();
 await call('dinder.mark_read',{matchId:matched.id,messageId:second.id},'b');expect(await rows('notifications').countDocuments({userId:'b',matchId:matched.id,readAt:null})).toBe(0);
});
it('filters decks by category and avoids repeating passed meals in the same dinner window',async()=>{
 await swipe('a','1',false);const deck=await call('dinder.deck',{category:'Vegetarian'});expect(deck.items.map((meal:any)=>meal.id)).toEqual(['2','3']);
 expect(nextDinnerPlan('a',{startTime:'19:00',timeZone:'America/New_York'},initialClock).desiredAt).toBe(deck.plan.desiredAt);
});
it('fetches one bounded real-catalog alphabet page, caching recipes and advancing the import cursor',async()=>{
 const fetcher=vi.fn(async(url:string|URL|Request)=>new Response(JSON.stringify({meals:[{idMeal:'52771',strMeal:'Spicy Arrabiata',strCategory:'Vegetarian',strArea:'Italian',strMealThumb:'https://www.themealdb.com/images/media/meals/ustsqw1468250014.jpg',strSource:null,strInstructions:'Cook pasta.',strIngredient1:'Pasta',strMeasure1:'200 g'}]})));
 await syncDinderCatalog(fetcher);expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][0]).toMatch(/search.php\?f=a$/);
 expect(await rows('dinderMeals').findOne({_id:'52771'})).toMatchObject({name:'Spicy Arrabiata',ingredients:[{name:'Pasta',measure:'200 g'}]});expect((await rows('dinderCatalog').findOne({_id:'themealdb'}))?.letter).toBe(1);
});
it('adds the photographed public-domain recipes idempotently and keeps existing meals and likes',async()=>{
 await swipe('a');await seedBasedCooking();expect(await rows('dinderMeals').countDocuments({sourceName:'Based Cooking'})).toBe(100);
 await seedBasedCooking();await seedBasedCooking();expect(await rows('dinderMeals').countDocuments({sourceName:'Based Cooking'})).toBe(155);
 expect(await rows('dinderMeals').countDocuments()).toBe(158);expect(await rows('dinderChoices').findOne({userId:'a',mealId:'1',pending:true})).toBeTruthy();
 await orderDinderCatalog();expect((await rows('dinderCatalog').findOne({_id:'ordering'}))?.ready).toBe(true);
 const deck=await call('dinder.deck',{limit:30});expect(deck.items.every((meal:any)=>!('orderKey' in meal))).toBe(true);expect(deck.items.some((meal:any)=>meal.sourceName==='Based Cooking')).toBe(true);
 expect((await swipe('b')).match.meal.id).toBe('1');
});
it('pages the complete catalog independently of swipes and exposes ingredients without private cooking data',async()=>{
 await users().insertOne({_id:'guest',name:'Guest',bio:'',city:'',cityKey:'',interests:[],discoverable:false,balanceNanos:0,reservedNanos:0,createdAt:new Date().toISOString()});
 await swipe('a');const first=await call('dinder.catalog',{limit:2},'guest');expect(first.total).toBe(3);expect(first.items).toHaveLength(2);expect(first.nextCursor).toBe('2');
 const second=await call('dinder.catalog',{limit:2,before:first.nextCursor},'guest');expect(second.items.map((meal:any)=>meal.id)).toEqual(['3']);expect(second.nextCursor).toBeNull();
 expect(first.items[0]).not.toHaveProperty('instructions');expect(first).not.toHaveProperty('matches');
 expect(await call('dinder.recipe',{mealId:'1'},'guest')).toMatchObject({id:'1',instructions:'Cook the pasta.',ingredients:[{name:'Pasta',measure:'200 g'}]});
 await expect(call('dinder.messages',{matchId:randomUUID()},'guest')).rejects.toBeDefined();
 expect(await call('app.open',{view:'dinder',resourceId:'catalog'},'guest')).toMatchObject({open:'dinder',resourceId:'catalog'});
});
it('removes retired recipes from discovery and new matches while retaining existing recipe, chat and swipes',async()=>{
 const matched=await match();await call('dinder.message_send',{matchId:matched.id,text:'Keep this cooking history.',clientId:randomUUID()});
 await rows('dinderMeals').updateOne({_id:'1'},{$set:{catalogApproved:false}});
 expect((await call('dinder.catalog')).items.map((meal:any)=>meal.id)).toEqual(['2','3']);expect((await call('dinder.deck',{},'c')).items.map((meal:any)=>meal.id)).toEqual(['2','3']);
 await expect(swipe('c','1')).rejects.toMatchObject({code:'dinder_slot_changed'});
 expect((await call('dinder.get',{matchId:matched.id})).meal.id).toBe('1');expect((await call('dinder.messages',{matchId:matched.id})).items[0].text).toBe('Keep this cooking history.');
 expect(await rows('dinderSwipes').countDocuments({mealId:'1'})).toBe(2);expect((await call('dinder.recipe',{mealId:'1'})).sourceUrl).toBeTruthy();
});
it('reads old category exclusions through the shared mapping without resetting choices or preference revision',async()=>{
 await swipe('a');const saved=await rows('dinderPreferences').findOne({_id:'a'});
 await rows('dinderPreferences').updateOne({_id:'a'},{$set:{excludedCategories:['Chicken','Goat','Side','Starter']}});
 const preferences=(await call('dinder.preferences')).preferences;expect(preferences.excludedCategories).toEqual(['Poultry','Lamb & goat','Sides & starters']);
 await call('dinder.preferences_update',{startTime:preferences.startTime,timeZone:preferences.timeZone,excludedCategories:preferences.excludedCategories});
 expect((await rows('dinderPreferences').findOne({_id:'a'}))?.revision).toBe(saved?.revision);expect(await rows('dinderLikes').countDocuments({userId:'a',mealId:'1'})).toBe(1);
});
it('carries unmatched likes to the next window only when opted in, without requiring another swipe',async()=>{
 await call('dinder.preferences_update',{startTime:'19:00',timeZone:'America/New_York',carrySwipes:true});await swipe('a');
 vi.mocked(Date.now).mockReturnValue(Date.parse('2035-06-09T20:00:00Z'));await replayDinderChoices();
 const result=await swipe('b');expect(result.match.date).toBe('2035-06-10');expect(result.match.members).toEqual(['a','b']);
 expect(await rows('dinderChoices').countDocuments({mealId:'1',pending:true})).toBe(0);
 vi.mocked(Date.now).mockReturnValue(Date.parse('2035-06-10T20:00:00Z'));await replayDinderChoices();
 expect(await rows('dinderMatches').countDocuments()).toBe(1);
});
it('turning carry-over off preserves today’s likes and stops future automatic matching',async()=>{
 await call('dinder.preferences_update',{startTime:'19:00',timeZone:'America/New_York',carrySwipes:true});await swipe('a');
 await call('dinder.preferences_update',{startTime:'19:00',timeZone:'America/New_York',carrySwipes:false});
 expect(await rows('dinderLikes').countDocuments({userId:'a'})).toBe(1);
 vi.mocked(Date.now).mockReturnValue(Date.parse('2035-06-09T20:00:00Z'));await replayDinderChoices();expect((await swipe('b')).match).toBeNull();
 expect(await rows('dinderRollovers').countDocuments()).toBe(0);
});
it('opens straight to recipes with a 5:30 cooking-start default and saves it only on a swipe',async()=>{
 await rows('dinderPreferences').deleteOne({_id:'a'});
 const deck=await call('dinder.deck',{timeZone:'America/New_York'});
 expect(deck.items.length).toBeGreaterThan(0);expect(deck.preferences).toMatchObject({startTime:'17:30',revision:0,mode:'virtual'});
 expect(await rows('dinderPreferences').countDocuments({_id:'a'})).toBe(0);
 const result=await call('dinder.swipe',{mealId:'1',liked:false,desiredAt:deck.plan.desiredAt,preferencesRevision:0,timeZone:'America/New_York'});
 expect(result.preferences.revision).toBe(1);expect((await rows('dinderPreferences').findOne({_id:'a'}))?.startTime).toBe('17:30');
 await expect(call('dinder.preferences_update',{startTime:'17:30',timeZone:'America/New_York',mode:'in_person'})).rejects.toThrow();
});
it('undoes the last unmatched swipe and restores its recipe without changing any chat',async()=>{
 await swipe('a','1',true);const deck=await call('dinder.deck'),{preferences}=await call('dinder.preferences');
 const result=await call('dinder.back',{mealId:'1',desiredAt:deck.plan.desiredAt,preferencesRevision:preferences.revision});expect(result.meal.id).toBe('1');
 expect(await rows('dinderLikes').countDocuments({userId:'a'})).toBe(0);expect((await call('dinder.deck')).items[0].id).toBe('1');
 const matched=await match();await expect(call('dinder.back',{mealId:'1',desiredAt:deck.plan.desiredAt,preferencesRevision:preferences.revision})).rejects.toMatchObject({code:'already_matched'});
 expect((await call('dinder.get',{matchId:matched.id})).status).toBe('matched');
});
it('puts matched recipes in the calendar and creates next week only after both votes',async()=>{
 const matched=await match();const calendar=await call('dinder.calendar',{from:'2035-06-01',to:'2035-06-30'});expect(calendar.items[0]).toMatchObject({matchId:matched.id,date:'2035-06-09',mealName:'Recipe 1'});
 const first=await call('dinder.again',{matchId:matched.id,revision:matched.revision,vote:true});expect(first.nextMatchId).toBeUndefined();
 const second=await call('dinder.again',{matchId:matched.id,revision:first.revision,vote:true},'b');expect(second.nextMatchId).toBeTruthy();
 const next=await call('dinder.get',{matchId:second.nextMatchId});expect(next.date).toBe('2035-06-16');
 expect((await call('dinder.calendar',{from:'2035-06-01',to:'2035-06-30'})).items).toHaveLength(2);
 expect(await rows('connections').countDocuments()).toBe(0);
});
