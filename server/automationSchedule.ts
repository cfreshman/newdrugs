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
  try { new Intl.DateTimeFormat('en-US', { timeZone: schedule.timeZone }); } catch { throw new AppError(422, 'timezone', 'Choose a valid IANA timezone.'); }
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: schedule.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let time = Math.floor(after / 60000) * 60000 + 60000, end = after + 9 * 86400000; time <= end; time += 60000) {
    const parts = Object.fromEntries(formatter.formatToParts(time).map(part => [part.type, part.value]));
    if (Number(parts.hour) === schedule.hour && Number(parts.minute) === schedule.minute && schedule.weekdays.includes(['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday)) && `${parts.year}-${parts.month}-${parts.day}` !== skipDate) return time;
  }
  throw Error('No valid next occurrence.');
}
