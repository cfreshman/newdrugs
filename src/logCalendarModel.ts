import {Temporal} from '@js-temporal/polyfill';
export const LOG_WEEK_BATCH=52;
export function logWeekStart(date:Temporal.PlainDate){return date.subtract({days:date.dayOfWeek%7});}
/** Adjacent, nonoverlapping chunks. The initial chunk also checks the upcoming week. */
export function logCalendarRange(anchor:Temporal.PlainDate,loaded:number,count=LOG_WEEK_BATCH){
 return {from:anchor.subtract({weeks:loaded+count-1}).toString(),through:loaded?anchor.subtract({weeks:loaded-1}).subtract({days:1}).toString():anchor.add({days:13}).toString()};
}
export function logCalendarWeeks(anchor:Temporal.PlainDate,count:number){return Array.from({length:count},(_,index)=>anchor.subtract({weeks:index}));}
export function logCover(entry:import('../shared/log').LogEntry|import('../shared/log').LogCalendarTile){if(!('contributors' in entry))return entry.cover||undefined;if(entry.cover!==undefined)return entry.cover||undefined;const photos=entry.contributors.flatMap(person=>person.files).filter(file=>file.mime.startsWith('image/'));return photos.find(file=>file.id===entry.coverFileId)||photos[0];}

/** Label a month exactly once, on the week containing its first day. */
export function logWeekMonth(start:Temporal.PlainDate){
 const end=start.add({days:6});if(start.day===1)return start;if(start.month!==end.month)return end.with({day:1});return null;
}
