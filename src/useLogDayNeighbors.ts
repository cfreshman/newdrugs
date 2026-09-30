import {useEffect,useRef,useState} from 'react';
import {Temporal} from '@js-temporal/polyfill';
import type {LogList,LogPage} from '../shared/log';
import {operation} from './api';
import {useRecordRefresh} from './useRecordRefresh';

/** Two bounded, indexed reads jump directly over empty calendar history. */
export function useLogDayNeighbors(date:string|null,filters:Partial<LogList>,active:boolean){
 const [days,setDays]=useState<{date:string|null;previous:string|null;next:string|null}>({date:null,previous:null,next:null}),[revision,setRevision]=useState(0);
 const current=useRef(0),signature=JSON.stringify(filters);
 useRecordRefresh(['log','people'],()=>{if(active)setRevision(value=>value+1);});
 useEffect(()=>{
  const ticket=++current.current,controller=new AbortController();if(!active||!date)return;
  const adjacent=(direction:number)=>{try{const value=Temporal.PlainDate.from(date).add({days:direction}).toString();return /^\d{4}-/.test(value)?value:null;}catch{return null;}};
  const from=adjacent(1),through=adjacent(-1),query=JSON.parse(signature) as Partial<LogList>;
  const read=(input:Partial<LogList>)=>operation<LogPage>('log.list',{...query,...input,limit:1},{signal:controller.signal}).then(page=>page.items[0]?.date||null);
  void Promise.all([through?read({through,order:'newest'}):Promise.resolve(null),from?read({from,order:'oldest'}):Promise.resolve(null)]).then(([previous,next])=>{if(ticket===current.current)setDays({date,previous:previous&&previous<date?previous:null,next:next&&next>date?next:null});}).catch(error=>{if(!controller.signal.aborted){console.error('Log day navigation:',error instanceof Error?error.message:'Unavailable');if(ticket===current.current)setDays({date,previous:null,next:null});}});
  return()=>{current.current++;controller.abort();};
 },[date,signature,active,revision]);
 return days.date===date?days:{date,previous:null,next:null};
}
