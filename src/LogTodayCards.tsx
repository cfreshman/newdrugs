import {primeLogEntry} from './logEntryCache';
import {logImageUrl} from './logImageCache';
import {useLayoutEffect,useRef} from 'react';
import type {LogEntry,LogPreferences} from '../shared/log';
import {logCover} from './logCalendarModel';
import {NavLink} from './NavLink';
import {useHorizontalSwipe} from './useHorizontalSwipe';
type Presentation=LogPreferences['todayPresentation'];
export function swipeTodayPresentation(current:Presentation,dx:number,dy:number):Presentation{
 if(Math.abs(dx)<40||Math.abs(dy)>=40||Math.abs(dx)<Math.abs(dy)*1.25)return current;
 return dx<0?(current==='right'?'full':'left'):(current==='left'?'full':'right');
}
export function LogTodayCards({entries,presentation,change,open}:{entries:LogEntry[];presentation:Presentation;change(value:Presentation):void;open(entry:LogEntry):void}){
 const root=useRef<HTMLDivElement>(null);
 const swipe=useHorizontalSwipe({allowMouse:true,threshold:40,maxDuration:Infinity,swipe:(_direction,dx,dy)=>{const next=swipeTodayPresentation(presentation,dx,dy);if(next!==presentation)change(next);}});
 useLayoutEffect(()=>{const node=root.current;if(node)node.scrollTop=node.scrollHeight;},[presentation,entries.map(entry=>entry.id).join(',')]);
 return <div ref={root} className="log-today-floaters" data-presentation={presentation} role="group" aria-label="Today's hangouts" tabIndex={0} {...swipe}
 onKeyDown={event=>{if(event.target!==event.currentTarget||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const next=swipeTodayPresentation(presentation,event.key==='ArrowLeft'?-50:50,0);if(next!==presentation)change(next);}}>
 {entries.map(entry=><NavLink className="log-today-card" key={entry.id} to={{view:'log',resourceId:entry.id}} navigate={()=>{primeLogEntry(entry);open(entry);}}>{logCover(entry)?<img src={logImageUrl(logCover(entry)!.url)} alt="" draggable={false}/>:<span className="log-today-placeholder" aria-hidden="true"/>}<span>{entry.title||entry.place||'(untitled)'}<small>{entry.contributors.map(person=>person.handle||person.name).join(', ')}</small></span></NavLink>)}
 </div>;
}
