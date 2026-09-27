import {useEffect,type RefObject} from 'react';
/** A linear projection has no dominant-axis switch, including opposing diagonals. */
export const horizontalWheelDelta=(x:number,y:number)=>x+y;
export function remainingVerticalWheel(x:number,y:number,consumed:number){const length=Math.abs(x)+Math.abs(y);return length?(y*Math.abs(horizontalWheelDelta(x,y)-consumed)/length||0):0;}
function passVertical(element:HTMLElement,delta:number){
 for(let parent=element.parentElement;parent&&Math.abs(delta)>.01;parent=parent.parentElement){
  const style=getComputedStyle(parent);
  if(parent.scrollHeight>parent.clientHeight&&/auto|scroll/.test(style.overflowY)){
   const before=parent.scrollTop;parent.scrollTop=Math.max(0,Math.min(parent.scrollHeight-parent.clientHeight,before+delta));delta-=parent.scrollTop-before;if(parent.scrollTop!==before)parent.dispatchEvent(new Event('scroll'));
   if(/contain|none/.test(style.overscrollBehaviorY))return;
  }
  if(parent.matches('dialog,[role="dialog"],[aria-modal="true"]'))return;
 }
}
export function bindHorizontalMediaScroll(element:HTMLElement){
 let gesture:{id:number;x:number;left:number;dragging:boolean}|null=null,suppress=false,clearClick:ReturnType<typeof setTimeout>|undefined;
 const extent=()=>Math.max(0,element.scrollWidth-element.clientWidth);
 const measure=()=>{element.dataset.grabScroll=String(extent()>1);};measure();const resize=new ResizeObserver(measure);resize.observe(element);
 const wheel=(event:WheelEvent)=>{
  if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||extent()<=1)return;
  const unit=event.deltaMode===1?(parseFloat(getComputedStyle(element).lineHeight)||24):event.deltaMode===2?element.clientWidth:1,x=event.deltaX*unit,y=event.deltaY*unit;
  if(!x&&!y)return;event.preventDefault();
  const before=Math.max(0,Math.min(extent(),element.scrollLeft));element.scrollLeft=Math.max(0,Math.min(extent(),before+horizontalWheelDelta(x,y)));
  passVertical(element,remainingVerticalWheel(x,y,element.scrollLeft-before));
 };
 const move=(event:PointerEvent)=>{
  if(!gesture||event.pointerId!==gesture.id)return;const dx=event.clientX-gesture.x;
  if(!gesture.dragging&&Math.abs(dx)<4)return;
  if(!gesture.dragging){gesture.dragging=true;suppress=true;element.dataset.dragging='true';element.setPointerCapture?.(gesture.id);}
  event.preventDefault();element.scrollLeft=Math.max(0,Math.min(extent(),gesture.left-dx));
 };
 const finish=()=>{
  const id=gesture?.id;gesture=null;delete element.dataset.dragging;
  if(id!==undefined&&element.hasPointerCapture?.(id))element.releasePointerCapture(id);
  window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);window.removeEventListener('blur',finish);
  clearTimeout(clearClick);clearClick=setTimeout(()=>{suppress=false;},0);
 };
 const down=(event:PointerEvent)=>{
  if(event.pointerType!=='mouse'||event.button!==0||extent()<=1)return;
  clearTimeout(clearClick);suppress=false;gesture={id:event.pointerId,x:event.clientX,left:element.scrollLeft,dragging:false};
  window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);window.addEventListener('blur',finish);
 };
 const click=(event:MouseEvent)=>{if(suppress){event.preventDefault();event.stopImmediatePropagation();suppress=false;}};
 const nativeDrag=(event:DragEvent)=>event.preventDefault();
 element.addEventListener('wheel',wheel,{passive:false});element.addEventListener('pointerdown',down);element.addEventListener('click',click,true);element.addEventListener('dragstart',nativeDrag);
 return()=>{finish();clearTimeout(clearClick);resize.disconnect();delete element.dataset.grabScroll;element.removeEventListener('wheel',wheel);element.removeEventListener('pointerdown',down);element.removeEventListener('click',click,true);element.removeEventListener('dragstart',nativeDrag);};
}
export function useHorizontalMediaScroll(ref:RefObject<HTMLElement|null>,enabled:boolean,count:number){useEffect(()=>{if(enabled&&ref.current)return bindHorizontalMediaScroll(ref.current);},[ref,enabled,count]);}
