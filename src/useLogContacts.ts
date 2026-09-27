import {useEffect,useRef,useState} from 'react';
import type {LogContact} from '../shared/logJoining';
import {operation,errorText} from './api';
import {useRecordRefresh} from './useRecordRefresh';
interface Page {items:LogContact[];nextCursor:string|null;indexing?:boolean}
export function useLogContacts(query:string,visible:boolean){
 const [page,setPage]=useState<Page>({items:[],nextCursor:null}),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
 const request=useRef<AbortController|null>(null),current=useRef({query,page,visible});current.current={query,page,visible};
 const load=async(append=false)=>{const {query,page,visible}=current.current;if(!visible||append&&!page.nextCursor)return;request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setError('');try{const next=await operation<Page>('log.contacts',{limit:30,...(query.trim()?{query:query.trim()}:{}),...(append&&page.nextCursor?{before:page.nextCursor}:{})},{signal:controller.signal});if(!controller.signal.aborted){setPage(prior=>({...next,items:append?[...prior.items,...next.items]:next.items}));setLoaded(true);}}catch(error){if(!controller.signal.aborted)setError(errorText(error));}finally{if(!controller.signal.aborted)setBusy(false);}};
 useEffect(()=>{if(!visible){request.current?.abort();return;}const timer=query?setTimeout(()=>void load(),150):undefined;if(!query)void load();return()=>{clearTimeout(timer);request.current?.abort();};},[query,visible]);
 useRecordRefresh(['log','people','connections'],()=>load());
 useEffect(()=>{if(!visible||!page.indexing||busy)return;const timer=setTimeout(()=>void load(),3000);return()=>clearTimeout(timer);},[page.indexing,busy,visible]);
 return {...page,busy,loaded,error,more:()=>load(true)};
}
