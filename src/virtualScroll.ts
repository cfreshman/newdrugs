import {observeElementOffset,type Virtualizer} from '@tanstack/react-virtual';

/** Hidden preserved panels keep their last viewport and scroll anchor. */
export function observeVisibleElementRect<T extends HTMLElement>(instance:Virtualizer<T,Element>,callback:(rect:{width:number;height:number})=>void){
 const node=instance.scrollElement;if(!node)return;
 const measure=()=>{if(node.clientWidth&&node.clientHeight)callback({width:node.clientWidth,height:node.clientHeight});};
 measure();const observer=new ResizeObserver(measure);observer.observe(node);return()=>observer.disconnect();
}

/** Browsers report a hidden scrollport at zero even while retaining its position. */
export function observeVisibleElementOffset<T extends HTMLElement>(instance:Virtualizer<T,Element>,callback:(offset:number,isScrolling:boolean)=>void){
 const node=instance.scrollElement;if(!node)return;
 const publish=(offset:number,isScrolling:boolean)=>{if(node.clientWidth&&node.clientHeight)callback(offset,isScrolling);};
 const stop=observeElementOffset(instance,publish),observer=new ResizeObserver(()=>publish(instance.options.horizontal?node.scrollLeft*(instance.options.isRtl?-1:1):node.scrollTop,false));
 observer.observe(node);return()=>{stop?.();observer.disconnect();};
}
