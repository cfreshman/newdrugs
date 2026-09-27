import {useCallback,useEffect,useRef,useState} from 'react';
import {CircleNotch} from '@phosphor-icons/react';
import type {Destination} from '../shared/navigation';
import type {LogPage} from '../shared/log';
import {operation,errorText} from './api';
import {LogList} from './LogList';
import {usePanelVisible} from './PanelReadiness';
import {useRecordRefresh} from './useRecordRefresh';
export function ProfileHangouts({personId,navigate}:{personId:string;navigate(destination:Destination):void}){
 const [page,setPage]=useState<LogPage|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),visible=usePanelVisible();
 const current=useRef(page),generation=useRef(0),pending=useRef(false),edge=useRef<HTMLDivElement>(null);current.current=page;
 const load=useCallback(async(before?:string)=>{if(pending.current)return;pending.current=true;const ticket=++generation.current;setLoading(true);try{
  const input={personId,scope:'shared',limit:30};const result=await operation<LogPage>('log.list',{...input,...(before?{before}:{})});
  if(!before)while(result.nextCursor&&result.items.length<(current.current?.items.length||0)){const next=await operation<LogPage>('log.list',{...input,before:result.nextCursor});if(ticket!==generation.current)return;result.items.push(...next.items);result.nextCursor=next.nextCursor;}
  if(ticket===generation.current){setPage(previous=>before&&previous?{...result,items:[...new Map([...previous.items,...result.items].map(entry=>[entry.id,entry])).values()]}:result);setError('');}
 }catch(e){if(ticket===generation.current)setError(errorText(e));}finally{if(ticket===generation.current){pending.current=false;setLoading(false);}}},[personId]);
 useEffect(()=>{if(visible)void load();return()=>{generation.current++;pending.current=false;};},[load,visible]);
 useRecordRefresh(['log'],()=>{if(visible)void load();});
 useEffect(()=>{const node=edge.current,root=node?.closest('.composer-view');if(!visible||loading||!page?.nextCursor||!node||!root||typeof IntersectionObserver==='undefined')return;const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))void load(page.nextCursor!);},{root,rootMargin:'100px'});observer.observe(node);return()=>observer.disconnect();},[visible,loading,page?.nextCursor,load]);
 return <div className="profile-hangouts"><LogList entries={page?.items||[]} open={entry=>navigate({view:'log',resourceId:entry.id})}/>{loading&&<div className="log-loading" role="status" aria-label="Loading hangouts"><CircleNotch className="spin" size={22}/></div>}{page&&!page.items.length&&!loading&&<p className="quiet">No shared hangouts yet.</p>}{error&&<p className="error" role="alert">{error}</p>}<div ref={edge}>{page?.nextCursor&&<button disabled={loading} onClick={()=>void load(page.nextCursor!)}>More hangouts</button>}</div></div>;
}
