import {createContext,useContext,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {usePanelVisible} from './PanelReadiness';
export const LogChromeContext=createContext<HTMLElement|null>(null);
/** Calendar controls are siblings of the scrollport, never sticky content at its end. */
export function LogFloaters({children}:{children:ReactNode}){
 const host=useContext(LogChromeContext),visible=usePanelVisible();
 if(!visible)return null;
 return host?createPortal(<div className="log-floating">{children}</div>,host):<div className="log-floating log-floating-inline">{children}</div>;
}
