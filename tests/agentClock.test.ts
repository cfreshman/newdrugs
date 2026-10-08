import {it,expect} from 'vitest';
import {agentClock,agentClockText} from '../server/agentClock';
it('uses the person’s local date across the UTC midnight boundary',()=>{
 const now=Date.parse('2026-10-08T03:46:00Z');expect(agentClock('America/New_York',now)).toMatchObject({currentTimeUtc:'2026-10-08T03:46:00.000Z',localDate:'2026-10-07',localTime:'23:46:00',utcOffset:'-04:00',todayStartUtc:'2026-10-07T04:00:00Z',todayEndUtc:'2026-10-08T04:00:00Z'});
 expect(agentClockText('America/New_York',now)).toContain('UTC timestamps are storage values');
});
it('computes calendar day bounds through DST and handles an invalid timezone explicitly',()=>{
 const clock=agentClock('America/New_York',Date.parse('2026-11-01T15:00:00Z'));expect(Date.parse(clock.todayEndUtc)-Date.parse(clock.todayStartUtc)).toBe(25*3600000);
 expect(agentClock('invalid-zone',Date.parse('2026-10-08T03:46:00Z'))).toMatchObject({timeZone:'UTC',localDate:'2026-10-08'});
});
