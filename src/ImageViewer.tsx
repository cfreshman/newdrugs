import {useLayoutEffect,useRef,useState} from 'react';
import {CircleNotch,X} from '@phosphor-icons/react';
import PhotoSwipe from 'photoswipe';
import type {SlideData} from 'photoswipe';
import type {MediaItem} from './ExperienceContext';
import loadingIcon from '@phosphor-icons/core/assets/regular/circle-notch.svg?raw';
import closeIcon from '@phosphor-icons/core/assets/regular/x.svg?raw';
import previousIcon from '@phosphor-icons/core/assets/regular/arrow-left.svg?raw';
import nextIcon from '@phosphor-icons/core/assets/regular/arrow-right.svg?raw';
import zoomIcon from '@phosphor-icons/core/assets/regular/magnifying-glass-plus.svg?raw';
import zoomOutIcon from '@phosphor-icons/core/assets/regular/magnifying-glass-minus.svg?raw';
import 'photoswipe/style.css';
import './imageViewer.css';

/** Use actual image dimensions. Never invent an aspect ratio for pan bounds. */
export function imageDimensions(item:MediaItem,signal:AbortSignal):Promise<{width:number;height:number}|null>{
 if(item.width&&item.height)return Promise.resolve({width:item.width,height:item.height});
 return new Promise(resolve=>{
  const img=new Image();let finished=false;
  const finish=(value:{width:number;height:number}|null)=>{if(finished)return;finished=true;clearTimeout(timer);signal.removeEventListener('abort',abort);img.onload=null;img.onerror=null;resolve(value);};
  const abort=()=>{finish(null);img.src='';};
  const timer=setTimeout(()=>finish(null),15000);
  img.onload=()=>finish(img.naturalWidth&&img.naturalHeight?{width:img.naturalWidth,height:img.naturalHeight}:null);
  img.onerror=()=>finish(null);signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();else img.src=item.url;
 });
}
export function fittedImageZoom(level:{panAreaSize:{x:number;y:number}|null;elementSize:{x:number;y:number}|null}){
 const area=level.panAreaSize,image=level.elementSize;
 return area&&image&&image.x>0&&image.y>0?Math.min(area.x/image.x,area.y/image.y):1;
}
const icon=(svg:string)=>svg.replace('<svg ','<svg aria-hidden="true" class="nd-viewer-icon" ');

export function ImageViewer({items,index,close}:{items:MediaItem[];index:number;close():void}){
 const closeRef=useRef(close);closeRef.current=close;
 const [loading,setLoading]=useState(true),[failed,setFailed]=useState(false);
 const dismiss=useRef<HTMLButtonElement>(null),layer=useRef<HTMLDialogElement>(null),viewerRef=useRef<PhotoSwipe|null>(null);
 const requestClose=()=>{if(viewerRef.current)viewerRef.current.close();else closeRef.current();};
 // Enter the top layer before any async image/library loading. Keep the source
 // hangout's popover in place below this dialog throughout open and close.
 useLayoutEffect(()=>{const dialog=layer.current;if(!dialog)return;dialog.showModal();return()=>dialog.close();},[]);
 useLayoutEffect(()=>{
  const controller=new AbortController();let viewer:PhotoSwipe|undefined;
  const sourceFocus=items[index]?.element;
  dismiss.current?.focus({preventScroll:true});
  const resize=()=>viewer?.updateSize(true);
  const dimensions:Array<{width:number;height:number}|null|undefined>=items.map(item=>item.width&&item.height?{width:item.width,height:item.height}:undefined);
  let dataSource:SlideData[]=[];
  const viewport=()=>({x:document.documentElement.clientWidth||window.innerWidth,y:window.innerHeight});
  const slide=(i:number):SlideData=>dimensions[i]?{src:items[i].url,msrc:items[i].previewUrl||items[i].url,alt:items[i].name,...dimensions[i],element:items[i].element}:{width:viewport().x,height:viewport().y,html:dimensions[i]===null?'<p class="image-viewer-error">Photo unavailable</p>':`<div class="image-viewer-pending"><span class="image-viewer-spinner" role="status" aria-label="Loading photo">${icon(loadingIcon)}</span></div>`};
  const load=()=>{
   try{
    dataSource=items.map((_,i)=>slide(i));
    viewer=new PhotoSwipe({
     dataSource,appendToEl:layer.current!,
     index,mainClass:'newdrugs-image-viewer',bgOpacity:1,loop:false,preloaderDelay:500,
     initialZoomLevel:fittedImageZoom,secondaryZoomLevel:level=>fittedImageZoom(level)*2.5,maxZoomLevel:level=>fittedImageZoom(level)*6,
     allowPanToNext:false,pinchToClose:false,closeOnVerticalDrag:false,
     tapAction:function(this:PhotoSwipe,_point,event){if((event.target as Element).closest('.pswp__img'))this.element?.classList.toggle('pswp--ui-visible');else this.close();},doubleTapAction:function(this:PhotoSwipe,point,event){if((event.target as Element).closest('.pswp__img'))this.currSlide?.toggleZoom(point);else this.close();},imageClickAction:'zoom',bgClickAction:'close',
     wheelToZoom:false,showHideAnimationType:'fade',showAnimationDuration:160,hideAnimationDuration:140,
     trapFocus:true,returnFocus:false,escKey:true,arrowKeys:true,
     closeTitle:'Close image viewer',zoomTitle:'Zoom image',arrowPrevTitle:'Previous photo',arrowNextTitle:'Next photo',
     closeSVG:icon(closeIcon),arrowPrevSVG:icon(previousIcon),arrowNextSVG:icon(nextIcon),
     zoomSVG:`<span class="viewer-zoom-in">${icon(zoomIcon)}</span><span class="viewer-zoom-out">${icon(zoomOutIcon)}</span>`,
     errorMsg:'Photo unavailable',
     getViewportSizeFn:viewport,
    });
    // Keep New Drugs animation settings after the library prepares its defaults.
    viewer.options.showHideAnimationType='fade';
    viewer.options.zoomAnimationDuration=240;
    viewer.on('zoomLevelsUpdate',({zoomLevels})=>{zoomLevels.min=zoomLevels.initial;});
    viewer.on('destroy',()=>{if(!controller.signal.aborted)closeRef.current();});
    viewer.on('afterInit',()=>{viewer?.element?.removeAttribute('role');setLoading(false);});
    viewerRef.current=viewer;
    viewer.init();
    // Populate unfinished images afterward. Known dimensions/decoded previews
    // already render immediately and must not be refreshed during the opening.
    items.forEach((item,i)=>{if(dimensions[i])return;void imageDimensions(item,controller.signal).then(value=>{if(controller.signal.aborted||!viewer)return;dimensions[i]=value;dataSource[i]=slide(i);viewer.refreshSlideContent(i);});});
   }catch(error){if(!controller.signal.aborted){console.error('Image viewer:',error);viewerRef.current=null;setFailed(true);setLoading(false);}}
  };
  load();window.addEventListener('resize',resize);
  return()=>{controller.abort();window.removeEventListener('resize',resize);viewerRef.current=null;viewer?.destroy();requestAnimationFrame(()=>{if(sourceFocus?.isConnected&&!sourceFocus.closest('[inert]'))sourceFocus.focus({preventScroll:true});});};
 },[items,index]);
 return <dialog ref={layer} className="image-viewer-layer" aria-label="Photos" onCancel={event=>{event.preventDefault();requestClose();}}>{(loading||failed)&&<div className="image-viewer-loading"><button ref={dismiss} aria-label="Close image viewer" onClick={requestClose}><X size={23}/></button>{failed?<a href={items[index]?.url} target="_blank" rel="noopener noreferrer">Open photo</a>:<CircleNotch size={28} className="image-viewer-spinner" aria-label="Loading photo"/>}</div>}</dialog>;
}
