import {useLogCalendarData,CALENDAR_CHUNK_WEEKS} from './useLogCalendarData';
import {LogCalendarDay} from './LogCalendarDay';
import {primeLogEntry} from './logEntryCache';
import {logImageUrl} from './logImageCache';
import {logDateLabel as dateLabel} from './logDate';
import {birthdayOn,logLifeQuarter,type OwnBirthday,type BirthdayPerson} from '../shared/logBirthday';
import {LogCalendarHeader} from './LogChrome';
import {useEffect,useLayoutEffect,useRef,useState,useMemo,useCallback} from 'react';
import {Temporal} from '@js-temporal/polyfill';
import {CircleNotch,Star,Cake} from '@phosphor-icons/react';
import {type LogEntry,type LogList,type LogCalendarTile} from '../shared/log';
import {operation} from './api';
import {usePanelVisible} from './PanelReadiness';
import {useRecordRefresh} from './useRecordRefresh';
import {useVirtualizer,type Virtualizer} from '@tanstack/react-virtual';
import {LOG_WEEK_BATCH,logWeekStart,logCalendarWeeks,logWeekMonth} from './logCalendarModel';

type Scope='all'|'private'|'shared';
// Preserved panels may become display:none. Ignore zero-sized observations so
// hiding an overlay does not discard the visible rows or their scroll anchor.
function observeCalendarRect(instance:Virtualizer<HTMLElement,Element>,callback:(rect:{width:number;height:number})=>void){
 const node=instance.scrollElement;if(!node)return;
 const measure=()=>{if(node.clientWidth&&node.clientHeight)callback({width:node.clientWidth,height:node.clientHeight});};
 measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();
}

export function LogCalendar({month,scope,query,personId,jump,create,open,openPerson}:{month?:string;scope:Scope;query:string;personId?:string;jump(month?:string):void;create(date:string):void;open(entry:LogEntry|LogCalendarTile,list?:(LogEntry|LogCalendarTile)[],query?:Partial<LogList>,cursor?:string|null):void;openPerson?(personId:string):void}){
 const actions=useRef({open,create,openPerson});actions.current={open,create,openPerson};
 const openEntry=useCallback((entry:LogEntry|LogCalendarTile,list?:(LogEntry|LogCalendarTile)[],query?:Partial<LogList>,cursor?:string|null)=>{if("contributors" in entry)primeLogEntry(entry);actions.current.open(entry,list,query,cursor);},[]);
 const createEntry=useCallback((date:string)=>actions.current.create(date),[]),showPerson=useCallback((id:string)=>actions.current.openPerson?.(id),[]);
 const visible=usePanelVisible(),root=useRef<HTMLDivElement>(null),sentinel=useRef<HTMLDivElement>(null);
 const [today]=useState(()=>Temporal.Now.plainDateISO());
 const [anchor]=useState(()=>logWeekStart(month?Temporal.PlainDate.from(`${month}-01`).add({months:1}).subtract({days:1}):today));
 const [birthdays,setBirthdays]=useState<BirthdayPerson[]>([]),[ownBirthday,setOwnBirthday]=useState<OwnBirthday|null>(null);
 const [weeks,setWeeks]=useState(LOG_WEEK_BATCH),[selectedDay,setSelectedDay]=useState<string|null>(null),[wanted,setWanted]=useState([0,1]);
 const filters={scope,...(query?{query}:{}),...(personId?{personId}:{})};
 const {days:calendarDays,busy,error,retry,cachedChunks}=useLogCalendarData(anchor,today.toString(),filters,wanted,visible);
 const append=()=>setWeeks(value=>value+LOG_WEEK_BATCH);
 useLayoutEffect(()=>{const scroller=root.current?.closest<HTMLElement>('.composer-view');if(scroller)scroller.scrollTop=0;},[]);
 useEffect(()=>{
  const target=sentinel.current,scroller=root.current?.closest<HTMLElement>('.composer-view');if(!visible||!target||!scroller)return;
  if(typeof IntersectionObserver!=='undefined'){
   let observer:IntersectionObserver;const observe=()=>{observer?.disconnect();observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))append();},{root:scroller,rootMargin:`0px 0px ${Math.max(360,scroller.clientHeight)}px 0px`});observer.observe(target);};observe();const resize=new ResizeObserver(observe);resize.observe(scroller);return()=>{observer.disconnect();resize.disconnect();};
  }
  const scroll=()=>{if(scroller.clientHeight>0&&scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<Math.max(360,scroller.clientHeight))append();};
  scroller.addEventListener('scroll',scroll,{passive:true});return()=>scroller.removeEventListener('scroll',scroll);
 },[visible,weeks]);
 const loadBirthdays=()=>Promise.all([operation<{items:BirthdayPerson[]}>('log.birthdays',{}).catch(()=>null),operation<{birthday:OwnBirthday|null}>('log.birthday_get',{}).catch(()=>null)]).then(([publicDates,own])=>{if(publicDates)setBirthdays(publicDates.items);if(own)setOwnBirthday(own.birthday||null);});
 useEffect(()=>{void loadBirthdays();},[]);useRecordRefresh(['log_birthdays','connections','people'],()=>{void loadBirthdays();});
 const calendar=useMemo(()=>{
 const birthdaysOn=(date:string)=>date<today.toString()?[]:birthdays.filter(person=>birthdayOn(person,date));
 const onDay=(date:string)=>calendarDays.get(date)?.items||[];
 const nextWeek=anchor.add({weeks:1}),upcoming=Array.from({length:7},(_,index)=>nextWeek.add({days:index})).some(date=>onDay(date.toString()).length||birthdaysOn(date.toString()).length);
 const starts=[...(upcoming?[nextWeek]:[]),...logCalendarWeeks(anchor,weeks)];
 return {starts,onDay,birthdaysOn};
 },[anchor,weeks,calendarDays,birthdays,today]);
 const {starts,onDay,birthdaysOn}=calendar;
 const getScrollElement=useCallback(()=>root.current?.closest<HTMLElement>('.composer-view')||null,[]);
 const [rowWidth,setRowWidth]=useState(600);
 useLayoutEffect(()=>{const node=root.current;if(!node)return;const measure=()=>{if(node.clientWidth)setRowWidth(node.clientWidth);};measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();},[]);
 const estimateSize=useCallback(()=>Math.max(1,(rowWidth-2*Math.max(34,(rowWidth-8)/9)-8)/7),[rowWidth]);
 const getItemKey=useCallback((index:number)=>starts[index].toString(),[starts]);
 const measureElement=useCallback((element:Element,_entry:ResizeObserverEntry|undefined,instance:Virtualizer<HTMLElement,Element>)=>element.getBoundingClientRect().height||instance.getVirtualItems().find(item=>item.index===Number(element.getAttribute('data-index')))?.size||estimateSize(),[estimateSize]);
 const virtual=useVirtualizer({count:starts.length,getScrollElement,getItemKey,estimateSize,measureElement,overscan:10,gap:1,initialRect:{width:600,height:800},observeElementRect:observeCalendarRect});
 const virtualRows=virtual.getVirtualItems();
 const virtualRange=virtualRows.length?`${starts[virtualRows[0].index]}:${starts[virtualRows.at(-1)!.index]}`:'';
 useEffect(()=>{if(!virtualRows.length)return;const indices=virtualRows.map(row=>Math.max(0,Math.floor(starts[row.index].until(anchor).days/7/CALENDAR_CHUNK_WEEKS))),from=Math.max(0,Math.min(...indices)-1),through=Math.max(...indices)+1;setWanted(Array.from({length:through-from+1},(_,i)=>from+i));},[virtualRange]);
 const grid=useMemo(()=> <div className="log-calendar-weeks" aria-label="Calendar" data-week-count={starts.length} data-cached-chunks={cachedChunks} style={{height:virtual.getTotalSize(),position:'relative'}}>
   {virtualRows.map(virtualRow=>{const index=virtualRow.index,start=starts[index];
    const days=Array.from({length:7},(_,day)=>start.add({days:day}));
    const age=logLifeQuarter(ownBirthday,start);
    const monthLabel=logWeekMonth(start);
    return <div className="log-virtual-week" data-index={index} key={start.toString()} ref={virtual.measureElement} style={{position:"absolute",width:"100%",top:0,transform:`translateY(${virtualRow.start}px)`}}><section className="log-week" data-week={start.toString()} aria-label={`Week of ${dateLabel(start.toString())}`}>
     <div className="log-week-label">{monthLabel&&<><span>{new Date(`${monthLabel}T12:00:00`).toLocaleDateString(undefined,{month:'short'})}</span><span>{monthLabel.year}</span></>}</div>
     <div className="log-calendar">{days.map(day=>{const date=day.toString(),entries=onDay(date),birthdays= birthdaysOn(date),special=entries.length>0&&entries.every(entry=>entry.date!==date);return <button key={date} className="log-day" data-today={date===today.toString()||undefined} data-future={Temporal.PlainDate.compare(day,today)>0&&!entries.length&&!birthdays.length||undefined} aria-label={birthdays.length?`${dateLabel(date)}: ${birthdays.map(person=>`${person.handle||person.name}'s birthday`).join(', ')}${entries.length?`, ${entries.length} entries`:''}`:entries.length?`${dateLabel(date)}: ${entries.length===1?entries[0].title||'one entry':`${entries.length} entries`}`:`Add entry for ${dateLabel(date)}`} onClick={()=>birthdays.length?(birthdays.length===1&&!entries.length?showPerson(birthdays[0].personId):setSelectedDay(selectedDay===date?null:date)):!calendarDays.has(date)?setSelectedDay(date):entries.length===0?createEntry(date):entries.length===1?openEntry(entries[0]):setSelectedDay(selectedDay===date?null:date)}>
      {special?<Star className="log-day-special" weight="fill" size={20}/>:entries.length?<span className="log-day-mosaic" data-columns={entries.length===1?1:entries.length<=4?2:3}>{entries.slice(0,9).map(entry=>{const image=entry.cover;return <span key={entry.id}>{image&&<img src={logImageUrl(image.url)} alt="" loading="lazy"/>}</span>;})}</span>:birthdays.length?<Cake className="log-day-special" size={20}/>:<span className="log-empty-date">{day.day}</span>}{birthdays.length>0&&entries.length>0&&<Cake className="log-birthday-mark" size={15}/>}
     </button>;})}</div><div className="log-week-right" aria-label={age?`${age.years} years${age.months?`, ${age.months} months`:""}`:undefined}>{age?.label}</div>
    </section>{selectedDay&&days.some(day=>day.toString()===selectedDay)&&<LogCalendarDay key={selectedDay} date={selectedDay} today={today.toString()} filters={filters} previews={onDay(selectedDay)} openPreview={openEntry} close={()=>setSelectedDay(null)} open={openEntry} create={()=>createEntry(selectedDay)}>{birthdaysOn(selectedDay).map(person=><button className="log-day-choice" key={`birthday:${person.personId}`} onClick={()=>showPerson(person.personId)}><Cake size={24}/><span>{person.handle||person.name}’s birthday</span></button>)}</LogCalendarDay>}</div>;

   })}
  </div>,[virtualRows,starts,onDay,birthdaysOn,ownBirthday,selectedDay,today,calendarDays,cachedChunks,openEntry,createEntry,showPerson,virtual]);
 return <div ref={root} className="log-calendar-history">
  <LogCalendarHeader><button type="button" className="log-weekday-row" aria-label="Scroll calendar to top" onClick={()=>root.current?.closest<HTMLElement>('.composer-view')?.scrollTo({top:0,behavior:'smooth'})}><span/>{['S','M','T','W','T','F','S'].map((day,index)=><span className="log-weekday" key={index}>{day}</span>)}<span/></button></LogCalendarHeader>
  {grid}
  <div ref={sentinel} className="log-calendar-edge" aria-live="polite">{busy?<CircleNotch className="spin spinner-immediate" size={22} aria-label="Loading older weeks"/>:error?<><p className="error">{error}</p><button onClick={retry}>Try again</button></>:<button onClick={append}>Older weeks</button>}</div>
 </div>;
}
