import {useEffect,useRef,useState} from 'react';
import type {LogEntry,LogPage} from '../shared/log';
import type {LogSearchResult} from '../shared/logSearch';
import type {LogSequence} from '../shared/navigation';
import {operation,ApiError} from './api';
import {cacheLogEntry,cachedLogEntry,preloadLogPhotos} from './logEntryCache';
import {readLogSequence} from './logSequence';
import {useRecordRefresh} from './useRecordRefresh';

/** Adjacent records stay in the originating ordered list; direct opens use chronology. */
export function useLogNeighbors({entryId,userId,visible,context}:{entryId:string;userId:string;visible:boolean;context?:LogSequence}){
 const [neighbors,setNeighbors]=useState<{previous:LogEntry|null;next:LogEntry|null}>({previous:null,next:null}),[pending,setPending]=useState(false);
 const sequence=useRef<LogSequence|undefined>(readLogSequence(context)),generation=useRef(0),controller=useRef<AbortController|null>(null),[refresh,setRefresh]=useState(0);
 const list=Boolean(context);
 useRecordRefresh(['log','people'],()=>{if(visible)setRefresh(value=>value+1);});
 useEffect(()=>{
  const ticket=++generation.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;
  // A revisited preserved panel receives the latest sequence from navigation state.
  sequence.current=readLogSequence(context);
  if(!visible){setPending(false);return;}
  const initial=sequence.current,index=initial?.ids.indexOf(entryId)??-1;
  setNeighbors(initial&&index>=0?{previous:cachedLogEntry(userId,initial.ids[index-1]||''),next:cachedLogEntry(userId,initial.ids[index+1]||'')}:{previous:null,next:null});
  setPending(true);
  const remember=(entry:LogEntry)=>{cacheLogEntry(userId,entry);preloadLogPhotos(entry);};
  const run=async()=>{
   if(!context){const result=await operation<{previous:LogEntry|null;next:LogEntry|null}>('log.neighbors',{entryId},{signal:abort.signal});if(ticket!==generation.current)return;for(const entry of [result.previous,result.next])if(entry)remember(entry);setNeighbors(result);return;}
   if(!initial||index<0)return;
   let current={...initial,ids:[...initial.ids]};const unavailable=new Set<string>(),cursors=new Set<string>();
   if(current.query?.calendarDay&&current.nextCursor===undefined){const page=await operation<LogPage>('log.list',{...current.query,limit:30},{signal:abort.signal});if(ticket!==generation.current)return;current={...current,ids:[...new Set([...page.items.map(item=>item.id),...current.ids])],nextCursor:page.nextCursor};for(const item of page.items)cacheLogEntry(userId,item,{persist:false});}
   const resolve=async(direction:-1|1)=>{
    let position=current.ids.indexOf(entryId)+direction;
    while(!abort.signal.aborted){
     if(position<0)return null;
     if(position>=current.ids.length){
      if(direction<0||(!current.query&&!current.search)||!current.nextCursor||cursors.has(current.nextCursor))return null;
      cursors.add(current.nextCursor);
      const before=current.nextCursor,page=current.search?await operation<LogSearchResult>('log.search',{...current.search,cursor:before,limit:20},{signal:abort.signal}):await operation<LogPage>('log.list',{...current.query,before,limit:30},{signal:abort.signal});
      if(ticket!==generation.current)return null;
      current={...current,ids:[...new Set([...current.ids,...page.items.map(entry=>'entryId' in entry?entry.entryId:entry.id)])],nextCursor:page.nextCursor===before?null:page.nextCursor};
      if(!current.search)for(const entry of (page as LogPage).items)cacheLogEntry(userId,entry,{persist:false});
      if(position>=current.ids.length){if(!current.nextCursor)return null;continue;}
     }
     const id=current.ids[position];
     try{const entry=await operation<LogEntry>('log.get',{entryId:id},{signal:abort.signal});if(ticket!==generation.current)return null;remember(entry);return entry;}
     catch(error){if(error instanceof ApiError&&[403,404,410].includes(error.status)){unavailable.add(id);position+=direction;continue;}throw error;}
    }
    return null;
   };
   const results=await Promise.allSettled([resolve(-1),resolve(1)]);
   if(ticket!==generation.current)return;
   sequence.current={...current,ids:current.ids.filter(id=>!unavailable.has(id))};
   setNeighbors({previous:results[0].status==='fulfilled'?results[0].value:null,next:results[1].status==='fulfilled'?results[1].value:null});
  };
  void run().catch(()=>{if(ticket===generation.current)setNeighbors({previous:null,next:null});}).finally(()=>{if(ticket===generation.current)setPending(false);});
  return()=>{generation.current++;abort.abort();};
 },[entryId,userId,visible,context,refresh]);
 return {neighbors,list,pending,sequence:()=>sequence.current};
}
