import {useEffect,useState} from 'react';
import {Temporal} from '@js-temporal/polyfill';

function readClock(now=new Date()){
 const day=Temporal.PlainDate.from({year:now.getFullYear(),month:now.getMonth()+1,day:now.getDate()});
 return {day:day.toString(),from:now.getHours()<8?day.subtract({days:1}).toString():day.toString()};
}

/** Local midnight and the 8am Today-card cutoff, including a resumed browser. */
export function useLogClock(){
 const [clock,setClock]=useState(readClock);
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>;
  const check=()=>{
   clearTimeout(timer);
   const now=new Date(),next=readClock(now);
   setClock(previous=>previous.day===next.day&&previous.from===next.from?previous:next);
   const boundary=new Date(now);boundary.setHours(now.getHours()<8?8:24,0,0,0);
   timer=setTimeout(check,Math.max(1,boundary.getTime()-now.getTime()+20));
  };
  const resume=()=>{if(!document.hidden)check();};
  check();window.addEventListener('focus',resume);window.addEventListener('pageshow',resume);document.addEventListener('visibilitychange',resume);
  return()=>{clearTimeout(timer);window.removeEventListener('focus',resume);window.removeEventListener('pageshow',resume);document.removeEventListener('visibilitychange',resume);};
 },[]);
 return clock;
}
