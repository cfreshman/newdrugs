import {useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {Robot,Users,Article} from '@phosphor-icons/react';
import {MODE_LABELS,modeSwitchIntersects,type AppMode} from '../shared/experience';
const modes:AppMode[]=['agent','posts','friends'];const icons={agent:Robot,friends:Users,posts:Article};
export function ModeSwitcher({mode,change,chat,chatVisible,layoutKey}:{mode:AppMode;change(mode:AppMode):void;chat:RefObject<HTMLElement|null>;chatVisible:boolean;layoutKey:string}){
 const root=useRef<HTMLElement>(null),measure=useRef<HTMLDivElement>(null),[collapsed,setCollapsed]=useState(false),[fullWidth,setFullWidth]=useState(0),[overPanel,setOverPanel]=useState(false);
 useLayoutEffect(()=>{
  let frame=0;
  const fit=()=>{
   if(!root.current||!measure.current)return;
   const width=measure.current.getBoundingClientRect().width,box=root.current.getBoundingClientRect();
   const buffer=parseFloat(getComputedStyle(root.current).getPropertyValue('--mode-switch-clearance'))||24;
   const main=document.querySelector<HTMLElement>('.social-experience:not([hidden]) .mode-main')?.getBoundingClientRect();
   // Main panels may already be lowered to avoid the switch; use their horizontal bounds to avoid a feedback loop.
   const crowded=Boolean(main&&main.width>0&&main.right>box.left&&main.left<box.left+width+buffer);
   const compact=crowded||window.matchMedia('(max-width: 760px)').matches||Boolean(chatVisible&&chat.current&&modeSwitchIntersects(chat.current.getBoundingClientRect(),box,width+buffer));
   setFullWidth(width);setCollapsed(compact);
   const visibleWidth=compact?(window.matchMedia('(max-width: 760px)').matches?136:142):width;
   const panels=document.querySelectorAll<HTMLElement>('.social-experience:not([hidden]) .mode-main,.app:not([data-mode=agent]) .workspace:not([hidden]),.app[data-mode=agent] .workspace .bubble,.app[data-mode=agent] .workspace .composer-switcher,.app[data-mode=agent] .workspace .composer-menu-layer');
   setOverPanel([...panels].some(panel=>{const style=getComputedStyle(panel);return style.visibility!=='hidden'&&style.display!=='none'&&modeSwitchIntersects(panel.getBoundingClientRect(),box,visibleWidth);}));
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(fit);};fit();
  const observer=new ResizeObserver(schedule);if(chat.current)observer.observe(chat.current);if(measure.current)observer.observe(measure.current);const main=document.querySelector<HTMLElement>('.social-experience:not([hidden]) .mode-main');if(main)observer.observe(main);
  const mutations=new MutationObserver(schedule);if(chat.current)mutations.observe(chat.current,{childList:true,subtree:true,characterData:true});
  document.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();mutations.disconnect();document.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);};
 },[chat,chatVisible,layoutKey]);
 return <><nav ref={root} className="mode-switch" aria-label="New Drugs mode" data-collapsed={collapsed||undefined} data-over-panel={overPanel||undefined} style={fullWidth?{'--mode-expanded-width':`${fullWidth}px`} as React.CSSProperties:undefined}>{modes.map(value=>{const Icon=icons[value];return <button key={value} type="button" aria-label={MODE_LABELS[value]} aria-pressed={mode===value} title={MODE_LABELS[value]} onClick={()=>change(value)}><Icon size={19} weight={mode===value?'fill':'regular'}/><span>{MODE_LABELS[value]}</span></button>;})}</nav><div className="mode-switch mode-switch-measure" ref={measure} aria-hidden="true" inert>{modes.map(value=>{const Icon=icons[value];return <span className="mode-measure-item" key={value}><Icon size={19}/><span>{MODE_LABELS[value]}</span></span>;})}</div></>;
}
