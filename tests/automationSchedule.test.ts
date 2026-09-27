import { it, expect } from 'vitest';
import { nextAutomationTime } from '../server/automationSchedule';
import { sleepDeadline, sleepSchema } from '../server/sleep';
it('uses local calendar time across daylight saving transitions and avoids the repeated hour', () => {
  const schedule={kind:'weekly' as const,timeZone:'America/New_York',hour:7,minute:0,weekdays:[0,1,2,3,4,5,6]};
  expect(new Date(nextAutomationTime(schedule,Date.parse('2026-03-07T13:00:00Z'))!).toISOString()).toBe('2026-03-08T11:00:00.000Z');
  const repeated={...schedule,hour:1,minute:30};
  expect(new Date(nextAutomationTime(repeated,Date.parse('2026-11-01T05:30:00Z'),'2026-11-01')!).toISOString()).toBe('2026-11-02T06:30:00.000Z');
  expect(new Date(nextAutomationTime({...schedule,hour:2,minute:30},Date.parse('2026-03-08T05:00:00Z'))!).toISOString()).toBe('2026-03-09T06:30:00.000Z');
});
it('bounds sleeps and requires exactly one time representation',()=>{
  expect(sleepDeadline(sleepSchema.parse({seconds:60,reason:'Wait for a reply'}),100000)).toBe(160000);
  expect(()=>sleepSchema.parse({until:'2026-09-25T12:00:00Z',seconds:60,reason:'wait'})).toThrow();
  expect(()=>sleepDeadline({until:'2000-01-01T00:00:00Z',reason:'wait'})).toThrow();
});

it('handles non-hour DST transitions, skipped civil days and the second repeated wall time',()=>{
 const schedule={kind:'weekly' as const,timeZone:'Australia/Lord_Howe',hour:2,minute:15,weekdays:[0,1,2,3,4,5,6]};
 const next=nextAutomationTime(schedule,Date.parse('2026-10-03T13:00:00Z'))!;
 expect(new Date(next).toISOString()).toBe('2026-10-04T15:15:00.000Z');
 expect(new Date(nextAutomationTime({...schedule,timeZone:'America/New_York',hour:1,minute:30},Date.parse('2026-11-01T05:31:00Z'))!).toISOString()).toBe('2026-11-01T06:30:00.000Z');
 expect(new Date(nextAutomationTime({...schedule,timeZone:'Pacific/Apia',hour:7,minute:0},Date.parse('2011-12-29T18:00:00Z'))!).toISOString()).toBe('2011-12-30T17:00:00.000Z');
});
