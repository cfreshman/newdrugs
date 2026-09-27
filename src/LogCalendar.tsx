import {useEffect,useLayoutEffect,useRef,useState,Fragment} from 'react';
import {Temporal} from '@js-temporal/polyfill';
import {CircleNotch,Star,X} from '@phosphor-icons/react';
import {recurrenceOn,type LogEntry,type LogPage} from '../shared/log';
import {operation,errorText} from './api';
import {usePanelVisible} from './PanelReadiness';
import {useRecordRefresh} from './useRecordRefresh';
import {LOG_WEEK_BATCH,logWeekStart,logCalendarRange,logCalendarWeeks,logCover} from './logCalendarModel';

type Scope='all'|'private'|'shared';
const dateLabel=(date:string)=>new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'});
export function LogCalendar({month,scope,query,personId,jump,create,open}:{month?:string;scope:Scope;query:string;personId?:string;jump(month?:string):void;create(date:string):void;open(entry:LogEntry):void}){
 const visible=usePanelVisible(),root=useRef<HTMLDivElement>(null),sentinel=useRef<HTMLDivElement>(null);
 const [today]=useState(()=>Temporal.Now.plainDateISO());
 const [anchor]=useState(()=>logWeekStart(month?Temporal.PlainDate.from(`${month}-01`).add({months:1}).subtract({days:1}):today));
 const [weeks,setWeeks]=useState(LOG_WEEK_BATCH),[items,setItems]=useState<LogEntry[]>([]),[recurring,setRecurring]=useState<LogEntry[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[selectedDay,setSelectedDay]=useState<string|null>(null);
 const loaded=useRef(0),sequence=useRef(0),pending=useRef(false);
 const filters={scope,...(query?{query}:{}),...(personId?{personId}:{})};
 const pageAll=async(input:Record<string,unknown>,ticket:number)=>{
  const result:LogEntry[]=[];let before:string|undefined;
  do{const page=await operation<LogPage>('log.list',{...filters,...input,limit:30,...(before?{before}:{})});if(ticket!==sequence.current)return null;result.push(...page.items);before=page.nextCursor||undefined;}while(before);
  return result;
 };
 const load=async(refresh=false)=>{
  if(pending.current&&!refresh)return;
  const ticket=++sequence.current,prior=refresh?0:loaded.current,count=refresh?loaded.current||LOG_WEEK_BATCH:LOG_WEEK_BATCH;
  pending.current=true;setBusy(true);setError('');
  try{
   const next=await pageAll(logCalendarRange(anchor,prior,count),ticket);if(!next)return;
   const repeats=prior===0?await pageAll({recurring:true},ticket):null;if(ticket!==sequence.current)return;
   setItems(previous=>prior?[...new Map([...previous,...next].map(entry=>[entry.id,entry])).values()]:next);
   if(repeats)setRecurring(repeats);
   loaded.current=prior+count;setWeeks(loaded.current);
  }catch(reason){if(ticket===sequence.current)setError(errorText(reason));}
  finally{if(ticket===sequence.current){pending.current=false;setBusy(false);}}
 };
 useEffect(()=>{void load(true);return()=>{sequence.current++;};},[]);
 useLayoutEffect(()=>{const scroller=root.current?.closest<HTMLElement>('.composer-view');if(scroller)scroller.scrollTop=0;},[]);
 useRecordRefresh(['log'],()=>load(true));
 useEffect(()=>{
  const target=sentinel.current,scroller=root.current?.closest<HTMLElement>('.composer-view');if(!visible||busy||error||!target||!scroller)return;
  if(typeof IntersectionObserver!=='undefined'){
   const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))void load();},{root:scroller,rootMargin:'0px 0px 180px 0px'});observer.observe(target);return()=>observer.disconnect();
  }
  const scroll=()=>{if(scroller.clientHeight>0&&scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<180)void load();};
  scroller.addEventListener('scroll',scroll,{passive:true});return()=>scroller.removeEventListener('scroll',scroll);
 },[visible,busy,error,weeks]);
 const byDay=new Map<string,LogEntry[]>();for(const entry of items)byDay.set(entry.date,[...byDay.get(entry.date)||[],entry]);
 const onDay=(date:string)=>{const actual=byDay.get(date)||[];return [...actual,...recurring.filter(entry=>date>today.toString()&&entry.date!==date&&recurrenceOn(entry,Number(date.slice(0,4)))===date&&!actual.some(item=>item.id===entry.id))].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));};
 const nextWeek=anchor.add({weeks:1}),upcoming=Array.from({length:7},(_,index)=>nextWeek.add({days:index})).some(date=>onDay(date.toString()).length);
 const starts=[...(upcoming?[nextWeek]:[]),...logCalendarWeeks(anchor,weeks)];
 return <div ref={root} className="log-calendar-history">
  <div className="log-weekday-row" aria-hidden="true"><span/>{['S','M','T','W','T','F','S'].map((day,index)=><span className="log-weekday" key={index}>{day}</span>)}<span/></div>
  <div className="log-calendar-weeks" aria-label="Calendar">
   {starts.map((start,index)=>{
    const days=Array.from({length:7},(_,day)=>start.add({days:day})),last=days[6],newer=starts[index-1];
    const labelled=index===0||start.month!==last.month||last.day===last.daysInMonth;
    return <Fragment key={start.toString()}><section className="log-week" data-week={start.toString()} aria-label={`Week of ${dateLabel(start.toString())}`}>
     <div className="log-week-label">{labelled&&<><span>{new Date(`${start}T12:00:00`).toLocaleDateString(undefined,{month:'short'})}</span><span>{start.year}</span></>}</div>
     <div className="log-calendar">{days.map(day=>{const date=day.toString(),entries=onDay(date),special=entries.length>0&&entries.every(entry=>entry.date!==date);return <button key={date} className="log-day" data-today={date===today.toString()||undefined} data-future={Temporal.PlainDate.compare(day,today)>0&&!entries.length||undefined} aria-label={entries.length?`${dateLabel(date)}: ${entries.length===1?entries[0].title||'one entry':`${entries.length} entries`}`:`Add entry for ${dateLabel(date)}`} onClick={()=>entries.length===0?create(date):entries.length===1?open(entries[0]):setSelectedDay(selectedDay===date?null:date)}>
      {special?<Star className="log-day-special" weight="fill" size={20}/>:entries.length?<span className="log-day-mosaic" data-columns={entries.length===1?1:entries.length<=4?2:3}>{entries.slice(0,9).map(entry=>{const image=logCover(entry);return <span key={entry.id}>{image&&<img src={image.url} alt="" loading="lazy"/>}</span>;})}</span>:<span className="log-empty-date">{day.day}</span>}
     </button>;})}</div><div className="log-week-right"/>
    </section>{selectedDay&&days.some(day=>day.toString()===selectedDay)&&<section className="log-day-picker" aria-label={`Entries for ${selectedDay}`}><div><strong>{dateLabel(selectedDay)}</strong><button aria-label="Close day" onClick={()=>setSelectedDay(null)}><X size={18}/></button></div>{onDay(selectedDay).map(entry=><button className="log-day-choice" key={entry.id} onClick={()=>open(entry)}>{logCover(entry)?<img src={logCover(entry)!.url} alt=""/>:<span className="log-choice-placeholder"/>}<span>{entry.title||'(untitled)'}<small>{entry.contributors.map(person=>person.handle||person.name).join(', ')}</small></span></button>)}<button className="log-outline-button" onClick={()=>create(selectedDay)}>log another event</button></section>}</Fragment>;

   })}
  </div>
  <div ref={sentinel} className="log-calendar-edge" aria-live="polite">{busy?<CircleNotch className="spin" size={22} aria-label="Loading older weeks"/>:error?<><p className="error">{error}</p><button onClick={()=>void load(loaded.current===0)}>Try again</button></>:<button onClick={()=>void load()}>Older weeks</button>}</div>
 </div>;
}
