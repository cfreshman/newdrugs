import {useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {holdConversationScroll} from './useConversationScroll';

export function messagePreviewHeight(node:Element,assistant:boolean){
  const multiplier=assistant&&window.matchMedia('(min-width: 640px)').matches?2:1;
  return (parseFloat(getComputedStyle(node).getPropertyValue('--message-preview'))||256)*multiplier;
}

/** Shared Wayfinder expansion anchoring for text and executable displays. */
export function useMessageExpansion({wrapper,scrollRef,reveal=false}:{wrapper:RefObject<HTMLElement|null>;scrollRef:RefObject<HTMLDivElement|null>;reveal?:boolean}){
  const [expanded,setExpanded]=useState(false);
  const pendingScroll=useRef<{top:number;bottom:number|null}|null>(null);
  useLayoutEffect(()=>{if(reveal)setExpanded(true);},[reveal]);
  useLayoutEffect(()=>{
    const anchor=pendingScroll.current,scroller=scrollRef.current,message=wrapper.current;
    if(!anchor||!scroller||!message)return;
    scroller.scrollTop=anchor.bottom===null?anchor.top:Math.max(0,scroller.scrollTop+message.getBoundingClientRect().bottom-anchor.bottom);
    pendingScroll.current=null;
  },[expanded,scrollRef,wrapper]);
  const toggle=()=>{
    const scroller=scrollRef.current,message=wrapper.current;
    if(scroller&&message){holdConversationScroll(scroller);pendingScroll.current={top:scroller.scrollTop,bottom:expanded?message.getBoundingClientRect().bottom:null};}
    setExpanded(value=>!value);
  };
  return {expanded,setExpanded,toggle};
}
