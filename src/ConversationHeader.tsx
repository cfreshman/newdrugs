import {createContext,useContext,useState,type ReactNode,type Dispatch,type SetStateAction} from 'react';
import {createPortal} from 'react-dom';
import {usePanelVisible} from './PanelReadiness';

const HeaderContext=createContext<{host:HTMLDivElement|null;setHost:Dispatch<SetStateAction<HTMLDivElement|null>>}|null>(null);
/** Each panel shell owns its header, including preserved Agent launcher screens. */
export function ConversationHeaderProvider({children}:{children:ReactNode}){
 const [host,setHost]=useState<HTMLDivElement|null>(null);
 return <HeaderContext.Provider value={{host,setHost}}>{children}</HeaderContext.Provider>;
}
export function ConversationHeaderHost(){
 const context=useContext(HeaderContext);
 return <div className="message-header-host" ref={context?.setHost}/>;
}
export function ConversationHeader({children}:{children:ReactNode}){
 const context=useContext(HeaderContext),visible=usePanelVisible();
 if(!visible)return null;
 return context?context.host?createPortal(children,context.host):null:<>{children}</>;
}
