import {useEffect,useRef,useState,useId,type CSSProperties,type PointerEvent} from 'react';
import {CircleNotch} from '@phosphor-icons/react';
import {usePanelVisible} from './PanelReadiness';
import {centeredCrop,croppedPhoto,moveCrop,zoomCrop,type PhotoSize,type SquareCrop,type CropPoint} from './photoCrop';

export function LogPhotoEditor({file,cancel,save}:{file:File;cancel():void;save(file:File):void}){
 const zoomId=useId();
 const visible=usePanelVisible(),visibleRef=useRef(visible);visibleRef.current=visible;
 const [url,setUrl]=useState(''),[size,setSize]=useState<PhotoSize|null>(null),[crop,setCrop]=useState<SquareCrop|null>(null),[width,setWidth]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const frame=useRef<HTMLDivElement>(null),image=useRef<HTMLImageElement>(null),alive=useRef(true),points=useRef(new Map<number,CropPoint>()),current=useRef({size,crop,busy});current.current={size,crop,busy};
 useEffect(()=>{alive.current=true;const source=URL.createObjectURL(file);setUrl(source);return()=>{alive.current=false;URL.revokeObjectURL(source);};},[file]);
 useEffect(()=>{if(!visible)points.current.clear();},[visible]);
 useEffect(()=>{const element=frame.current!;const measure=()=>setWidth(element.clientWidth);measure();const observer=new ResizeObserver(measure);observer.observe(element);return()=>observer.disconnect();},[]);
 const update=(next:SquareCrop)=>{current.current.crop=next;setCrop(next);};
 const zoom=(value:number,point?:CropPoint)=>{const state=current.current;if(state.size&&state.crop&&!state.busy)update(zoomCrop(state.size,state.crop,value,point));};
 useEffect(()=>{const node=frame.current!;const wheel=(event:WheelEvent)=>{const state=current.current;if(!visibleRef.current||state.busy||!state.size||!state.crop)return;event.preventDefault();const rect=node.getBoundingClientRect();if(!rect.width)return;const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?rect.height:1);zoom(Math.min(state.size.width,state.size.height)/state.crop.size*Math.exp(-delta*.002),{x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height});};node.addEventListener('wheel',wheel,{passive:false});return()=>node.removeEventListener('wheel',wheel);},[]);
 const pointerDown=(event:PointerEvent<HTMLDivElement>)=>{if(current.current.busy||!current.current.crop||event.pointerType==='mouse'&&event.button!==0||points.current.size>=2)return;event.preventDefault();points.current.set(event.pointerId,{x:event.clientX,y:event.clientY});event.currentTarget.setPointerCapture(event.pointerId);};
 const pointerMove=(event:PointerEvent<HTMLDivElement>)=>{
  const state=current.current;if(!points.current.has(event.pointerId)||!state.crop||!state.size||state.busy)return;
  const before=[...points.current.values()];points.current.set(event.pointerId,{x:event.clientX,y:event.clientY});const after=[...points.current.values()],rect=event.currentTarget.getBoundingClientRect();if(!rect.width)return;
  const middle=(values:CropPoint[])=>({x:(values.reduce((sum,p)=>sum+p.x,0)/values.length-rect.left)/rect.width,y:(values.reduce((sum,p)=>sum+p.y,0)/values.length-rect.top)/rect.height});
  const distance=(values:CropPoint[])=>values.length===2?Math.hypot(values[1].x-values[0].x,values[1].y-values[0].y):0;
  const fromDistance=distance(before),toDistance=distance(after),nextSize=fromDistance>0&&toDistance>0?state.crop.size*fromDistance/toDistance:state.crop.size;
  update(moveCrop(state.size,state.crop,nextSize,middle(before),middle(after)));
 };
 const finish=async()=>{const state=current.current;if(!state.crop||!image.current||state.busy)return;current.current.busy=true;setBusy(true);setError('');try{const photo=await croppedPhoto(image.current,state.crop,file.name);if(alive.current&&visibleRef.current)save(photo);}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Could not prepare this photo.');}finally{if(alive.current){current.current.busy=false;setBusy(false);}}};
 const ready=Boolean(size&&crop&&width),factor=crop&&width?width/crop.size:0,zoomValue=size&&crop?Math.min(size.width,size.height)/crop.size:1;
 return <section className="log-task log-photo-editor" aria-label="Crop photo" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel();}}}>
  <div className="log-photo-editor-body">
   <div ref={frame} className="log-crop-frame" role="group" aria-label="Square crop. Drag to move, pinch to zoom, or use arrow keys." tabIndex={0} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={event=>points.current.delete(event.pointerId)} onPointerCancel={event=>points.current.delete(event.pointerId)} onLostPointerCapture={event=>points.current.delete(event.pointerId)} onKeyDown={event=>{if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||!size||!crop||busy||!width)return;const direction=({ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]} as Record<string,number[]>)[event.key];if(!direction)return;event.preventDefault();const step=(event.shiftKey?40:10)/width;update(moveCrop(size,crop,crop.size,{x:.5,y:.5},{x:.5+direction[0]*step,y:.5+direction[1]*step}));}}>
    {url&&<img ref={image} src={url} alt="Photo to crop" draggable={false} onDragStart={event=>event.preventDefault()} onLoad={event=>{const dimensions={width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight};if(!dimensions.width||!dimensions.height){setError('Could not open this photo.');return;}setSize(dimensions);const next=centeredCrop(dimensions);current.current={...current.current,size:dimensions,crop:next};setCrop(next);}} onError={()=>setError('Could not open this photo. Try a JPEG, PNG or WebP image.')} style={size&&crop&&width?{width:size.width*factor,height:size.height*factor,left:-crop.x*factor,top:-crop.y*factor,visibility:'visible'}:{visibility:'hidden'}}/>}
    {!ready&&!error&&<span className="log-crop-loading" role="status" aria-label="Loading photo"><CircleNotch className="spin" size={26}/></span>}
   </div>
   <div className="log-crop-zoom"><label htmlFor={zoomId}>Zoom <output>{zoomValue.toFixed(1)}×</output></label><input id={zoomId} aria-label="Photo zoom" type="range" min="1" max="6" step="0.01" disabled={!ready||busy} value={zoomValue} onChange={event=>zoom(Number(event.target.value))} style={{'--crop-zoom':`${(zoomValue-1)/5*100}%`} as CSSProperties}/><button type="button" disabled={!ready||busy} onClick={()=>{if(size)update(centeredCrop(size));}}>Reset</button></div>
   {error&&<p className="error" role="alert">{error}</p>}
  </div>
  <footer className="log-task-footer panel-actions log-crop-actions"><button type="button" onClick={cancel}>Cancel</button><button type="button" className="solid" disabled={!ready||busy} onClick={()=>void finish()}>{busy?'Preparing…':'Use photo'}</button></footer>
 </section>;
}
