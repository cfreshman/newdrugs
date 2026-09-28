import {it,expect} from 'vitest';
import {retainCalendarWeeks,LOG_RETAINED_WEEKS,LOG_RETAINED_THUMBNAILS} from '../src/logCalendarRetention';
it('retains ordinary back-and-forth history, then evicts least recently viewed weeks at the bound',()=>{
 let cache=new Map<string,number>();
 for(let week=0;week<LOG_RETAINED_WEEKS;week++)cache=retainCalendarWeeks(cache,[String(week)],()=>1);
 expect(cache.has('0')).toBe(true);
 cache=retainCalendarWeeks(cache,['0'],()=>1);
 cache=retainCalendarWeeks(cache,[String(LOG_RETAINED_WEEKS)],()=>1);
 expect(cache.size).toBe(LOG_RETAINED_WEEKS);expect(cache.has('0')).toBe(true);expect(cache.has('1')).toBe(false);
});
it('bounds retained photos separately and never evicts the active viewport',()=>{
 let cache=new Map<string,number>();
 for(let week=0;week<100;week++)cache=retainCalendarWeeks(cache,[String(week)],()=>20);
 expect([...cache.values()].reduce((a,b)=>a+b,0)).toBeLessThanOrEqual(LOG_RETAINED_THUMBNAILS);expect(cache.has('99')).toBe(true);expect(cache.has('0')).toBe(false);
 const visible=Array.from({length:30},(_,i)=>String(i));cache=retainCalendarWeeks(cache,visible,()=>20);
 expect([...cache.keys()].sort()).toEqual(visible.sort());
});
