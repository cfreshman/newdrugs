import {useEffect,useLayoutEffect,useMemo,useRef,useState,type PointerEvent,type RefObject,type ReactNode} from 'react';
import {CircleNotch} from '@phosphor-icons/react';
import type {Destination} from '../shared/navigation';
import type {MediaItem} from './ExperienceContext';
import {loadedPhotoPreview} from './PostPhotos';
import {logImageUrl} from './logImageCache';
import {isEditableLogTarget,observeLogLayerGeometry} from './LogModal';
import {logMediaEntries,logImageBase,boundLogImage,pinchLogImage,type LogMediaSource,type LogMediaEntry,type LogImageSize,type LogImageTransform} from './logMediaDetailModel';
import {AgentMarkdown} from './AgentMarkdown';
import {AudioPlayer} from './AudioPlayer';
import {NavLink} from './NavLink';
import {useHorizontalSwipe,consumeSwipeClick} from './useHorizontalSwipe';

interface Selection {entryId:string;key:string;preview?:MediaItem;element?:HTMLElement}
type Navigate=(destination:Destination)=>void;

export function useLogMediaDetail(source:LogMediaSource|null,active:boolean,navigate:Navigate,closeSource:()=>void){
 const anchor=useRef<HTMLElement>(null),[selection,setSelection]=useState<Selection|null>(null);
 const entries=useMemo(()=>source?logMediaEntries(source):[],[source?.contributors,source?.coverId]);
 const photo=(items:MediaItem[],index:number)=>{const item=items[index];if(source&&item)setSelection({entryId:source.id,key:item.id,preview:item,element:item.element});};
 const note=(userId:string,element:HTMLElement)=>{
  const item=entries.find(item=>item.contributor.userId===userId);if(!source||!item)return;
  const thumbnail=[...anchor.current?.querySelectorAll<HTMLAnchorElement>('a[data-photo-id]')||[]].find(link=>link.dataset.photoId===item.file?.id),image=thumbnail?.querySelector('img');
  setSelection({entryId:source.id,key:item.key,element,...(item.file&&image?{preview:{id:item.file.id,url:item.file.url,name:item.file.name,previewUrl:loadedPhotoPreview(image),width:image.naturalWidth,height:image.naturalHeight}}:{})});
 };
 const open=Boolean(source&&selection?.entryId===source.id);
 const detail=open&&source&&selection?<LogMediaDetail source={source} entries={entries} selection={selection} select={setSelection} active={active} anchor={anchor} navigate={navigate} back={()=>setSelection(null)} close={()=>{setSelection(null);closeSource();}}/>:null;
 return {anchor,photo,note,open,detail};
}

function LogDetailImage({file,preview,previous,next,zoom}:{file:NonNullable<LogMediaEntry['file']>;preview?:MediaItem;previous():void;next():void;zoom(scale:number):void}){
 const frame=useRef<HTMLDivElement>(null),imageRef=useRef<HTMLImageElement>(null),points=useRef(new Map<number,{x:number;y:number}>());
 const [size,setSize]=useState<LogImageSize>({width:preview?.width||0,height:preview?.height||0}),[loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false),[transform,setTransform]=useState<LogImageTransform>(logImageBase);
 const current=useRef(transform);current.current=transform;
 const pinched=useRef(false),swipe=useRef<{x:number;y:number;time:number}|null>(null);
 const update=(value:LogImageTransform)=>{current.current=value;setTransform(value);zoom(value.scale);};
 const dimensions=()=>{const rect=frame.current!.getBoundingClientRect();return {width:rect.width,height:rect.height};};
 useLayoutEffect(()=>{
  const node=frame.current!;const resize=()=>update(boundLogImage(current.current,size,dimensions()));
  const observer=new ResizeObserver(resize);observer.observe(node);return()=>observer.disconnect();
 },[size]);
 useEffect(()=>{
  const node=frame.current!;const wheel=(event:WheelEvent)=>{
   if(!event.ctrlKey||!size.width||!size.height)return;event.preventDefault();event.stopPropagation();
   const rect=node.getBoundingClientRect(),point={x:event.clientX-rect.left-rect.width/2,y:event.clientY-rect.top-rect.height/2};
   update(pinchLogImage(current.current,current.current.scale*Math.exp(-event.deltaY*.01),point,point,size,{width:rect.width,height:rect.height}));
  };node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel);
 },[size]);
 const down=(event:PointerEvent<HTMLDivElement>)=>{
  event.stopPropagation();if(event.pointerType==='mouse'&&event.button!==0||points.current.size>=2)return;
  points.current.set(event.pointerId,{x:event.clientX,y:event.clientY});event.currentTarget.setPointerCapture?.(event.pointerId);
  if(points.current.size===1){pinched.current=false;swipe.current={x:event.clientX,y:event.clientY,time:Date.now()};}else{pinched.current=true;swipe.current=null;}
 };
 const move=(event:PointerEvent<HTMLDivElement>)=>{
  event.stopPropagation();if(!points.current.has(event.pointerId))return;
  const before=[...points.current.values()];points.current.set(event.pointerId,{x:event.clientX,y:event.clientY});const after=[...points.current.values()];
  if(!size.width||!size.height)return;
  const rect=event.currentTarget.getBoundingClientRect(),bounds={width:rect.width,height:rect.height};
  if(after.length===2){
   const distance=(points:{x:number;y:number}[])=>Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y);
   const middle=(points:{x:number;y:number}[])=>({x:(points[0].x+points[1].x)/2-rect.left-rect.width/2,y:(points[0].y+points[1].y)/2-rect.top-rect.height/2});
   const start=distance(before);if(start>0)update(pinchLogImage(current.current,current.current.scale*distance(after)/start,middle(before),middle(after),size,bounds));
  }else if(current.current.scale>1)update(boundLogImage({...current.current,x:current.current.x+after[0].x-before[0].x,y:current.current.y+after[0].y-before[0].y},size,bounds));
 };
 const finish=(event:PointerEvent<HTMLDivElement>,cancelled=false)=>{
  event.stopPropagation();if(!points.current.has(event.pointerId))return;points.current.delete(event.pointerId);
  const start=swipe.current;swipe.current=null;
  if(!cancelled&&!pinched.current&&!points.current.size&&current.current.scale===1&&start&&Date.now()-start.time<700){const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy)*1.5){consumeSwipeClick(event.currentTarget);if(dx>0)previous();else next();}}
 };
 const ready=(image:HTMLImageElement)=>{if(!image.naturalWidth||!image.naturalHeight)return;setSize({width:image.naturalWidth,height:image.naturalHeight});setLoaded(true);setFailed(false);};
 useLayoutEffect(()=>{if(imageRef.current?.complete)ready(imageRef.current);},[]);
 const style={transform:`translate(${transform.x}px,${transform.y}px) scale(${transform.scale})`};
 return <div ref={frame} className="log-media-detail-visual log-media-detail-image" data-zoomed={transform.scale>1||undefined} data-scale={transform.scale} role="group" aria-label="Photo. Pinch to zoom and drag to move." tabIndex={0} onPointerDown={down} onPointerMove={move} onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)} onLostPointerCapture={event=>finish(event,true)} onDoubleClick={event=>{event.preventDefault();event.stopPropagation();const rect=event.currentTarget.getBoundingClientRect(),point={x:event.clientX-rect.left-rect.width/2,y:event.clientY-rect.top-rect.height/2};update(pinchLogImage(current.current,current.current.scale>1?1:2.5,point,point,size,dimensions()));}} onKeyDown={event=>{
  if(event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||current.current.scale===1)return;
  const direction=({ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]} as Record<string,number[]>)[event.key];if(!direction)return;event.preventDefault();event.stopPropagation();update(boundLogImage({...current.current,x:current.current.x-direction[0]*30,y:current.current.y-direction[1]*30},size,dimensions()));
 }}>
  {!loaded&&preview?.previewUrl&&<img className="log-media-detail-preview" src={preview.previewUrl} alt="" aria-hidden="true" draggable={false} style={style}/>}
  <img ref={imageRef} src={logImageUrl(file.url)} alt={file.name} draggable={false} style={{...style,visibility:loaded?'visible':'hidden'}} onLoad={event=>ready(event.currentTarget)} onError={()=>{setFailed(true);setLoaded(false);}}/>
  {!loaded&&!failed&&<span className="log-media-loading" role="status" aria-label="Loading photo"><CircleNotch className="spin" size={26}/></span>}
  {failed&&<p className="quiet" role="status">Photo unavailable</p>}
 </div>;
}

function LogDetailVideo({file,active}:{file:NonNullable<LogMediaEntry['file']>;active:boolean}){
 const ref=useRef<HTMLVideoElement>(null),[loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false);
 useEffect(()=>{const node=ref.current;if(!active)node?.pause();return()=>node?.pause();},[active]);
 return <div className="log-media-detail-visual"><video ref={ref} src={file.url} controls playsInline muted loop autoPlay={active} preload={active?'metadata':'none'} onLoadedData={()=>setLoaded(true)} onError={()=>setFailed(true)}/>{!loaded&&!failed&&<span className="log-media-loading" role="status" aria-label="Loading video"><CircleNotch className="spin" size={26}/></span>}{failed&&<p className="quiet" role="status">Video unavailable</p>}</div>;
}

export function LogMediaDetail({source,entries,selection,select,active,anchor,navigate,back,close}:{source:LogMediaSource;entries:LogMediaEntry[];selection:Selection;select(selection:Selection):void;active:boolean;anchor:RefObject<HTMLElement|null>;navigate:Navigate;back():void;close():void}){
 const layer=useRef<HTMLDialogElement>(null),dismiss=useRef<HTMLButtonElement>(null),sourceFocus=useRef(selection.element);
 const zoomed=useRef(false);
 useLayoutEffect(()=>{zoomed.current=false;},[selection.key]);
 const index=entries.findIndex(item=>item.key===selection.key),item=entries[index];
 const previous=index>0,next=index>=0&&index<entries.length-1;
 const go=(direction:number)=>{const target=entries[index+direction];if(!target)return;const thumbnail=[...anchor.current?.querySelectorAll<HTMLAnchorElement>('a[data-photo-id]')||[]].find(link=>link.dataset.photoId===target.file?.id),image=thumbnail?.querySelector('img');select({...selection,key:target.key,preview:target.file&&image?{id:target.file.id,url:target.file.url,name:target.file.name,width:image.naturalWidth,height:image.naturalHeight,previewUrl:loadedPhotoPreview(image)}:undefined});};
 const swipe=useHorizontalSwipe({active,threshold:40,ratio:1.5,canSwipe:()=>!zoomed.current,ignore:'a,button,input,textarea,select,video,audio,iframe,[contenteditable],.log-media-detail-image',swipe:direction=>{if(direction<0&&previous)go(-1);else if(direction>0&&next)go(1);}});
 useLayoutEffect(()=>{const dialog=layer.current,panel=anchor.current?.closest<HTMLElement>('.log-modal,.mode-main,.composer-menu-layer')||anchor.current;if(active&&dialog&&panel)return observeLogLayerGeometry(dialog,panel);},[active,anchor]);
 useLayoutEffect(()=>{
  const dialog=layer.current;if(!dialog)return;let cancelled=false;
  // A child must enter after its retained ancestor reopens, so it stays above it.
  if(active)queueMicrotask(()=>{if(cancelled||!dialog.isConnected)return;dialog.showPopover?.();dismiss.current?.focus({preventScroll:true});});
  return()=>{cancelled=true;dialog.hidePopover?.();};
 },[active]);
 useLayoutEffect(()=>()=>{const source=sourceFocus.current;requestAnimationFrame(()=>{if(source?.isConnected&&!source.closest('[inert],[hidden]'))source.focus({preventScroll:true});});},[]);
 return <dialog ref={layer} popover="manual" open={active} className="log-modal log-media-detail" data-open={active||undefined} aria-label="Hangout media" onCancel={event=>{event.preventDefault();event.stopPropagation();back();}} onKeyDown={event=>{
  event.stopPropagation();if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||isEditableLogTarget(event.target))return;
  if(event.key==='Escape'){event.preventDefault();back();}else if(event.key==='ArrowLeft'&&previous){event.preventDefault();go(-1);}else if(event.key==='ArrowRight'&&next){event.preventDefault();go(1);}
 }} {...swipe}>
  <section className="log-detail log-media-detail-content"><div className="log-detail-body"><h2>{source.title||'(untitled)'}</h2>{item?<>
   {item.file?.mime.startsWith('image/')?<LogDetailImage key={item.key} file={item.file} preview={selection.preview?.id===item.file.id?selection.preview:undefined} previous={()=>{if(previous)go(-1);}} next={()=>{if(next)go(1);}} zoom={scale=>{zoomed.current=scale>1;}}/>:item.file?.mime.startsWith('video/')?<LogDetailVideo key={item.key} file={item.file} active={active}/>:<div className="log-media-detail-visual log-media-detail-empty"><span className="quiet">(no visual)</span></div>}
   <div className="log-media-detail-author">{item.contributor.profileVisible===false?<span className="quiet">{item.contributor.handle||item.contributor.name}</span>:<NavLink to={{view:'person',resourceId:item.contributor.userId}} navigate={navigate}>{item.contributor.handle||item.contributor.name}</NavLink>}{item.contributor.files.filter(file=>file.mime.startsWith('audio/')).map(file=><AudioPlayer key={file.id} src={file.url} active={active} voiceNote/>)}</div>
   <div className="log-note-content">{item.contributor.note.trim()?<AgentMarkdown text={item.contributor.note}/>:<p className="quiet">(no note)</p>}</div>
  </>:<p className="quiet" role="status">This item is no longer available.</p>}</div>
  <footer className="log-detail-footer log-media-detail-footer">{item?.file&&<div className="panel-actions log-media-download"><a href={item.file.url} download={item.file.name}>Download</a></div>}<div className="panel-actions log-media-actions"><button ref={dismiss} type="button" className="log-media-back" aria-label="Back to hangout" onClick={back}>Back</button><button type="button" aria-label="Close hangout" onClick={close}>Close</button></div></footer></section>
 </dialog>;
}

/** Notes stay selectable and their Markdown links keep their own destinations. */
export function LogNoteDetailLink({name,open,children}:{name:string;open(element:HTMLElement):void;children:ReactNode}){
 return <div className="log-note-open" role="button" tabIndex={0} aria-label={`Open ${name}'s note`} onClick={event=>{if((event.target as HTMLElement).closest('a,button,input,textarea,select')||window.getSelection()?.isCollapsed===false)return;event.stopPropagation();open(event.currentTarget);}} onKeyDown={event=>{if(event.target!==event.currentTarget||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||!['Enter',' '].includes(event.key))return;event.preventDefault();event.stopPropagation();open(event.currentTarget);}}>{children}</div>;
}
