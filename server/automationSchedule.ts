import {Temporal} from '@js-temporal/polyfill';
import { AppError } from './errors';
import type { AutomationConfig } from '../shared/automations';
export function scheduleParts(time: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(time));
  const value = (key: string) => parts.find(part => part.type === key)!.value;
  return { date: `${value('year')}-${value('month')}-${value('day')}`, hour: Number(value('hour')), minute: Number(value('minute')), weekday: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(value('weekday')) };
}
/** Wall-clock recurrence: skip nonexistent local times and never repeat a fall-back date. */
export function nextAutomationTime(schedule: AutomationConfig['schedule'], after = Date.now(), skipDate?: string): number | null {
  if (schedule.kind === 'once') return Date.parse(schedule.at) > after ? Date.parse(schedule.at) : null;
  let day:Temporal.PlainDate;
  try { day=Temporal.Instant.fromEpochMilliseconds(after).toZonedDateTimeISO(schedule.timeZone).toPlainDate(); }
  catch { throw new AppError(422,'timezone','Choose a valid IANA timezone.'); }
  for(let offset=0;offset<10;offset++){
    const date=day.add({days:offset});
    if(date.toString()===skipDate||!schedule.weekdays.includes(date.dayOfWeek%7))continue;
    const fields={timeZone:schedule.timeZone,year:date.year,month:date.month,day:date.day,hour:schedule.hour,minute:schedule.minute};
    const candidates=['earlier','later'].map(disambiguation=>Temporal.ZonedDateTime.from(fields,{disambiguation:disambiguation as 'earlier'|'later'}))
      .filter(value=>value.toPlainDate().equals(date)&&value.hour===schedule.hour&&value.minute===schedule.minute&&value.epochMilliseconds>after)
      .map(value=>value.epochMilliseconds);
    if(candidates.length)return Math.min(...candidates);
  }
  throw Error('No valid next occurrence.');
}
