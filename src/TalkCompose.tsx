import {createContext,useContext,useState,type ReactNode} from 'react';

interface TalkComposeState {composing:boolean;setComposing(value:boolean):void}
const TalkComposeContext=createContext<TalkComposeState|null>(null);
export function TalkComposeProvider({children}:{children:ReactNode}){
 const [composing,setComposing]=useState(false);
 return <TalkComposeContext.Provider value={{composing,setComposing}}>{children}</TalkComposeContext.Provider>;
}
export const useTalkCompose=()=>useContext(TalkComposeContext);
