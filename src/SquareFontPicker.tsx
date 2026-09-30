import {useEffect,useId,useLayoutEffect,useRef,useState} from 'react';
import {CaretDown,CircleNotch} from '@phosphor-icons/react';
import {squareFonts,type SquareLayer} from './squareModel';
import {ensureSquareFontPreviews} from './squareFonts';

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

export function SquareFontPicker({value,change,active}:{value:SquareLayer['font'];change(value:SquareLayer['font']):void;active:boolean}){
 const id=useId(),trigger=useRef<HTMLButtonElement>(null),list=useRef<HTMLDivElement>(null),alive=useRef(true),request=useRef(0);
 const [open,setOpen]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current++;};},[]);
 useEffect(()=>{if(!active){request.current++;setOpen(false);setLoading(false);}},[active]);
 const toggle=async()=>{if(open){setOpen(false);return;}const ticket=++request.current;setLoading(true);setError('');try{await ensureSquareFontPreviews();if(alive.current&&ticket===request.current)setOpen(true);}catch(e){if(alive.current&&ticket===request.current)setError(e instanceof Error?e.message:'Could not load fonts.');}finally{if(alive.current&&ticket===request.current)setLoading(false);}};
 useLayoutEffect(()=>{if(!open)return;const panel=list.current,button=trigger.current;if(!panel||!button)return;
  const position=()=>{const viewport=window.visualViewport,top=viewport?.offsetTop||0,left=viewport?.offsetLeft||0,height=viewport?.height||window.innerHeight,width=viewport?.width||window.innerWidth,bounds=button.getBoundingClientRect(),below=top+height-bounds.bottom-6,above=bounds.top-top-6,up=below<260&&above>below,available=Math.max(80,Math.min(320,up?above:below)),panelWidth=Math.min(240,width-12);Object.assign(panel.style,{left:`${clamp(bounds.left,left+6,left+width-panelWidth-6)}px`,top:`${up?bounds.top-6-available:bounds.bottom+6}px`,width:`${panelWidth}px`,height:`${available}px`,maxHeight:`${available}px`});};
  if(!panel.matches(':popover-open'))panel.showPopover?.();position();requestAnimationFrame(()=>panel.querySelector<HTMLButtonElement>('[aria-selected=true]')?.focus({preventScroll:true}));
  const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!panel.contains(event.target)&&!button.contains(event.target))setOpen(false);};
  document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);window.visualViewport?.addEventListener('scroll',position);
  return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',position);window.visualViewport?.removeEventListener('resize',position);window.visualViewport?.removeEventListener('scroll',position);if(panel.matches(':popover-open'))panel.hidePopover?.();};
 },[open]);
 return <div className="square-font-picker"><button ref={trigger} type="button" className="square-font-trigger" aria-label="Text font" aria-haspopup="listbox" aria-controls={id} aria-expanded={open} aria-busy={loading||undefined} onClick={()=>void toggle()}><span style={{fontFamily:`"${squareFonts[value]}"`}}>{squareFonts[value]}</span>{loading?<CircleNotch className="spin" size={17}/>:<CaretDown size={17}/>}</button>
  <div ref={list} id={id} className="square-font-options" popover="manual" role="listbox" aria-label="Text fonts" onKeyDown={event=>{const options=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=option]')],at=options.indexOf(document.activeElement as HTMLButtonElement);if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus({preventScroll:true});}else if(event.key==='ArrowDown'||event.key==='ArrowUp'||event.key==='Home'||event.key==='End'){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?options.length-1:clamp(at+(event.key==='ArrowDown'?1:-1),0,options.length-1);options[next]?.focus({preventScroll:true});}else if(event.key==='Tab')setOpen(false);}}>{Object.entries(squareFonts).map(([key,family])=><button key={key} type="button" role="option" aria-selected={value===key} style={{fontFamily:`"${family}"`}} onClick={()=>{change(key as SquareLayer['font']);setOpen(false);trigger.current?.focus({preventScroll:true});}}>{family}</button>)}</div>
  {error&&<span className="error" role="alert">{error}</span>}
 </div>;
}
