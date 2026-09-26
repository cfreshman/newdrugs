import {useLayoutEffect,type RefObject} from 'react';
import {usePanelVisible} from './PanelReadiness';

export interface MenuBounds {left:number;right:number;top:number;bottom:number}
export function placeMenu(anchor:MenuBounds,size:{width:number;height:number},bounds:MenuBounds,gap=4,inset=6){
  const left=bounds.left+inset,right=Math.max(left,bounds.right-inset),top=bounds.top+inset,bottom=Math.max(top,bounds.bottom-inset);
  const width=Math.min(size.width,right-left),below=Math.max(0,bottom-anchor.bottom-gap),above=Math.max(0,anchor.top-gap-top);
  let placement:'below'|'above'|'within'=size.height<=below||below>=above?'below':'above';
  let available=placement==='below'?below:above;
  // Very short panels still need a usable menu, even if that overlaps the trigger.
  if(available<Math.min(size.height,64)){placement='within';available=bottom-top;}
  const height=Math.min(size.height,available);
  const idealTop=placement==='above'?anchor.top-gap-height:anchor.bottom+gap;
  return {left:Math.max(left,Math.min(anchor.left,right-width)),top:Math.max(top,Math.min(idealTop,bottom-height)),width,maxHeight:available,placement};
}

/** The intersection of the visual viewport and every clipping/scrolling ancestor. */
export function menuVisibleBounds(anchor:HTMLElement):MenuBounds {
  const viewport=window.visualViewport;
  const bounds={left:viewport?.offsetLeft||0,top:viewport?.offsetTop||0,right:(viewport?.offsetLeft||0)+(viewport?.width||innerWidth),bottom:(viewport?.offsetTop||0)+(viewport?.height||innerHeight)};
  for(let parent=anchor.parentElement;parent;parent=parent.parentElement){
    const css=getComputedStyle(parent),clipX=/auto|scroll|hidden|clip/.test(css.overflowX||css.overflow),clipY=/auto|scroll|hidden|clip/.test(css.overflowY||css.overflow);
    if(!clipX&&!clipY)continue;
    const box=parent.getBoundingClientRect(),left=box.left+parent.clientLeft,top=box.top+parent.clientTop;
    if(clipX){bounds.left=Math.max(bounds.left,left);bounds.right=Math.min(bounds.right,left+parent.clientWidth);}
    if(clipY){bounds.top=Math.max(bounds.top,top);bounds.bottom=Math.min(bounds.bottom,top+parent.clientHeight);}
  }
  return bounds;
}

export function useEdgeAwareMenu(ref:RefObject<HTMLDetailsElement|null>,ready:boolean){
  const visible=usePanelVisible();
  useLayoutEffect(()=>{
    const details=ref.current;if(!ready||!details)return;
    const trigger=details.querySelector('summary'),menu=details.querySelector<HTMLElement>(':scope > div');if(!trigger||!menu)return;
    if(!visible){details.open=false;return;}
    let frame=0;const minimumWidth=parseFloat(getComputedStyle(menu).minWidth)||0;
    const fit=()=>{
      if(!details.open){delete details.dataset.menuPositioned;return;}
      const bounds=menuVisibleBounds(trigger),anchor=trigger.getBoundingClientRect();
      if(anchor.right<=bounds.left||anchor.left>=bounds.right||anchor.bottom<=bounds.top||anchor.top>=bounds.bottom){details.open=false;return;}
      // Measure wrapped content at the available width before choosing a side.
      const scrollTop=menu.scrollTop,availableWidth=Math.max(0,bounds.right-bounds.left-12);
      Object.assign(menu.style,{width:'max-content',minWidth:`${Math.min(minimumWidth,availableWidth)}px`,maxWidth:`${availableWidth}px`,maxHeight:'none'});
      const size=menu.getBoundingClientRect(),position=placeMenu(anchor,size,bounds),origin=details.getBoundingClientRect();
      Object.assign(menu.style,{left:`${position.left-origin.left-details.clientLeft}px`,right:'auto',top:`${position.top-origin.top-details.clientTop}px`,bottom:'auto',width:`${position.width}px`,maxHeight:`${position.maxHeight}px`});
      menu.scrollTop=scrollTop;
      details.dataset.menuPlacement=position.placement;details.dataset.menuPositioned='true';
    };
    const schedule=(event?:Event)=>{if(event?.type==='scroll'&&event.target instanceof Node&&menu.contains(event.target))return;cancelAnimationFrame(frame);frame=requestAnimationFrame(fit);};
    const changes=new MutationObserver(fit);changes.observe(details,{attributes:true,attributeFilter:['open']});
    const resize=new ResizeObserver(()=>schedule());resize.observe(trigger);resize.observe(menu);
    for(let parent=details.parentElement;parent;parent=parent.parentElement)resize.observe(parent);
    window.addEventListener('resize',schedule);window.addEventListener('scroll',schedule,true);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
    fit();return()=>{cancelAnimationFrame(frame);changes.disconnect();resize.disconnect();window.removeEventListener('resize',schedule);window.removeEventListener('scroll',schedule,true);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule);};
  },[ref,ready,visible]);
}
