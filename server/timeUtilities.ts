import {Temporal} from '@js-temporal/polyfill';
import type {TimeResolveInput,TimeConvertInput,TimeOverlapInput} from '../shared/utilitySchemas';
import {AppError} from './errors';
const weekdays=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
function timeZone(zone:string){try{new Intl.DateTimeFormat('en-US',{timeZone:zone});return zone;}catch{throw new AppError(422,'timezone','Use a valid IANA timezone.');}}
function localView(value:Temporal.Instant,zone:string){const date=value.toZonedDateTimeISO(timeZone(zone));return {timeZone:zone,localDateTime:date.toString(),date:date.toPlainDate().toString(),time:date.toPlainTime().toString(),weekday:weekdays[date.dayOfWeek-1],offset:date.offset};}
function wallTime(value:string,zone:string,disambiguation:'reject'|'earlier'|'later'){
  try{return Temporal.PlainDateTime.from(value).toZonedDateTime(timeZone(zone),{disambiguation}).toInstant();}
  catch(error){if(error instanceof AppError)throw error;throw new AppError(422,'local_time','This local time is invalid, missing or repeated during a clock change. Use an explicit UTC offset or choose earlier/later disambiguation.');}
}
export function resolveTime(input:TimeResolveInput,now=Date.now()){
  const reference=input.reference?Temporal.Instant.from(input.reference):Temporal.Instant.fromEpochMilliseconds(now),zone=timeZone(input.timeZone);
  const relative={today:0,tomorrow:1,yesterday:-1} as Record<string,number>;
  let date=input.date in relative?reference.toZonedDateTimeISO(zone).toPlainDate().add({days:relative[input.date]}):Temporal.PlainDate.from(input.date);
  date=date.add({days:input.dayOffset});
  if(input.nextWeekday){let days=(weekdays.indexOf(input.nextWeekday)+1-date.dayOfWeek+7)%7;if(!days&&!input.includeToday)days=7;date=date.add({days});}
  const requested=date.toPlainDateTime(input.time),instant=wallTime(requested.toString(),zone,input.disambiguation),actual=instant.toZonedDateTimeISO(zone);
  return {instant:instant.toString(),reference:reference.toString(),requestedLocalDateTime:requested.toString(),adjusted:!actual.toPlainDateTime().equals(requested),local:localView(instant,zone)};
}
export function convertTime(input:TimeConvertInput,now=Date.now()){
  const reference=input.at?Temporal.Instant.from(input.at):Temporal.Instant.fromEpochMilliseconds(now),instant=reference.add({minutes:input.addMinutes});
  return {reference:reference.toString(),instant:instant.toString(),local:[...new Set(input.timeZones)].map(zone=>localView(instant,zone))};
}
type Interval={start:number;end:number};
function merge(windows:Interval[]){const result:Interval[]=[];for(const next of windows.sort((a,b)=>a.start-b.start)){const last=result.at(-1);if(last&&next.start<=last.end)last.end=Math.max(last.end,next.end);else result.push({...next});}return result;}
export function overlapTimes(input:TimeOverlapInput){
  const groups=input.participants.map(person=>{timeZone(person.timeZone);return merge(person.windows.map(window=>{
    const read=(value:string)=>/Z$|[+-]\d{2}:\d{2}$/.test(value)?Temporal.Instant.from(value):wallTime(value,person.timeZone,person.disambiguation);
    const start=read(window.start).epochMilliseconds,end=read(window.end).epochMilliseconds;if(end<=start)throw new AppError(422,'time_range','Each availability window must end after it starts.');return {start,end};
  }));});
  let overlap=groups[0];for(const next of groups.slice(1)){const result:Interval[]=[];let i=0,j=0;while(i<overlap.length&&j<next.length){const start=Math.max(overlap[i].start,next[j].start),end=Math.min(overlap[i].end,next[j].end);if(end>start)result.push({start,end});if(overlap[i].end<next[j].end)i++;else j++;}overlap=result;}
  overlap=overlap.filter(window=>window.end-window.start>=input.minimumMinutes*60000);
  const selected=overlap.slice(input.offset,input.offset+input.limit);
  return {items:selected.map(window=>{const start=Temporal.Instant.fromEpochMilliseconds(window.start),end=Temporal.Instant.fromEpochMilliseconds(window.end);return {start:start.toString(),end:end.toString(),minutes:(window.end-window.start)/60000,local:input.participants.map(person=>({label:person.label,start:localView(start,person.timeZone),end:localView(end,person.timeZone)}))};}),total:overlap.length,nextOffset:input.offset+selected.length<overlap.length?input.offset+selected.length:null};
}
