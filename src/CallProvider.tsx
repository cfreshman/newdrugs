import {createContext,lazy,Suspense,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import type {CallAccess,CallRecord} from '../shared/calling';
import {api,errorText,post} from './api';
import {NavLink} from './NavLink';
import {useRecordRefresh} from './useRecordRefresh';
import './calling.css';

const CallStage=lazy(()=>import('./CallStage').then(module=>({default:module.CallStage})));
interface ActiveCall {call:CallRecord|null;otherName:string}
interface CallControls extends ActiveCall {
 userId?:string;
 busy:boolean;
 error:string;
 start(connectionId:string,otherName:string):Promise<void>;
 answer(call:CallRecord):Promise<void>;
 open(call:CallRecord):Promise<void>;
 end(call:CallRecord):Promise<void>;
}
const CallContext=createContext<CallControls|null>(null);
export const useCall=()=>useContext(CallContext);
const changed=()=>window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:['calls']}));
function chime(context:AudioContext,frequency:number,at:number,volume:number){
 const tone=context.createOscillator(),gain=context.createGain();tone.type='sine';tone.frequency.value=frequency;
 gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.035);gain.gain.exponentialRampToValueAtTime(.0001,at+.32);
 tone.connect(gain);gain.connect(context.destination);tone.start(at);tone.stop(at+.33);tone.onended=()=>{tone.disconnect();gain.disconnect();};
}

export function CallProvider({userId,children}:{userId?:string;children:ReactNode}){
 const [active,setActive]=useState<ActiveCall>({call:null,otherName:''}),[access,setAccess]=useState<CallAccess|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),autoOpen=useRef<string|null>(null),entering=useRef(false);
 const audioContext=useRef<AudioContext|null>(null),[audioReady,setAudioReady]=useState(false);
 useEffect(()=>{const unlock=()=>{if(!window.AudioContext)return;const context=audioContext.current||new AudioContext();audioContext.current=context;void context.resume().then(()=>setAudioReady(context.state==='running')).catch(()=>{});};
  window.addEventListener('pointerdown',unlock,{passive:true});window.addEventListener('keydown',unlock);
  return()=>{window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);void audioContext.current?.close().catch(()=>{});};
 },[]);
 const refresh=useCallback(async()=>{
  if(!userId)return;const ticket=++generation.current;
  try{const value=await api<ActiveCall>('/calls/active');if(ticket!==generation.current)return;
   if(value.call?.status==='waiting'&&value.call.callerId===userId)autoOpen.current=value.call.id;
   if(!value.call){autoOpen.current=null;setAccess(null);}
   setActive(previous=>previous.call?.id===value.call?.id&&previous.call?.status==='connected'&&value.call?.status==='waiting'?previous:value);
  }catch(cause){if(ticket===generation.current)console.error('Call state:',errorText(cause));}
 },[userId]);
 useEffect(()=>{generation.current++;autoOpen.current=null;setActive({call:null,otherName:''});setAccess(null);setError('');void refresh();return()=>{generation.current++;};},[refresh]);
 useRecordRefresh(['calls'],refresh);
 useEffect(()=>{if(!userId||active.call?.status!=='waiting')return;const timer=setInterval(()=>void refresh(),5000);return()=>clearInterval(timer);},[userId,active.call?.id,active.call?.status,refresh]);
 useEffect(()=>{const call=active.call,context=audioContext.current;if(!call||call.status!=='waiting'||!context||!audioReady)return;
  const incoming=call.calleeId===userId,period=incoming?4200:3600;let count=0;
  let timer:ReturnType<typeof setInterval>|undefined;
  const ring=()=>{if(count>=10){if(timer)clearInterval(timer);return;}if(document.hidden||context.state!=='running')return;count++;const at=context.currentTime+.02;chime(context,incoming?523.25:440,at,.024);chime(context,incoming?659.25:523.25,at+.22,.018);};
  ring();timer=setInterval(ring,period);return()=>clearInterval(timer);
 },[active.call?.id,active.call?.status,audioReady,userId]);
 const enter=async(call:CallRecord)=>{if(entering.current)return;entering.current=true;setBusy(true);setError('');try{const granted=await post<CallAccess>(`/calls/${call.id}/token`);if(granted.call.status==='connected')setAccess(granted);}catch(cause){setError(errorText(cause));throw cause;}finally{entering.current=false;setBusy(false);}};
 useEffect(()=>{const call=active.call;if(!call||call.status!=='connected'||autoOpen.current!==call.id||access||entering.current)return;autoOpen.current=null;void enter(call).catch(()=>{});},[active.call?.id,active.call?.status,access]);
 const start=async(connectionId:string,otherName:string)=>{if(busy)return;setBusy(true);setError('');try{const {call}=await post<{call:CallRecord}>(`/calls/${encodeURIComponent(connectionId)}`);generation.current++;autoOpen.current=call.callerId===userId&&call.status==='waiting'?call.id:null;setActive({call,otherName});changed();void refresh();}catch(cause){setError(errorText(cause));throw cause;}finally{setBusy(false);}};
 const answer=async(call:CallRecord)=>{if(busy)return;setBusy(true);setError('');try{const result=await post<{call:CallRecord}>(`/calls/${call.id}/join`);generation.current++;setActive(previous=>({...previous,call:result.call}));changed();const granted=await post<CallAccess>(`/calls/${call.id}/token`);setAccess(granted);void refresh();}catch(cause){setError(errorText(cause));throw cause;}finally{setBusy(false);}};
 const open=async(call:CallRecord)=>{if(call.status!=='connected'||busy)return;await enter(call);};
 const end=async(call:CallRecord)=>{if(busy)return;setBusy(true);setError('');try{await post(`/calls/${call.id}/end`);generation.current++;autoOpen.current=null;setAccess(previous=>previous?.call.id===call.id?null:previous);setActive(previous=>previous.call?.id===call.id?{call:null,otherName:''}:previous);changed();void refresh();}catch(cause){setError(errorText(cause));throw cause;}finally{setBusy(false);}};
 const value:CallControls={...active,userId,busy,error,start,answer,open,end};
 return <CallContext.Provider value={value}>{children}{access&&<Suspense fallback={null}><CallStage access={access} otherName={active.otherName} onEnd={()=>end(access.call)} onClosed={()=>{setAccess(null);void refresh();}}/></Suspense>}</CallContext.Provider>;
}

export function CallStatusControl({fallback}:{fallback:ReactNode}){
 const state=useCall(),call=state?.call;if(!call||!state)return fallback;
 const waiting=call.status==='waiting';
 const contents=<><span className="call-status-label"><strong className="call-status-name">{state.otherName}</strong><span className="call-status-kind">Video<span className="call-status-desktop-label"> call</span></span></span><span className={`call-progress-circle${waiting?' is-waiting':''}`} aria-hidden="true"/></>;
 if(waiting)return <NavLink className="call-status-control" to={{view:'messages',resourceId:call.connectionId}} aria-label={`${call.callerId===state.userId?'Calling':'Incoming video call from'} ${state.otherName}`}>{contents}</NavLink>;
 return <button type="button" className="call-status-control" aria-label={`Open video call with ${state.otherName}`} disabled={state.busy} onClick={()=>void state.open(call).catch(()=>{})}>{contents}</button>;
}
