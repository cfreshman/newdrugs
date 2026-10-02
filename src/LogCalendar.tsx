import {useLogCalendarData,CALENDAR_CHUNK_WEEKS} from './useLogCalendarData';
import {LogCalendarDay} from './LogCalendarDay';
import {LogDayDialog} from './LogDayDialog';
import {useLogDayNeighbors} from './useLogDayNeighbors';
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
import {useVirtualizer,defaultRangeExtractor,type Range,type Virtualizer} from '@tanstack/react-virtual';
import {retainCalendarWeeks} from './logCalendarRetention';
import {LOG_WEEK_BATCH,logWeekStart,logCalendarWeeks,logWeekMonth,logCover} from './logCalendarModel';
import {NavLink} from './NavLink';

type Scope='all'|'private'|'shared';
const EMPTY_ENTRIES:LogEntry[]=[];
// Preserved panels may become display:none. Ignore zero-sized observations so
// hiding an overlay does not discard the visible rows or their scroll anchor.
function observeCalendarRect(instance:Virtualizer<HTMLElement,Element>,callback:(rect:{width:number;height:number})=>void){
 const node=instance.scrollElement;if(!node)return;
 const measure=()=>{if(node.clientWidth&&node.clientHeight)callback({width:node.clientWidth,height:node.clientHeight});};
 measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();
}

export function LogCalendar({month,scope,query,personId,date:initialDay,onDayChange,jump,create,open,openPerson,onPreviews,seedEntries=EMPTY_ENTRIES}:{date?:string;onDayChange?(date:string|undefined):void;month?:string;scope:Scope;query:string;personId?:string;jump(month?:string):void;create(date:string):void;open(entry:LogEntry|LogCalendarTile,list?:(LogEntry|LogCalendarTile)[],query?:Partial<LogList>,cursor?:string|null):void;openPerson?(personId:string):void;onPreviews?(entries:LogCalendarTile[]):void;seedEntries?:LogEntry[]}){
 const actions=useRef({open,create,openPerson,onPreviews,onDayChange});actions.current={open,create,openPerson,onPreviews,onDayChange};
 const openEntry=useCallback((entry:LogEntry|LogCalendarTile,list?:(LogEntry|LogCalendarTile)[],query?:Partial<LogList>,cursor?:string|null)=>{if("contributors" in entry)primeLogEntry(entry);actions.current.open(entry,list,query,cursor);},[]);
 const createEntry=useCallback((date:string)=>actions.current.create(date),[]),showPerson=useCallback((id:string)=>actions.current.openPerson?.(id),[]);
 const visible=usePanelVisible(),root=useRef<HTMLDivElement>(null),sentinel=useRef<HTMLDivElement>(null);
 const knownUpcoming=useRef(false);
 const [today]=useState(()=>Temporal.Now.plainDateISO());
 const [anchor]=useState(()=>logWeekStart(month?Temporal.PlainDate.from(`${month}-01`).add({months:1}).subtract({days:1}):today));
 const [birthdays,setBirthdays]=useState<BirthdayPerson[]>([]),[ownBirthday,setOwnBirthday]=useState<OwnBirthday|null>(null);
 const [weeks,setWeeks]=useState(LOG_WEEK_BATCH),[selectedDay,setSelectedDay]=useState<string|null>(initialDay||null),[wanted,setWanted]=useState([0,1]);
 const pendingDayIntent=useRef<'previous'|'next'|null>(null);
 useLayoutEffect(()=>setSelectedDay(initialDay||null),[initialDay]);
 const changeDay=useCallback((date:string|null)=>{pendingDayIntent.current=null;setSelectedDay(date);actions.current.onDayChange?.(date||undefined);},[]);
 const closeDay=useCallback(()=>changeDay(null),[changeDay]);
 const chooseEntry=useCallback((entry:LogEntry|LogCalendarTile)=>{changeDay(null);openEntry(entry);},[changeDay,openEntry]);
 const filters={scope,...(query?{query}:{}),...(personId?{personId}:{})};
 const neighboringDays=useLogDayNeighbors(selectedDay,filters,visible&&Boolean(selectedDay));
 useEffect(()=>{
  if(!selectedDay||neighboringDays.date!==selectedDay||neighboringDays.pending)return;
  const intent=pendingDayIntent.current;pendingDayIntent.current=null;
  if(intent&&neighboringDays[intent])changeDay(neighboringDays[intent]);
 },[selectedDay,neighboringDays.date,neighboringDays.pending,neighboringDays.previous,neighboringDays.next,changeDay]);
 const {days:calendarDays,busy,error,retry,cachedChunks}=useLogCalendarData(anchor,today.toString(),filters,wanted,visible);
 useEffect(()=>{actions.current.onPreviews?.([...new Map([...calendarDays.values()].flatMap(day=>day.items).map(entry=>[entry.id,entry])).values()]);},[calendarDays]);
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
 const seeded=new Map<string,LogCalendarTile[]>();for(const entry of seedEntries){const tile={id:entry.id,date:entry.date,title:entry.title,createdAt:entry.createdAt,cover:logCover(entry)||null};seeded.set(entry.date,[...(seeded.get(entry.date)||[]),tile]);}
 const ordered=new Map<string,LogCalendarTile[]>();const onDay=(date:string)=>{const cached=ordered.get(date);if(cached)return cached;const entries=calendarDays.get(date)?.items||seeded.get(date)||[],value=entries.length>1?[...entries].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)):entries;ordered.set(date,value);return value;};
 const nextWeek=anchor.add({weeks:1}),nextDays=Array.from({length:7},(_,index)=>nextWeek.add({days:index}));
 if(calendarDays.has(nextWeek.toString()))knownUpcoming.current=nextDays.some(date=>onDay(date.toString()).length||birthdaysOn(date.toString()).length);
 const upcoming=knownUpcoming.current||nextDays.some(date=>birthdaysOn(date.toString()).length);
 const starts=[...(upcoming?[nextWeek]:[]),...logCalendarWeeks(anchor,weeks)];
 return {starts,onDay,birthdaysOn};
 },[anchor,weeks,calendarDays,birthdays,today,seedEntries]);
 const {starts,onDay,birthdaysOn}=calendar;
 const getScrollElement=useCallback(()=>root.current?.closest<HTMLElement>('.composer-view')||null,[]);
 const [rowWidth,setRowWidth]=useState(600);
 useLayoutEffect(()=>{const node=root.current;if(!node)return;const measure=()=>{if(node.clientWidth)setRowWidth(node.clientWidth);};measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();},[]);
 const estimateSize=useCallback(()=>Math.max(1,(rowWidth-2*Math.max(34,(rowWidth-8)/9)-8)/7),[rowWidth]);
 const getItemKey=useCallback((index:number)=>starts[index].toString(),[starts]);
 const measureElement=useCallback((element:Element,_entry:ResizeObserverEntry|undefined,instance:Virtualizer<HTMLElement,Element>)=>element.getBoundingClientRect().height||instance.getVirtualItems().find(item=>item.index===Number(element.getAttribute('data-index')))?.size||estimateSize(),[estimateSize]);
 const retainedWeeks=useRef(new Map<string,number>());
 const weekIndices=useMemo(()=>new Map(starts.map((start,index)=>[start.toString(),index])),[starts]);
 const thumbnailCounts=useMemo(()=>new Map<string,number>(),[weekIndices,onDay]);
 const rangeExtractor=useCallback((range:Range)=>{
  const visible=defaultRangeExtractor(range).map(index=>starts[index].toString());
  retainedWeeks.current=retainCalendarWeeks(retainedWeeks.current,visible,week=>{
   const cached=thumbnailCounts.get(week);if(cached!==undefined)return cached;
   const index=weekIndices.get(week);if(index===undefined)return 0;
   const count=Array.from({length:7},(_,day)=>onDay(starts[index].add({days:day}).toString()).slice(0,9).filter(entry=>entry.cover).length).reduce((sum,count)=>sum+count,0);
   thumbnailCounts.set(week,count);return count;
  });
  return [...retainedWeeks.current.keys()].flatMap(week=>{const index=weekIndices.get(week);return index===undefined?[]:[index];}).sort((a,b)=>a-b);
 },[starts,weekIndices,onDay,thumbnailCounts]);
 const virtual=useVirtualizer({count:starts.length,getScrollElement,getItemKey,estimateSize,measureElement,rangeExtractor,overscan:10,gap:1,initialRect:{width:600,height:800},observeElementRect:observeCalendarRect});
 const virtualRows=virtual.getVirtualItems();
 // Retained rows are presentation only. Prefetch follows the actual viewport.
 const viewportRows=virtual.range?defaultRangeExtractor({...virtual.range,overscan:10,count:starts.length}):[];
 const virtualRange=viewportRows.length?`${starts[viewportRows[0]]}:${starts[viewportRows.at(-1)!]}`:'';
 useEffect(()=>{if(!viewportRows.length)return;const indices=viewportRows.map(index=>Math.max(0,Math.floor(starts[index].until(anchor).days/7/CALENDAR_CHUNK_WEEKS))),from=Math.max(0,Math.min(...indices)-1),through=Math.max(...indices)+1;setWanted(Array.from({length:through-from+1},(_,i)=>from+i));},[virtualRange]);
 const grid=useMemo(()=> <div className="log-calendar-weeks" aria-label="Calendar" data-week-count={starts.length} data-cached-chunks={cachedChunks} style={{height:virtual.getTotalSize(),position:'relative'}}>
   {virtualRows.map(virtualRow=>{const index=virtualRow.index,start=starts[index];
    const days=Array.from({length:7},(_,day)=>start.add({days:day}));
    const age=logLifeQuarter(ownBirthday,start);
    const monthLabel=logWeekMonth(start);
    return <div className="log-virtual-week" data-index={index} key={start.toString()} ref={virtual.measureElement} style={{position:"absolute",width:"100%",top:0,transform:`translateY(${virtualRow.start}px)`}}><section className="log-week" data-week={start.toString()} aria-label={`Week of ${dateLabel(start.toString())}`}>
     <div className="log-week-label">{monthLabel&&<><span>{new Date(`${monthLabel}T12:00:00`).toLocaleDateString(undefined,{month:'short'})}</span><span>{monthLabel.year}</span></>}</div>
     <div className="log-calendar" style={{height:estimateSize()}}>{days.map(day=>{const date=day.toString(),entries=onDay(date),birthdays=birthdaysOn(date),special=entries.length>0&&entries.every(entry=>entry.date!==date),label=birthdays.length?`${dateLabel(date)}: ${birthdays.map(person=>`${person.handle||person.name}'s birthday`).join(', ')}${entries.length?`, ${entries.length} entries`:''}`:entries.length?`${dateLabel(date)}: ${entries.length===1?entries[0].title||'one entry':`${entries.length} entries`}`:`Add entry for ${dateLabel(date)}`,content=<>{special?<Star className="log-day-special" weight="fill" size={20}/>:entries.length?<span className="log-day-mosaic" data-columns={entries.length===1?1:entries.length<=4?2:3}>{entries.slice(0,9).map(entry=>{const image=entry.cover;return <span key={entry.id}>{image&&<img src={logImageUrl(image.url)} alt="" loading="lazy"/>}</span>;})}</span>:birthdays.length?<Cake className="log-day-special" size={20}/>:<span className="log-empty-date">{day.day}</span>}{birthdays.length>0&&entries.length>0&&<Cake className="log-birthday-mark" size={15}/>}</>;
      const state={className:'log-day',...(date===today.toString()?{'data-today':true}:{}),...(Temporal.PlainDate.compare(day,today)>0&&!entries.length&&!birthdays.length?{'data-future':true}:{}),'aria-label':label};
      if(birthdays.length===1&&!entries.length)return <NavLink key={date} {...state} to={{view:'person',resourceId:birthdays[0].personId}} navigate={()=>showPerson(birthdays[0].personId)}>{content}</NavLink>;
      if(entries.length===1&&!birthdays.length)return <NavLink key={date} {...state} to={{view:'log',resourceId:entries[0].id}} navigate={()=>openEntry(entries[0])}>{content}</NavLink>;
      if(calendarDays.has(date)&&!entries.length&&!birthdays.length)return <NavLink key={date} {...state} to={{view:'log_compose',date}} navigate={()=>createEntry(date)}>{content}</NavLink>;
      return <NavLink key={date} {...state} to={{view:'log',date,logScope:scope,query:query||undefined,personId}} navigate={()=>changeDay(date)}>{content}</NavLink>;
     })}</div><div className="log-week-right" aria-label={age?`${age.years} years${age.months?`, ${age.months} months`:""}`:undefined}>{age?.label}</div>
    </section></div>;

   })}
  </div>,[virtualRows,starts,onDay,birthdaysOn,ownBirthday,today,calendarDays,cachedChunks,openEntry,createEntry,showPerson,virtual,changeDay,scope,query,personId,estimateSize]);
 return <div ref={root} className="log-calendar-history">
  <LogCalendarHeader><button type="button" className="log-weekday-row" aria-label="Scroll calendar to top" onClick={()=>root.current?.closest<HTMLElement>('.composer-view')?.scrollTo({top:0,behavior:'smooth'})}><span/>{['S','M','T','W','T','F','S'].map((day,index)=><span className="log-weekday" key={index}>{day}</span>)}<span/></button></LogCalendarHeader>
  {grid}
  <div ref={sentinel} className="log-calendar-edge" aria-live="polite">{busy?<CircleNotch className="spin spinner-immediate" size={22} aria-label="Loading older weeks"/>:error?<><p className="error">{error}</p><button onClick={retry}>Try again</button></>:<button onClick={append}>Older weeks</button>}</div>
  {selectedDay&&<LogDayDialog active={visible} anchor={root} close={closeDay} previous={neighboringDays.previous?()=>changeDay(neighboringDays.previous):undefined} next={neighboringDays.next?()=>changeDay(neighboringDays.next):undefined} pendingPrevious={neighboringDays.pending?()=>{pendingDayIntent.current='previous';}:undefined} pendingNext={neighboringDays.pending?()=>{pendingDayIntent.current='next';}:undefined} previousTo={neighboringDays.previous?{view:'log',date:neighboringDays.previous,logScope:scope,query:query||undefined,personId}:undefined} nextTo={neighboringDays.next?{view:'log',date:neighboringDays.next,logScope:scope,query:query||undefined,personId}:undefined}><LogCalendarDay key={selectedDay} date={selectedDay} today={today.toString()} filters={filters} previews={onDay(selectedDay)} openPreview={chooseEntry} open={chooseEntry}>{birthdaysOn(selectedDay).map(person=><NavLink className="log-day-choice" key={`birthday:${person.personId}`} to={{view:'person',resourceId:person.personId}} navigate={()=>showPerson(person.personId)}><Cake size={24}/><span>{person.handle||person.name}’s birthday</span></NavLink>)}</LogCalendarDay></LogDayDialog>}
 </div>;
}
