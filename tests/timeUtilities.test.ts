import {expect,it} from 'vitest';
import {resolveTime,convertTime,overlapTimes} from '../server/timeUtilities';
import {timeResolveInput,timeConvertInput,timeOverlapInput,timeResolveOutput,timeConvertOutput,timeOverlapOutput} from '../shared/utilitySchemas';
const resolve=(input:unknown)=>timeResolveOutput.parse(resolveTime(timeResolveInput.parse(input),Date.parse('2026-09-26T02:00:00Z')));
it('uses the reference local date for relative days and named weekdays',()=>{
 const tomorrow=resolve({date:'tomorrow',time:'17:00',timeZone:'America/New_York'});expect(tomorrow.instant).toBe('2026-09-26T21:00:00Z');expect(tomorrow.local.weekday).toBe('Saturday');
 expect(resolve({date:'2026-09-28',time:'09:00',timeZone:'UTC',nextWeekday:'Monday'}).local.date).toBe('2026-10-05');
 expect(resolve({date:'2026-09-28',time:'09:00',timeZone:'UTC',nextWeekday:'Monday',includeToday:true}).local.date).toBe('2026-09-28');
});
it('rejects missing and repeated wall times unless disambiguation is explicit',()=>{
 const spring={date:'2026-03-08',time:'02:30',timeZone:'America/New_York'};expect(()=>resolve(spring)).toThrow('clock change');expect(resolve({...spring,disambiguation:'later'})).toMatchObject({instant:'2026-03-08T07:30:00Z',adjusted:true,local:{time:'03:30:00'}});
 const fall={date:'2026-11-01',time:'01:30',timeZone:'America/New_York'};expect(()=>resolve(fall)).toThrow('clock change');expect(resolve({...fall,disambiguation:'earlier'}).instant).toBe('2026-11-01T05:30:00Z');expect(resolve({...fall,disambiguation:'later'}).instant).toBe('2026-11-01T06:30:00Z');
});
it('converts exact instants and elapsed minutes across DST and fractional offsets',()=>{
 const value=timeConvertOutput.parse(convertTime(timeConvertInput.parse({at:'2026-03-08T06:30:00Z',addMinutes:60,timeZones:['America/New_York','Asia/Kathmandu']})));
 expect(value.instant).toBe('2026-03-08T07:30:00Z');expect(value.local[0].time).toBe('03:30:00');expect(value.local[1].offset).toBe('+05:45');expect(()=>resolve({time:'09:00',timeZone:'not/a-zone'})).toThrow('IANA');
});
it('merges each person’s windows and intersects actual instants in different timezones',()=>{
 const value=timeOverlapOutput.parse(overlapTimes(timeOverlapInput.parse({participants:[
  {label:'Alice',timeZone:'America/New_York',windows:[{start:'2026-09-26T10:00',end:'2026-09-26T12:00'},{start:'2026-09-26T11:00',end:'2026-09-26T13:00'}]},
  {label:'Bob',timeZone:'Europe/London',windows:[{start:'2026-09-26T15:00',end:'2026-09-26T16:00'}]},
 ]})));
 expect(value.items).toHaveLength(1);expect(value.items[0]).toMatchObject({start:'2026-09-26T14:00:00Z',end:'2026-09-26T15:00:00Z',minutes:60});expect(value.items[0].local[0].start.time).toBe('10:00:00');expect(value.nextOffset).toBeNull();
});
it('validates ranges and paginates disjoint overlap without pretending to read calendars',()=>{
 const windows=[{start:'2026-09-26T10:00Z',end:'2026-09-26T11:00Z'},{start:'2026-09-27T10:00Z',end:'2026-09-27T11:00Z'}];
 const data=timeOverlapInput.parse({participants:[{label:'a',timeZone:'UTC',windows},{label:'b',timeZone:'UTC',windows}],limit:1});expect(overlapTimes(data).nextOffset).toBe(1);expect(overlapTimes({...data,offset:1}).items[0].start).toBe('2026-09-27T10:00:00Z');expect(overlapTimes({...data,minimumMinutes:61}).total).toBe(0);
 expect(()=>overlapTimes({...data,participants:data.participants.map(person=>({...person,windows:[{start:'2026-09-26T12:00',end:'2026-09-26T11:00'}]}))})).toThrow('end after');
});
