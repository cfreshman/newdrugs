import {useLayoutEffect,useRef,type ReactNode,type RefObject} from 'react';
import {PanelReadinessContext,useReadinessBoundary} from './PanelReadiness';
export function isEditableLogTarget(target:EventTarget|null){return target instanceof HTMLElement&&Boolean(target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'));}
/** Share the same anchor tracking with detail layers above the retained Log panel. */
export function observeLogLayerGeometry(dialog:HTMLElement,panel:HTMLElement,fitPanel=false){
 const outer=panel.matches('.log-modal,.composer-menu-layer')?panel:panel.closest<HTMLElement>('.social-experience')||panel;
 const place=()=>{const bounds=panel.getBoundingClientRect(),standalone=panel.closest<HTMLElement>('.app')?.dataset.standalone==='true'&&window.matchMedia('(max-width:760px), (pointer:coarse)').matches,vertical=fitPanel||standalone?bounds:outer.getBoundingClientRect();if(!bounds.width||!bounds.height)return;Object.assign(dialog.style,{left:`${bounds.left}px`,top:`${vertical.top}px`,width:`${bounds.width}px`,height:`${vertical.height}px`,transform:'none',borderRadius:getComputedStyle(panel).borderRadius});dialog.style.setProperty('--log-layer-height',`${vertical.height}px`);};
 place();const observer=new ResizeObserver(place);observer.observe(panel);if(outer!==panel)observer.observe(outer);
 const layout=new MutationObserver(place),app=panel.closest('.app');
 if(app)layout.observe(app,{attributes:true,attributeFilter:['data-agent-dock','data-mode','data-standalone']});
 layout.observe(panel,{attributes:true,attributeFilter:['style']});
 window.addEventListener('resize',place);
 return()=>{observer.disconnect();layout.disconnect();window.removeEventListener('resize',place);};
}
/** A nonblocking top-layer panel escapes clipping while leaving the side agent usable. */
export function LogModal({active,close,children,anchor,closeLabel='Close'}:{closeLabel?:string;active:boolean;close():void;children:ReactNode;anchor:RefObject<HTMLElement|null>}){
 const {readiness,loading}=useReadinessBoundary();
 const ref=useRef<HTMLDivElement>(null),opened=useRef(false);
 useLayoutEffect(()=>{const dialog=ref.current,panel=anchor.current||dialog?.closest<HTMLElement>('.mode-main');if(!active||!dialog||!panel)return;
  return observeLogLayerGeometry(dialog,panel);
 },[active,anchor]);
 useLayoutEffect(()=>{const panel=ref.current;if(!panel)return;if(active&&!opened.current){panel.showPopover?.();opened.current=true;}else if(!active&&opened.current){panel.hidePopover?.();opened.current=false;}},[active]);
 return <div ref={ref} popover="manual" role="dialog" className="log-modal" data-open={active||undefined} aria-label="Log" data-loading={loading||undefined} aria-busy={loading} onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented&&!isEditableLogTarget(event.target)){event.preventDefault();event.stopPropagation();close();}}}><PanelReadinessContext.Provider value={readiness}>{children}</PanelReadinessContext.Provider>{loading&&<footer className="log-loading-footer panel-actions"><button onClick={close}>{closeLabel}</button></footer>}</div>;
}
export function isLogModalKey(key:string){const [view,id]=JSON.parse(key);return view==='log'?Boolean(id):['log_people','log_birthdays','log_anniversaries','log_settings','log_compose','log_code','log_scan','log_join'].includes(view);}
