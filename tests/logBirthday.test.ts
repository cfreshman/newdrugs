import {it,expect} from 'vitest';
import {birthdaySchema,birthdayOn} from '../shared/logBirthday';
it('stores only a valid month/day and handles leap-day reminders without inventing a birth year',()=>{expect(birthdaySchema.parse({month:2,day:29})).toEqual({month:2,day:29});expect(birthdaySchema.safeParse({month:2,day:30}).success).toBe(false);expect(birthdaySchema.safeParse({month:4,day:31}).success).toBe(false);expect(birthdaySchema.safeParse({month:2,day:29,year:2000}).success).toBe(false);expect(birthdayOn({month:2,day:29},'2027-02-28')).toBe(true);expect(birthdayOn({month:2,day:29},'2028-02-29')).toBe(true);});

it('accepts an optional owner-only year and validates the actual birthday',async()=>{
 const {ownBirthdaySchema}=await import('../shared/logBirthday');expect(ownBirthdaySchema.parse({month:2,day:29,year:2000})).toEqual({month:2,day:29,year:2000});expect(ownBirthdaySchema.safeParse({month:2,day:29,year:2001}).success).toBe(false);expect(ownBirthdaySchema.safeParse({month:1,day:1,year:9999}).success).toBe(false);expect(ownBirthdaySchema.parse({month:2,day:29,year:null}).year).toBeNull();
});
it('matches Logcal whole-age and quarter-year markers, including leap days and short months',async()=>{
 const {logLifeQuarter}=await import('../shared/logBirthday'),{Temporal}=await import('@js-temporal/polyfill'),week=(value:string)=>Temporal.PlainDate.from(value);
 expect(logLifeQuarter({month:9,day:27,year:1996},week('2026-09-27'))).toEqual({label:'30',years:30,months:0});expect(logLifeQuarter({month:9,day:27,year:1996},week('2026-12-27'))).toEqual({label:'1/4',years:30,months:3});expect(logLifeQuarter({month:9,day:27,year:1996},week('2027-03-21'))?.label).toBe('1/2');expect(logLifeQuarter({month:9,day:27,year:1996},week('2027-06-27'))?.label).toBe('3/4');
 expect(logLifeQuarter({month:2,day:29,year:2000},week('2027-02-28'))?.label).toBe('27');expect(logLifeQuarter({month:5,day:31,year:2000},week('2026-11-29'))?.label).toBe('1/2');expect(logLifeQuarter({month:9,day:27},week('2026-09-27'))).toBeNull();expect(logLifeQuarter({month:9,day:27,year:1996},week('1996-09-15'))).toBeNull();
});
