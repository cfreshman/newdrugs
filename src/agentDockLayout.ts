import {useLayoutEffect,useRef,useState,type RefObject} from 'react';

type BrowserLayout={available:boolean;belowControls:boolean};
function measureLayout(root:HTMLElement|null):BrowserLayout{
 const css=getComputedStyle(root||document.documentElement),value=(name:string,fallback:number)=>parseFloat(css.getPropertyValue(name))||fallback;
 const width=innerWidth,gutter=value('--mode-gutter',12),sidebar=value('--mode-sidebar',width<=1200?172:184),gap=value('--mode-gap',20),minimum=value('--mode-min-width',520);
 const fine=!window.matchMedia('(pointer: coarse)').matches;
 const dockSpace=value('--agent-min-width',320)+value('--agent-dock-gap',16)+value('--agent-dock-gutter',12)-gutter-gap;
 const withDock=width-2*gutter-sidebar-2*gap-dockSpace;
 return {available:width>760&&fine&&withDock>=minimum,belowControls:width>760&&withDock<minimum};
}
export const agentDockAvailable=()=>measureLayout(document.querySelector('.app')).available;
/** Use the original column budget so collapsing cannot trigger an expand/collapse loop. */
export function useAgentDockAvailability(root:RefObject<HTMLElement|null>,changed:(available:boolean)=>void){
 const [layout,setLayout]=useState(()=>measureLayout(root.current)),current=useRef(layout),callback=useRef(changed);callback.current=changed;
 useLayoutEffect(()=>{
  const pointer=window.matchMedia('(pointer: coarse)');
  const update=()=>{const next=measureLayout(root.current),previous=current.current;if(next.available===previous.available&&next.belowControls===previous.belowControls)return;if(next.available!==previous.available)callback.current(next.available);current.current=next;setLayout(next);};
  update();window.addEventListener('resize',update);pointer.addEventListener('change',update);
  return()=>{window.removeEventListener('resize',update);pointer.removeEventListener('change',update);};
 },[root]);
 return layout;
}
