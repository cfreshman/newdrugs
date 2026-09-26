import {useLayoutEffect,useRef,useState} from 'react';
import {Robot} from '@phosphor-icons/react';
import type {AppMode} from '../shared/experience';

/** Keep its box measurable while hidden so overlap cannot make it flicker. */
export function AgentDockToggle({mode,busy,open}:{mode:AppMode;busy:boolean;open():void}){
 const button=useRef<HTMLButtonElement>(null),[covered,setCovered]=useState(false);
 useLayoutEffect(()=>{
  const node=button.current,panel=node?.closest('.app')?.querySelector<HTMLElement>('.social-experience:not([hidden]) .mode-main');
  if(!node||!panel)return;
  const fit=()=>{const a=node.getBoundingClientRect(),b=panel.getBoundingClientRect();setCovered(Boolean(a.width&&b.width&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top));};
  fit();const observer=new ResizeObserver(fit);observer.observe(node);observer.observe(panel);
  window.addEventListener('resize',fit);window.visualViewport?.addEventListener('resize',fit);window.visualViewport?.addEventListener('scroll',fit);
  return()=>{observer.disconnect();window.removeEventListener('resize',fit);window.visualViewport?.removeEventListener('resize',fit);window.visualViewport?.removeEventListener('scroll',fit);};
 },[mode]);
 return <button ref={button} className="agent-dock-toggle" data-overlaps-panel={covered||undefined} aria-hidden={covered||undefined} tabIndex={covered?-1:undefined} onClick={open}><Robot size={23}/><span>Agent</span>{busy&&<span className="dock-working" aria-label="Agent is working"/>}</button>;
}
