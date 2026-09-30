import {useEffect,useRef,useState} from 'react';
import {CircleNotch,X} from '@phosphor-icons/react';
import type {LogEntry,LogPage,LogList,LogCalendarTile} from '../shared/log';
import {operation,errorText} from './api';
import {logDateLabel} from './logDate';
import {logCover} from './logCalendarModel';
import {logImageUrl} from './logImageCache';
import {useRecordRefresh} from './useRecordRefresh';
import {NavLink} from './NavLink';
export function LogCalendarDay({date,today,filters,previews,close,open,openPreview,create,children}:{date:string;today:string;filters:Partial<LogList>;previews:LogCalendarTile[];openPreview(entry:LogCalendarTile):void;close():void;open(entry:LogEntry):void;create():void;children:React.ReactNode}){
 const [page,setPage]=useState<LogPage>({items:[],nextCursor:null}),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const request=useRef<AbortController|null>(null),query={...filters,calendarDay:date,includeAnniversaries:date>today};
 const load=async(append=false)=>{
  request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError('');
  try{const next=await operation<LogPage>('log.list',{...query,limit:30,...(append&&page.nextCursor?{before:page.nextCursor}:{})},{signal:controller.signal});if(controller.signal.aborted)return;setPage(prior=>({...next,items:append?[...prior.items,...next.items]:next.items}));setLoaded(true);}
  catch(error){if(!controller.signal.aborted)setError(errorText(error));}
  finally{if(!controller.signal.aborted)setBusy(false);}
 };
 useEffect(()=>{void load();return()=>request.current?.abort();},[]);useRecordRefresh(['log'],()=>load());
 const items:(LogEntry|LogCalendarTile)[]=[...(loaded?page.items:previews)].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
 return <section className="log-day-picker" aria-label={`Entries for ${date}`}>
  <div><strong>{logDateLabel(date)}</strong><button aria-label="Close day" onClick={close}><X size={18}/></button></div>
  {children}
  {items.map(entry=>{const full='contributors' in entry,cover=full?logCover(entry):entry.cover;return <NavLink className="log-day-choice" key={entry.id} to={{view:'log',resourceId:entry.id}} navigate={()=>full?open(entry):openPreview(entry)}>
   {cover?<img src={logImageUrl(cover.url)} alt=""/>:<span className="log-choice-placeholder"/>}
   <span>{entry.title||'(untitled)'}<small className="log-day-people">{full?entry.contributors.map(person=>person.handle||person.name).join(', '):<span className="log-people-placeholder" aria-hidden="true"><span/></span>}</small></span>
  </NavLink>;})}
  {busy&&!items.length&&<CircleNotch className="spin" size={18} aria-label="Loading entries"/>}
  {error&&<p className="error">{error}</p>}
  {page.nextCursor&&<button className="more-messages" disabled={busy} onClick={()=>void load(true)}>More entries</button>}
  <NavLink className="log-outline-button" to={{view:'log_compose',date}} navigate={create}>Log another event</NavLink>
 </section>;
}
