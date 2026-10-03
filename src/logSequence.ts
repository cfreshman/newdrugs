import {z} from 'zod';
import {logListInput,type LogEntry,type LogCalendarTile} from '../shared/log';
import {logSearchInput,type LogSearchResult,type LogSearchInput} from '../shared/logSearch';
import type {Destination,LogSequence} from '../shared/navigation';
import {useExperience} from './ExperienceContext';
import {primeLogEntry} from './logEntryCache';
const sequenceSchema=z.object({key:z.string().min(1).max(100),ids:z.array(z.string().min(1).max(150)),query:z.object(logListInput).omit({before:true,limit:true}).partial().optional(),search:z.object(logSearchInput).omit({cursor:true,limit:true}).optional(),filters:z.object({scope:z.enum(['all','private','shared']),query:z.string().max(300).optional(),personId:z.string().max(100).optional()}).optional(),nextCursor:z.string().max(1500).nullable().optional()});
export function readLogSequence(value:unknown):LogSequence|undefined{const parsed=sequenceSchema.safeParse(value);return parsed.success?{...parsed.data,ids:[...new Set(parsed.data.ids)]}:undefined;}
export function useOpenLogList(navigate:(destination:Destination)=>void){
 const experience=useExperience();
 return (entry:LogEntry|LogCalendarTile,entries:(LogEntry|LogCalendarTile)[],query?:LogSequence['query'],nextCursor?:string|null)=>{
  const index=entries.findIndex(item=>item.id===entry.id);for(const item of entries.slice(Math.max(0,index-1),index+2))if("contributors" in item)primeLogEntry(item);
  navigate({view:'log',resourceId:entry.id,...(experience?{mode:experience.mode}:{}),logSequence:{key:crypto.randomUUID(),ids:[...new Set(entries.map(item=>item.id))],...(query?{query,...(nextCursor!==undefined?{nextCursor}:{})}:{})}});
 };
}
export function useOpenLogSearch(navigate:(destination:Destination)=>void){
 const experience=useExperience();
 return (entry:LogSearchResult['items'][number],entries:LogSearchResult['items'],search:Omit<LogSearchInput,'cursor'|'limit'>,nextCursor:string|null)=>{
  navigate({view:'log',resourceId:entry.entryId,...(experience?{mode:experience.mode}:{}),logSequence:{key:crypto.randomUUID(),ids:entries.map(item=>item.entryId),search,nextCursor}});
 };
}
