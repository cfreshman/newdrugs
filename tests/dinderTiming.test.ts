import {expect,it} from 'vitest';
import {compatibleDinnerPlans,dateInZone,dinnerPlan,dinnerSchedule,nextDinnerPlan} from '../shared/dinder';
import {parseMealDB} from '../server/dinderCatalog';
import {operations} from '../shared/catalog';
import {parseDestination,destinationPath} from '../shared/navigation';
import {modeForDestination} from '../shared/experience';

const ny={startTime:'19:00',timeZone:'America/New_York'};
it('closes today exactly three hours before the preferred time and rolls new swipes to tomorrow',()=>{
 const before=Date.parse('2026-10-09T19:59:59.999Z'),cutoff=before+1;
 expect(nextDinnerPlan('me',ny,before)).toMatchObject({date:'2026-10-09',desiredAt:'2026-10-09T23:00:00.000Z',cutoffAt:'2026-10-09T20:00:00.000Z'});
 expect(nextDinnerPlan('me',ny,cutoff).date).toBe('2026-10-10');
});
it('includes a one-hour difference, chooses the midpoint, and uses the earlier person’s deadline',()=>{
 const a=dinnerPlan('a',ny,'2026-10-09'),b=dinnerPlan('b',{...ny,startTime:'20:00'},'2026-10-09');
 expect(compatibleDinnerPlans(a,b,Date.parse('2026-10-09T19:59:59.999Z'))).toBe(true);
 expect(dinnerSchedule(a,b)).toEqual({startAt:'2026-10-09T23:30:00.000Z',deadlineAt:'2026-10-09T20:00:00.000Z'});
 expect(compatibleDinnerPlans(a,b,Date.parse('2026-10-09T20:00:00Z'))).toBe(false);
 expect(compatibleDinnerPlans(a,dinnerPlan('b',{...ny,startTime:'20:01'},'2026-10-09'),Date.parse('2026-10-09T18:00:00Z'))).toBe(false);
});
it('compares real instants across timezones and local calendar dates',()=>{
 const a=dinnerPlan('a',{startTime:'23:30',timeZone:'America/Los_Angeles'},'2026-10-09');
 const b=dinnerPlan('b',{startTime:'02:30',timeZone:'America/New_York'},'2026-10-10');
 expect(a.desiredAt).toBe(b.desiredAt);
 expect(compatibleDinnerPlans(a,b,Date.parse('2026-10-10T02:00:00Z'))).toBe(true);
});
it('uses calendar days across spring and fall DST while keeping the saved local dinner time',()=>{
 const spring1=dinnerPlan('a',ny,'2026-03-07'),spring2=dinnerPlan('a',ny,'2026-03-08');
 expect(Date.parse(spring2.desiredAt)-Date.parse(spring1.desiredAt)).toBe(23*3600000);
 const fall1=dinnerPlan('a',ny,'2026-10-31'),fall2=dinnerPlan('a',ny,'2026-11-01');
 expect(Date.parse(fall2.desiredAt)-Date.parse(fall1.desiredAt)).toBe(25*3600000);
 expect(dateInZone(ny.timeZone,Date.parse(fall2.desiredAt))).toBe('2026-11-01');
});
it('shifts nonexistent local times forward and uses the first occurrence of an ambiguous time',()=>{
 expect(dinnerPlan('a',{...ny,startTime:'02:30'},'2026-03-08').desiredAt).toBe('2026-03-08T07:30:00.000Z');
 expect(dinnerPlan('a',{...ny,startTime:'01:30'},'2026-11-01').desiredAt).toBe('2026-11-01T05:30:00.000Z');
});
it('handles a matching cutoff on the previous calendar day',()=>{
 expect(nextDinnerPlan('a',{...ny,startTime:'01:00'},Date.parse('2026-10-10T04:00:00Z')).date).toBe('2026-10-11');
});
it('gives both people at least three hours before their agreed midpoint',()=>{
 for(let minute=0;minute<=60;minute++){
  const a=dinnerPlan('a',ny,'2026-10-09'),b=dinnerPlan('b',{...ny,startTime:`${minute===60?'20':'19'}:${String(minute%60).padStart(2,'0')}`},'2026-10-09'),schedule=dinnerSchedule(a,b);
  expect(Date.parse(schedule.startAt)-Date.parse(schedule.deadlineAt)).toBeGreaterThanOrEqual(3*3600000);
  for(const plan of [a,b])expect(Math.abs(Date.parse(plan.desiredAt)-Date.parse(schedule.startAt))).toBeLessThanOrEqual(31*60000);
 }
});
it('uses real source ingredients and removes unsafe source URLs without inventing cooking durations',()=>{
 const recipe=parseMealDB({idMeal:'52772',strMeal:'Teriyaki Chicken',strCategory:'Chicken',strArea:'Japanese',strMealThumb:'https://www.themealdb.com/images/media/meals/wvpsxx1468256321.jpg',strSource:'javascript:alert(1)',strInstructions:'Cook chicken.',strIngredient1:' Chicken ',strMeasure1:' 1 lb ',strIngredient2:''});
 expect(recipe.ingredients).toEqual([{name:'Chicken',measure:'1 lb'}]);expect(recipe.sourceUrl).toBe('https://www.themealdb.com/meal/52772');expect(recipe).not.toHaveProperty('time');
});
it('exposes the same validated contract to the app and external agents, with Friends deep links',()=>{
 for(const operation of operations.filter(operation=>operation.name.startsWith('dinder.')))expect(operation.outputSchema).toBeTruthy();
 expect(operations.find(operation=>operation.name==='dinder.message_send')!.confirmationRequired).toBe(false);
 const destination={view:'dinder' as const,resourceId:'31ce42e7-24f7-4a7d-b6d5-10bb4b9bcc34'};
 expect(modeForDestination(destination)).toBe('friends');expect(parseDestination(destinationPath(destination),'https://druggie.org')).toEqual(destination);
 expect(parseDestination('/posts/dinder','https://druggie.org')).toEqual({view:'dinder',mode:'posts'});
});
it('opens the full meal chat through a shareable Dinder destination',()=>{
 const destination={view:'dinder' as const,resourceId:'31ce42e7-24f7-4a7d-b6d5-10bb4b9bcc34',dinderTab:'chat' as const};
 expect(destinationPath(destination)).toBe('/dinder/31ce42e7-24f7-4a7d-b6d5-10bb4b9bcc34?tab=chat');
 expect(parseDestination(destinationPath(destination),'https://druggie.org')).toEqual(destination);
 expect(parseDestination('/dinder/about?tab=chat','https://druggie.org')).toBeNull();
});
