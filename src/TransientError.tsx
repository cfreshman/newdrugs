import {createElement,useLayoutEffect,useRef,useState,type HTMLAttributes} from 'react';

/** Keep an error readable briefly without making every panel own a dismissal timer. */
export function TransientError({as='p',children,...props}:{as?:'p'|'span'|'small'}&HTMLAttributes<HTMLElement>){
 const node=useRef<HTMLElement>(null),lastText=useRef<string|undefined>(undefined),timer=useRef<ReturnType<typeof setTimeout>|null>(null),[visible,setVisible]=useState(true);
 useLayoutEffect(()=>{
  const text=node.current?.textContent||'';
  if(text===lastText.current&&(timer.current||!visible))return;
  lastText.current=text;setVisible(true);
  if(timer.current)clearTimeout(timer.current);
  if(text)timer.current=setTimeout(()=>{timer.current=null;setVisible(false);},6000);
 });
 useLayoutEffect(()=>()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}},[]);
 return createElement(as,{...props,ref:node,hidden:!visible},children);
}
