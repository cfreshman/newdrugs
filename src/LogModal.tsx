import {useLayoutEffect,useRef,type ReactNode,type RefObject} from 'react';
import {PanelReadinessContext,useReadinessBoundary} from './PanelReadiness';
export function isEditableLogTarget(target:EventTarget|null){return target instanceof HTMLElement&&Boolean(target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'));}
/** Share the same anchor tracking with detail layers above the retained Log panel. */
export function observeLogLayerGeometry(dialog:HTMLElement,panel:HTMLElement,fitPanel=false){
 const outer=panel.matches('.log-modal,.composer-menu-layer')?panel:panel.closest<HTMLElement>('.social-experience')||panel,app=panel.closest('.app');
 // Top-layer absolute positioning uses document coordinates. Safari pans the
 // document for native focus, so viewport-relative rects need its scroll offset.
 const place=()=>{
  const bounds=panel.getBoundingClientRect(),mobile=window.matchMedia('(max-width:760px)').matches,vertical=fitPanel||!mobile?bounds:outer.getBoundingClientRect();if(!bounds.width||!bounds.height)return;
  // Full-height mobile entries cover the exterior top gutter too. The keyboard
  // already places the outer panel at the visible top, so retain that offset.
  const top=mobile&&!fitPanel&&outer!==panel&&!app?.hasAttribute('data-keyboard-open')?0:vertical.top,height=vertical.bottom-top;
  Object.assign(dialog.style,{position:'absolute',left:`${bounds.left+window.scrollX}px`,top:`${top+window.scrollY}px`,width:`${bounds.width}px`,height:`${height}px`,transform:'none',borderRadius:getComputedStyle(panel).borderRadius});dialog.style.setProperty('--log-layer-height',`${height}px`);
 };
 place();const observer=new ResizeObserver(place);observer.observe(panel);if(outer!==panel)observer.observe(outer);
 const layout=new MutationObserver(place),frame=panel.closest('.mode-main');
 if(app)layout.observe(app,{attributes:true,attributeFilter:['data-agent-dock','data-mode','data-standalone','data-keyboard-open','data-panel-below-controls','style']});
 layout.observe(panel,{attributes:true,attributeFilter:['style']});
 if(frame&&frame!==panel)layout.observe(frame,{attributes:true,attributeFilter:['style']});
 window.addEventListener('resize',place);
 window.addEventListener('scroll',place);
 return()=>{observer.disconnect();layout.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',place);};
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
