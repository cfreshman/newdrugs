import {useEffect,useRef,useState} from 'react';
import {CircleNotch} from '@phosphor-icons/react';
import type {LogEntry,LogPage,LogList,LogCalendarTile} from '../shared/log';
import {operation,errorText} from './api';
import {logDateLabel} from './logDate';
import {logCover} from './logCalendarModel';
import {logImageUrl} from './logImageCache';
import {useRecordRefresh} from './useRecordRefresh';
import {NavLink} from './NavLink';
import {usePanelVisible} from './PanelReadiness';
export function LogCalendarDay({date,today,filters,previews,open,openPreview,children}:{date:string;today:string;filters:Partial<LogList>;previews:LogCalendarTile[];openPreview(entry:LogCalendarTile):void;open(entry:LogEntry):void;children:React.ReactNode}){
 const [page,setPage]=useState<LogPage>({items:[],nextCursor:null}),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const visible=usePanelVisible(),body=useRef<HTMLDivElement>(null);
 const request=useRef<AbortController|null>(null),query={...filters,calendarDay:date,includeAnniversaries:date>today};
 const load=async(append=false)=>{
  request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError('');
  try{const next=await operation<LogPage>('log.list',{...query,limit:30,...(append&&page.nextCursor?{before:page.nextCursor}:{})},{signal:controller.signal});if(controller.signal.aborted)return;setPage(prior=>({...next,items:append?[...prior.items,...next.items]:next.items}));setLoaded(true);}
  catch(error){if(!controller.signal.aborted)setError(errorText(error));}
  finally{if(!controller.signal.aborted)setBusy(false);}
 };
 useEffect(()=>{if(visible)void load();return()=>request.current?.abort();},[visible]);useRecordRefresh(['log'],()=>{if(visible)void load();});
 const items:(LogEntry|LogCalendarTile)[]=[...(loaded?page.items:previews)].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
 return <section className="log-day-picker" aria-label={`Entries for ${date}`}>
  <header className="log-day-heading" onClick={()=>body.current?.scrollTo?.({top:0,behavior:'smooth'})}><h2>{logDateLabel(date)}</h2></header>
  <div ref={body} className="log-day-choices">{children}
  {items.map(entry=>{const full='contributors' in entry,cover=full?logCover(entry):entry.cover;return <NavLink className="log-day-choice" key={entry.id} to={{view:'log',resourceId:entry.id}} navigate={()=>full?open(entry):openPreview(entry)}>
   {cover?<img src={logImageUrl(cover.url)} alt=""/>:<span className="log-choice-placeholder"/>}
   <span><span className="log-day-title">{entry.title||'(untitled)'}</span><small className="log-day-people" aria-hidden={!full||undefined}>{full?entry.contributors.map(person=>person.handle||person.name).join(', '):null}</small></span>
  </NavLink>;})}
  {busy&&!items.length&&<CircleNotch className="spin" size={18} aria-label="Loading entries"/>}
  {error&&<p className="error">{error}</p>}
  {page.nextCursor&&<button className="more-messages" disabled={busy} onClick={()=>void load(true)}>More entries</button>}
  </div>
 </section>;
}
