import {useLayoutEffect,useRef,type ReactNode,type RefObject} from 'react';
import {PanelReadinessContext,useReadinessBoundary} from './PanelReadiness';
/** A nonblocking top-layer panel escapes clipping while leaving the side agent usable. */
export function LogModal({active,close,children,anchor,closeLabel='Close'}:{closeLabel?:string;active:boolean;close():void;children:ReactNode;anchor:RefObject<HTMLElement|null>}){
 const {readiness,loading}=useReadinessBoundary();
 const ref=useRef<HTMLDivElement>(null),opened=useRef(false);
 useLayoutEffect(()=>{const dialog=ref.current,panel=anchor.current;if(!active||!dialog||!panel)return;
  const outer=panel.closest<HTMLElement>('.social-experience')||panel;
  const place=()=>{const bounds=panel.getBoundingClientRect(),standalone=panel.closest<HTMLElement>('.app')?.dataset.standalone==='true'&&window.matchMedia('(max-width:760px), (pointer:coarse)').matches,vertical=standalone?bounds:outer.getBoundingClientRect();if(!bounds.width||!bounds.height)return;Object.assign(dialog.style,{left:`${bounds.left}px`,top:`${vertical.top}px`,width:`${bounds.width}px`,height:`${vertical.height}px`,transform:'none',borderRadius:getComputedStyle(panel).borderRadius});};
  place();const observer=new ResizeObserver(place);observer.observe(panel);if(outer!==panel)observer.observe(outer);window.addEventListener('resize',place);window.visualViewport?.addEventListener('resize',place);window.visualViewport?.addEventListener('scroll',place);
  return()=>{observer.disconnect();window.removeEventListener('resize',place);window.visualViewport?.removeEventListener('resize',place);window.visualViewport?.removeEventListener('scroll',place);};
 },[active,anchor]);
 useLayoutEffect(()=>{const panel=ref.current;if(!panel)return;if(active&&!opened.current){panel.showPopover?.();opened.current=true;}else if(!active&&opened.current){panel.hidePopover?.();opened.current=false;}},[active]);
 return <div ref={ref} popover="manual" role="dialog" className="log-modal" data-open={active||undefined} aria-label="Log" data-loading={loading||undefined} aria-busy={loading} onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();close();}}}><PanelReadinessContext.Provider value={readiness}>{children}</PanelReadinessContext.Provider>{loading&&<footer className="log-loading-footer panel-actions"><button onClick={close}>{closeLabel}</button></footer>}</div>;
}
export function isLogModalKey(key:string){const [view,id]=JSON.parse(key);return view==='log'?Boolean(id):['log_people','log_birthdays','log_anniversaries','log_settings','log_compose','log_code','log_scan','log_join'].includes(view);}
