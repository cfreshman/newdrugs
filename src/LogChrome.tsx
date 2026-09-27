import {createContext,useContext,useRef,useLayoutEffect,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {usePanelVisible} from './PanelReadiness';
export const LogHeaderContext=createContext<HTMLElement|null>(null);
export const LogChromeContext=createContext<HTMLElement|null>(null);
/** Calendar controls are siblings of the scrollport, never sticky content at its end. */
export function LogFloaters({children}:{children:ReactNode}){
 const host=useContext(LogChromeContext),visible=usePanelVisible(),ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{const floating=ref.current,frame=host?.closest<HTMLElement>('.mode-main');if(!visible||!floating||!frame)return;const measure=()=>frame.style.setProperty('--log-bottom-clearance',`${Math.ceil(floating.getBoundingClientRect().height+(parseFloat(getComputedStyle(floating).bottom)||0)+12)}px`);measure();const observer=new ResizeObserver(measure);observer.observe(floating);observer.observe(frame);return()=>{observer.disconnect();};},[host,visible]);
 if(!visible)return null;
 return host?createPortal(<div ref={ref} className="log-floating">{children}</div>,host):<div ref={ref} className="log-floating log-floating-inline">{children}</div>;
}

export function LogCalendarHeader({children}:{children:ReactNode}){
 const host=useContext(LogHeaderContext),visible=usePanelVisible(),ref=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{const header=ref.current;if(!host||!visible||!header)return;const measure=()=>host.style.setProperty('--log-header-height',`${header.getBoundingClientRect().height}px`);measure();const observer=new ResizeObserver(measure);observer.observe(header);return()=>observer.disconnect();},[host,visible]);
 if(!host)return <>{children}</>;
 return visible?createPortal(<div ref={ref} className="log-fixed-weekdays">{children}</div>,host):null;
}
