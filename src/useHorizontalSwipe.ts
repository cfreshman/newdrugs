import {useLayoutEffect,useRef,type PointerEvent} from 'react';

let clearClickGuard:(()=>void)|undefined;
/** Consume the release click even if navigation replaces the gesture's source. */
export function consumeSwipeClick(owner:HTMLElement){
 clearClickGuard?.();
 const boundary=owner.closest('.mode-main,.composer-menu-layer')||owner.closest('.app,.composer-view')||owner;
 const clear=()=>{clearTimeout(timer);document.removeEventListener('click',click,true);document.removeEventListener('pointerdown',clear,true);if(clearClickGuard===clear)clearClickGuard=undefined;};
 const click=(event:MouseEvent)=>{if(event.target instanceof Node&&boundary.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();clear();}};
 const timer=setTimeout(clear,350);clearClickGuard=clear;
 document.addEventListener('click',click,true);document.addEventListener('pointerdown',clear,true);
}
interface Options {active?:boolean;allowMouse?:boolean;threshold?:number;ratio?:number;maxDuration?:number;ignore?:string;canSwipe?():boolean;swipe(direction:-1|1,dx:number,dy:number):void}
const controls='button,input,textarea,select,video,audio,iframe,[contenteditable]';

/** Single-pointer navigation leaves vertical scrolling, pinch and selection native. */
export function useHorizontalSwipe(options:Options){
 const current=useRef(options);current.current=options;
 const points=useRef(new Set<number>()),gesture=useRef<{id:number;x:number;y:number;time:number;horizontal:boolean}|null>(null);
 const reset=()=>{points.current.clear();gesture.current=null;};
 useLayoutEffect(()=>{if(options.active===false)reset();return reset;},[options.active]);
 const onPointerDown=(event:PointerEvent<HTMLElement>)=>{
  const config=current.current;
  if(config.active===false||config.canSwipe?.()===false||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||event.pointerType==='mouse'&&(!config.allowMouse||event.button!==0))return;
  points.current.add(event.pointerId);if(points.current.size>1){gesture.current=null;return;}
  if((event.target as Element).closest(config.ignore||controls))return;
  gesture.current={id:event.pointerId,x:event.clientX,y:event.clientY,time:performance.now(),horizontal:false};
 };
 const onPointerMove=(event:PointerEvent<HTMLElement>)=>{
  const start=gesture.current;if(!start||start.id!==event.pointerId)return;
  const dx=event.clientX-start.x,dy=event.clientY-start.y,ratio=current.current.ratio||1.25;
  if(!start.horizontal&&Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)*ratio){gesture.current=null;return;}
  if(!start.horizontal&&Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*ratio){start.horizontal=true;event.currentTarget.setPointerCapture?.(event.pointerId);}
  if(start.horizontal)event.preventDefault();
 };
 const onPointerUp=(event:PointerEvent<HTMLElement>)=>{
  points.current.delete(event.pointerId);const start=gesture.current;
  if(!start||start.id!==event.pointerId)return;gesture.current=null;
  const config=current.current,dx=event.clientX-start.x,dy=event.clientY-start.y;
  if(config.active===false||config.canSwipe?.()===false||points.current.size||performance.now()-start.time>(config.maxDuration??700)||Math.abs(dx)<(config.threshold??48)||Math.abs(dx)<=Math.abs(dy)*(config.ratio||1.25)||window.getSelection()?.isCollapsed===false)return;
  event.preventDefault();event.stopPropagation();consumeSwipeClick(event.currentTarget);config.swipe(dx<0?1:-1,dx,dy);
 };
 const onPointerCancel=(event:PointerEvent<HTMLElement>)=>{points.current.delete(event.pointerId);gesture.current=null;};
 const onPointerDownCapture=(event:PointerEvent<HTMLElement>)=>{const config=current.current;if(config.active===false||event.pointerType==='mouse'&&(!config.allowMouse||event.button!==0))return;points.current.add(event.pointerId);if(points.current.size>1)gesture.current=null;};
 const onPointerUpCapture=(event:PointerEvent<HTMLElement>)=>{points.current.delete(event.pointerId);};
 return {onPointerDownCapture,onPointerUpCapture,onPointerCancelCapture:onPointerCancel,onPointerDown,onPointerMove,onPointerUp,onPointerCancel,onLostPointerCapture:onPointerCancel};
}
