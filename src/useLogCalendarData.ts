import {useEffect,useMemo,useRef,useState} from 'react';
import {Temporal} from '@js-temporal/polyfill';
import type {LogCalendarPage} from '../shared/log';
import {operation,errorText} from './api';
import {logCalendarRange} from './logCalendarModel';
import {useRecordRefreshDetails} from './useRecordRefresh';
export const CALENDAR_CHUNK_WEEKS=5,CALENDAR_CACHE_CHUNKS=104;
/** Keep roughly ten years of fetched summaries; only the current viewport drives requests. */
export function useLogCalendarData(anchor:Temporal.PlainDate,today:string,filters:{scope:'all'|'private'|'shared';query?:string;personId?:string},wanted:number[],visible:boolean){
 const cache=useRef(new Map<number,LogCalendarPage>()),dirty=useRef(new Set<number>()),requests=useRef(new Map<number,AbortController>()),targets=useRef<number[]>([]),alive=useRef(true);
 const [revision,changed]=useState(0),[error,setError]=useState('');
 const range=(index:number)=>logCalendarRange(anchor,index*CALENDAR_CHUNK_WEEKS,CALENDAR_CHUNK_WEEKS);
 const pump=useRef<()=>void>(()=>{});
 pump.current=()=>{
  if(!alive.current)return;
  let started=false;
  for(const index of targets.current){
   if(requests.current.size>=2)break;
   if(requests.current.has(index)||cache.current.has(index)&&!dirty.current.has(index))continue;
   const controller=new AbortController();requests.current.set(index,controller);started=true;dirty.current.delete(index);
   void operation<LogCalendarPage>('log.calendar',{...filters,...range(index),today},{signal:controller.signal,dedupe:true}).then(page=>{
    if(controller.signal.aborted||!alive.current)return;
    cache.current.delete(index);cache.current.set(index,page);
    while(cache.current.size>CALENDAR_CACHE_CHUNKS){const old=[...cache.current.keys()].find(key=>!targets.current.includes(key));if(old===undefined)break;cache.current.delete(old);dirty.current.delete(old);}
    setError('');
   }).catch(reason=>{if(!controller.signal.aborted&&alive.current){if(cache.current.has(index))dirty.current.add(index);setError(errorText(reason));targets.current=targets.current.filter(key=>key!==index);}}).finally(()=>{
    if(requests.current.get(index)===controller)requests.current.delete(index);
    if(alive.current){changed(value=>value+1);pump.current();}
   });
  }
  if(started)changed(value=>value+1);
 };
 const wantedKey=wanted.join(',');
 const filterKey=JSON.stringify([filters.scope,filters.query||'',filters.personId||'']);
 const activeFilter=useRef(filterKey);
 useEffect(()=>{if(activeFilter.current===filterKey)return;activeFilter.current=filterKey;for(const request of requests.current.values())request.abort();requests.current.clear();cache.current.clear();dirty.current.clear();setError('');changed(value=>value+1);pump.current();},[filterKey]);
 useEffect(()=>{
  targets.current=visible?wanted.slice(0,CALENDAR_CACHE_CHUNKS):[];
  for(const [index,request] of requests.current)if(!targets.current.includes(index)){request.abort();requests.current.delete(index);if(cache.current.has(index))dirty.current.add(index);else dirty.current.delete(index);}
  for(const index of targets.current){const page=cache.current.get(index);if(page){cache.current.delete(index);cache.current.set(index,page);}}
  pump.current();
 },[wantedKey,visible]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;for(const request of requests.current.values())request.abort();};},[]);
 useRecordRefreshDetails(['log'],change=>{
  for(const index of new Set([...cache.current.keys(),...requests.current.keys()])){
   const dates=change?.log?.flatMap(item=>[item.date,item.previousDate].filter((date):date is string=>Boolean(date))),window=range(index);
   // Upcoming reminders may change even when their original date is years earlier.
   if(index===0||!dates?.length||dates.some(date=>date>=window.from&&date<=window.through)){
    dirty.current.add(index);requests.current.get(index)?.abort();requests.current.delete(index);
    // Keep the current calendar painted while an ordinary or generic refresh
    // replaces it. Only an explicit deletion disappears immediately.
    const page=cache.current.get(index),deletedIds=new Set(change?.log?.filter(item=>item.deleted).map(item=>item.id));
    if(page&&deletedIds.size)cache.current.set(index,{...page,days:page.days.map(day=>({...day,items:day.items.filter(item=>!deletedIds.has(item.id))}))});
   }
  }
  changed(value=>value+1);pump.current();
 });
 // A backfill can finish without changing an entry. Poll only visible incomplete windows.
 useEffect(()=>{if(!visible||!targets.current.some(index=>cache.current.get(index)?.indexing))return;const timer=setTimeout(()=>{for(const index of targets.current)if(cache.current.get(index)?.indexing)dirty.current.add(index);pump.current();},3000);return()=>clearTimeout(timer);},[revision,visible]);
 const days=useMemo(()=>new Map([...cache.current.values()].flatMap(page=>(page.days||[]).map(day=>[day.date,day] as const))),[revision]);
 return {days,busy:requests.current.size>0,error,retry:()=>{setError('');targets.current=wanted.slice(0,CALENDAR_CACHE_CHUNKS);pump.current();changed(value=>value+1);},cachedChunks:cache.current.size};
}
