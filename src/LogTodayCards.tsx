import {primeLogEntry} from './logEntryCache';
import {logImageUrl} from './logImageCache';
import {useLayoutEffect,useRef} from 'react';
import type {LogEntry,LogPreferences} from '../shared/log';
import {logCover} from './logCalendarModel';
import {NavLink} from './NavLink';
type Presentation=LogPreferences['todayPresentation'];
export function swipeTodayPresentation(current:Presentation,dx:number,dy:number):Presentation{
 if(Math.abs(dx)<40||Math.abs(dy)>=40||Math.abs(dx)<Math.abs(dy)*1.25)return current;
 return dx<0?(current==='right'?'full':'left'):(current==='left'?'full':'right');
}
export function LogTodayCards({entries,presentation,change,open}:{entries:LogEntry[];presentation:Presentation;change(value:Presentation):void;open(entry:LogEntry):void}){
 const root=useRef<HTMLDivElement>(null),gesture=useRef<{id:number;x:number;y:number;horizontal:boolean}|null>(null),suppressClick=useRef(false);
 useLayoutEffect(()=>{const node=root.current;if(node)node.scrollTop=node.scrollHeight;},[presentation,entries.map(entry=>entry.id).join(',')]);
 return <div ref={root} className="log-today-floaters" data-presentation={presentation} role="group" aria-label="Today's hangouts" tabIndex={0}
 onPointerDown={event=>{gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,horizontal:false};suppressClick.current=false;}}
 onPointerMove={event=>{const start=gesture.current;if(!start||start.id!==event.pointerId)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(!start.horizontal&&Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.25){start.horizontal=true;event.currentTarget.setPointerCapture?.(event.pointerId);}if(start.horizontal)event.preventDefault();}}
 onPointerUp={event=>{const start=gesture.current;gesture.current=null;if(!start)return;const dx=event.clientX-start.x,dy=event.clientY-start.y,next=swipeTodayPresentation(presentation,dx,dy);suppressClick.current=start.horizontal||next!==presentation;if(next!==presentation)change(next);}}
 onPointerCancel={()=>{gesture.current=null;}}
 onClickCapture={event=>{if(suppressClick.current){event.preventDefault();event.stopPropagation();suppressClick.current=false;}}}
 onKeyDown={event=>{if(event.target!==event.currentTarget||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const next=swipeTodayPresentation(presentation,event.key==='ArrowLeft'?-50:50,0);if(next!==presentation)change(next);}}>
 {entries.map(entry=><NavLink className="log-today-card" key={entry.id} to={{view:'log',resourceId:entry.id}} navigate={()=>{primeLogEntry(entry);open(entry);}}>{logCover(entry)?<img src={logImageUrl(logCover(entry)!.url)} alt="" draggable={false}/>:<span className="log-today-placeholder" aria-hidden="true"/>}<span>{entry.title||entry.place||'(untitled)'}<small>{entry.contributors.map(person=>person.handle||person.name).join(', ')}</small></span></NavLink>)}
 </div>;
}
