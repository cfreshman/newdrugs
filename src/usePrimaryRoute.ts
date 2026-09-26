import {useEffect, useLayoutEffect, useRef} from 'react';
import {destinationPath, parseDestination, type Destination} from '../shared/navigation';
import type {PanelLocation} from './panelHistory';
import type {AppMode} from '../shared/experience';

export interface BrowserPanelState {tab:string; stack:Destination[]}
export interface PrimaryRouteState {destination:Destination; browser?:BrowserPanelState; panels?:PanelLocation[]}
/** One history entry per settled navigation, including a restorable in-app Back stack. */
export function usePrimaryRoute(enabled:boolean, mode:AppMode, state:PrimaryRouteState, restore:(state:PrimaryRouteState)=>void) {
  const ready=useRef(false), replace=useRef(true), apply=useRef(restore);
  apply.current=restore;
  const destination={...state.destination,mode};
  const path=destinationPath(destination), serialized=JSON.stringify({...state,destination});
  useEffect(()=>{
    if(!enabled)return;
    const pop=(event:PopStateEvent)=>{
      const destination=parseDestination(location.href,location.origin);if(!destination)return;
      replace.current=true;
      const saved=event.state?.newdrugs;
      // Never trust history state in place of the validated visible URL.
      const matches=saved?.destination&&destinationPath(saved.destination)===destinationPath(destination);
      apply.current({destination,...(matches?{browser:saved.browser,panels:saved.panels}: {})});
    };
    window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);
  },[enabled]);
  useLayoutEffect(()=>{
    if(!enabled)return;
    const frame=requestAnimationFrame(()=>{
      const payload={...(history.state||{}),newdrugs:JSON.parse(serialized)};
      if(!ready.current||replace.current||location.pathname+location.search===path)history.replaceState(payload,'',path);
      else history.pushState(payload,'',path);
      ready.current=true;replace.current=false;
    });
    return()=>cancelAnimationFrame(frame);
  },[enabled,path,serialized]);
}
