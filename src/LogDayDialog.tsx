import {useLayoutEffect,useRef,useId,type ReactNode,type RefObject} from 'react';
import {CaretLeft,CaretRight} from '@phosphor-icons/react';
import {observeLogLayerGeometry,isEditableLogTarget} from './LogModal';
import {useHorizontalSwipe,consumeSwipeClick} from './useHorizontalSwipe';
import {PanelVisibilityContext} from './PanelReadiness';
import {NavLink} from './NavLink';
import type {Destination} from '../shared/navigation';

/** A centered chooser above the unchanged calendar, with its own navigation. */
export function LogDayDialog({active,anchor,close,previous,next,previousTo,nextTo,children}:{previousTo?:Destination;nextTo?:Destination;active:boolean;anchor:RefObject<HTMLElement|null>;close():void;previous?():void;next?():void;children:ReactNode}){
 const layer=useRef<HTMLDialogElement>(null),card=useRef<HTMLDivElement>(null),sourceFocus=useRef<HTMLElement|null>(null),label=useId();
 const swipe=useHorizontalSwipe({active,allowMouse:true,ignore:'button,input,textarea,select,video,audio,iframe,[contenteditable]',swipe:direction=>direction<0?previous?.():next?.()});
 useLayoutEffect(()=>{const dialog=layer.current,panel=anchor.current?.closest<HTMLElement>('.mode-main,.composer-menu-layer')||anchor.current?.closest<HTMLElement>('.composer-view')||anchor.current;if(active&&dialog&&panel)return observeLogLayerGeometry(dialog,panel,true);},[active,anchor]);
 useLayoutEffect(()=>{
  const dialog=layer.current;if(!dialog)return;let cancelled=false;
  if(active){sourceFocus.current=document.activeElement instanceof HTMLElement?document.activeElement:null;queueMicrotask(()=>{if(cancelled||!dialog.isConnected)return;dialog.showPopover?.();dialog.focus({preventScroll:true});});}
  const outside=(event:PointerEvent)=>{if(card.current?.contains(event.target as Node))return;event.preventDefault();event.stopPropagation();consumeSwipeClick(dialog);close();};
  if(active)document.addEventListener('pointerdown',outside,true);
  return()=>{cancelled=true;document.removeEventListener('pointerdown',outside,true);dialog.hidePopover?.();};
 },[active,close]);
 useLayoutEffect(()=>()=>{const source=sourceFocus.current;requestAnimationFrame(()=>{if(source?.isConnected&&!source.closest('[hidden],[inert]'))source.focus({preventScroll:true});});},[]);
 return <dialog ref={layer} open={active} popover="manual" tabIndex={-1} className="log-modal log-day-layer" data-open={active||undefined} aria-label="Choose a hangout" {...swipe} onKeyDown={event=>{
  event.stopPropagation();if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||isEditableLogTarget(event.target))return;
  if(event.key==='Escape'){event.preventDefault();close();}else if(event.key==='ArrowLeft'&&previous){event.preventDefault();previous();}else if(event.key==='ArrowRight'&&next){event.preventDefault();next();}
 }} onCancel={event=>{event.preventDefault();close();}}><div className="log-day-scrim" aria-hidden="true"/><div ref={card} className="log-day-card" aria-describedby={label}>
  <span className="sr-only" id={label}>Swipe or use the arrows to change days.</span>
  {previousTo&&previous?<NavLink className="close log-day-previous" aria-label="Previous day" to={previousTo} navigate={previous}><CaretLeft size={21}/></NavLink>:<button type="button" className="close log-day-previous" aria-label="Previous day" disabled><CaretLeft size={21}/></button>}
  <PanelVisibilityContext.Provider value={active}>{children}</PanelVisibilityContext.Provider>
  {nextTo&&next?<NavLink className="close log-day-next" aria-label="Next day" to={nextTo} navigate={next}><CaretRight size={21}/></NavLink>:<button type="button" className="close log-day-next" aria-label="Next day" disabled><CaretRight size={21}/></button>}
 </div></dialog>;
}
