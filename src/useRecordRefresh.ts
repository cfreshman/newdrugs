import {useEffect,useRef} from 'react';
import {usePanelVisible} from './PanelReadiness';
import {observeRecordInterests} from './recordInterests';
import type {RecordInvalidation} from '../shared/liveState';
export function useRecordRefreshDetails(keys:string[],refresh:(change?:RecordInvalidation)=>void|Promise<void>){
 const latest=useRef(refresh);latest.current=refresh;const visible=usePanelVisible(),isVisible=useRef(visible),wasVisible=useRef(visible);isVisible.current=visible;
 const scope=keys.join(','),pending=useRef<RecordInvalidation|null>(null);
 useEffect(()=>{if(visible)return observeRecordInterests(scope.split(','));},[scope,visible]);
 useEffect(()=>{if(visible&&!wasVisible.current&&pending.current){const change=pending.current;pending.current=null;void latest.current(change);}wasVisible.current=visible;},[visible]);
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  const invalidate=(event:Event)=>{if(!(event instanceof CustomEvent))return;const change:RecordInvalidation=Array.isArray(event.detail)?{keys:event.detail}:event.detail;if(!change?.keys?.some((key:string)=>scope.split(',').includes(key)))return;
   const previous=pending.current;pending.current={keys:[...new Set([...(previous?.keys||[]),...change.keys])],...(previous?.log&&change.log&&previous.log.length+change.log.length<=128?{log:[...previous.log,...change.log]}:!previous&&change.log?{log:change.log}:{})};
   clearTimeout(timer);if(isVisible.current)timer=setTimeout(()=>{const update=pending.current;pending.current=null;void latest.current(update||undefined);},75);
  };
  window.addEventListener('newdrugs:records',invalidate);return()=>{clearTimeout(timer);window.removeEventListener('newdrugs:records',invalidate);};
 },[scope]);
}

export function useRecordRefresh(keys:string[],refresh:()=>void|Promise<void>){useRecordRefreshDetails(keys,()=>refresh());}
