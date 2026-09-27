import {logImageUrl} from './logImageCache';
import {logDateLabel as dateLabel} from './logDate';
import {birthdayOn,type BirthdayPerson} from '../shared/logBirthday';
import {LogCalendarHeader} from './LogChrome';
import {useEffect,useLayoutEffect,useRef,useState,Fragment} from 'react';
import {Temporal} from '@js-temporal/polyfill';
import {CircleNotch,Star,X,Cake} from '@phosphor-icons/react';
import {recurrenceOn,type LogEntry,type LogPage} from '../shared/log';
import {operation,errorText} from './api';
import {usePanelVisible} from './PanelReadiness';
import {useRecordRefresh} from './useRecordRefresh';
import {LOG_WEEK_BATCH,logWeekStart,logCalendarRange,logCalendarWeeks,logCover} from './logCalendarModel';

type Scope='all'|'private'|'shared';

export function LogCalendar({month,scope,query,personId,jump,create,open,openPerson}:{month?:string;scope:Scope;query:string;personId?:string;jump(month?:string):void;create(date:string):void;open(entry:LogEntry):void;openPerson?(personId:string):void}){
 const visible=usePanelVisible(),root=useRef<HTMLDivElement>(null),sentinel=useRef<HTMLDivElement>(null);
 const [today]=useState(()=>Temporal.Now.plainDateISO());
 const [anchor]=useState(()=>logWeekStart(month?Temporal.PlainDate.from(`${month}-01`).add({months:1}).subtract({days:1}):today));
 const [birthdays,setBirthdays]=useState<BirthdayPerson[]>([]);
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
   let observer:IntersectionObserver;const observe=()=>{observer?.disconnect();observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))void load();},{root:scroller,rootMargin:`0px 0px ${Math.max(360,scroller.clientHeight)}px 0px`});observer.observe(target);};observe();const resize=new ResizeObserver(observe);resize.observe(scroller);return()=>{observer.disconnect();resize.disconnect();};
  }
  const scroll=()=>{if(scroller.clientHeight>0&&scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<Math.max(360,scroller.clientHeight))void load();};
  scroller.addEventListener('scroll',scroll,{passive:true});return()=>scroller.removeEventListener('scroll',scroll);
 },[visible,busy,error,weeks]);
 const loadBirthdays=()=>operation<{items:BirthdayPerson[]}>('log.birthdays',{}).then(result=>setBirthdays(result.items)).catch(()=>{});
 useEffect(()=>{void loadBirthdays();},[]);useRecordRefresh(['log_birthdays','log','connections','people'],()=>{void loadBirthdays();});
 const birthdaysOn=(date:string)=>date<today.toString()?[]:birthdays.filter(person=>birthdayOn(person,date));
 const byDay=new Map<string,LogEntry[]>();for(const entry of items)byDay.set(entry.date,[...byDay.get(entry.date)||[],entry]);
 const onDay=(date:string)=>{const actual=byDay.get(date)||[];return [...actual,...recurring.filter(entry=>date>today.toString()&&entry.date!==date&&recurrenceOn(entry,Number(date.slice(0,4)))===date&&!actual.some(item=>item.id===entry.id))].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));};
 const nextWeek=anchor.add({weeks:1}),upcoming=Array.from({length:7},(_,index)=>nextWeek.add({days:index})).some(date=>onDay(date.toString()).length||birthdaysOn(date.toString()).length);
 const starts=[...(upcoming?[nextWeek]:[]),...logCalendarWeeks(anchor,weeks)];
 return <div ref={root} className="log-calendar-history">
  <LogCalendarHeader><button type="button" className="log-weekday-row" aria-label="Scroll calendar to top" onClick={()=>root.current?.closest<HTMLElement>('.composer-view')?.scrollTo({top:0,behavior:'smooth'})}><span/>{['S','M','T','W','T','F','S'].map((day,index)=><span className="log-weekday" key={index}>{day}</span>)}<span/></button></LogCalendarHeader>
  <div className="log-calendar-weeks" aria-label="Calendar">
   {starts.map((start,index)=>{
    const days=Array.from({length:7},(_,day)=>start.add({days:day})),last=days[6],newer=starts[index-1];
    const labelled=index===0||start.month!==last.month||last.day===last.daysInMonth;
    return <Fragment key={start.toString()}><section className="log-week" data-week={start.toString()} aria-label={`Week of ${dateLabel(start.toString())}`}>
     <div className="log-week-label">{labelled&&<><span>{new Date(`${start}T12:00:00`).toLocaleDateString(undefined,{month:'short'})}</span><span>{start.year}</span></>}</div>
     <div className="log-calendar">{days.map(day=>{const date=day.toString(),entries=onDay(date),birthdays= birthdaysOn(date),special=entries.length>0&&entries.every(entry=>entry.date!==date);return <button key={date} className="log-day" data-today={date===today.toString()||undefined} data-future={Temporal.PlainDate.compare(day,today)>0&&!entries.length&&!birthdays.length||undefined} aria-label={birthdays.length?`${dateLabel(date)}: ${birthdays.map(person=>`${person.handle||person.name}'s birthday`).join(', ')}${entries.length?`, ${entries.length} entries`:''}`:entries.length?`${dateLabel(date)}: ${entries.length===1?entries[0].title||'one entry':`${entries.length} entries`}`:`Add entry for ${dateLabel(date)}`} onClick={()=>birthdays.length?(birthdays.length===1&&!entries.length?openPerson?.(birthdays[0].personId):setSelectedDay(selectedDay===date?null:date)):entries.length===0?create(date):entries.length===1?open(entries[0]):setSelectedDay(selectedDay===date?null:date)}>
      {special?<Star className="log-day-special" weight="fill" size={20}/>:entries.length?<span className="log-day-mosaic" data-columns={entries.length===1?1:entries.length<=4?2:3}>{entries.slice(0,9).map(entry=>{const image=logCover(entry);return <span key={entry.id}>{image&&<img src={logImageUrl(image.url)} alt="" loading="lazy"/>}</span>;})}</span>:birthdays.length?<Cake className="log-day-special" size={20}/>:<span className="log-empty-date">{day.day}</span>}{birthdays.length>0&&entries.length>0&&<Cake className="log-birthday-mark" size={15}/>}
     </button>;})}</div><div className="log-week-right"/>
    </section>{selectedDay&&days.some(day=>day.toString()===selectedDay)&&<section className="log-day-picker" aria-label={`Entries for ${selectedDay}`}><div><strong>{dateLabel(selectedDay)}</strong><button aria-label="Close day" onClick={()=>setSelectedDay(null)}><X size={18}/></button></div>{birthdaysOn(selectedDay).map(person=><button className="log-day-choice" key={`birthday:${person.personId}`} onClick={()=>openPerson?.(person.personId)}><Cake size={24}/><span>{person.handle||person.name}’s birthday</span></button>)}{onDay(selectedDay).map(entry=><button className="log-day-choice" key={entry.id} onClick={()=>open(entry)}>{logCover(entry)?<img src={logImageUrl(logCover(entry)!.url)} alt=""/>:<span className="log-choice-placeholder"/>}<span>{entry.title||'(untitled)'}<small>{entry.contributors.map(person=>person.handle||person.name).join(', ')}</small></span></button>)}<button className="log-outline-button" onClick={()=>create(selectedDay)}>log another event</button></section>}</Fragment>;

   })}
  </div>
  <div ref={sentinel} className="log-calendar-edge" aria-live="polite">{busy?<CircleNotch className="spin" size={22} aria-label="Loading older weeks"/>:error?<><p className="error">{error}</p><button onClick={()=>void load(loaded.current===0)}>Try again</button></>:<button onClick={()=>void load()}>Older weeks</button>}</div>
 </div>;
}
