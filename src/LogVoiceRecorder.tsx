import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {ArrowRight,Stop} from '@phosphor-icons/react';
import {usePanelVisible} from './PanelReadiness';
import {errorText} from './api';

// Logcal's short voice note: a filling arrow, tap to finish, then play/remove.
export function LogVoiceRecorder({add,error,disabled,change,uploadHint=true}:{add(file:File):Promise<void>;error(message:string):void;disabled:boolean;change(recording:boolean):void;uploadHint?:boolean}){
 const visible=usePanelVisible(),alive=useRef(true),visibleRef=useRef(visible),locked=useRef(false);
 visibleRef.current=visible;
 const [phase,setPhase]=useState<'idle'|'starting'|'recording'|'processing'>('idle');
 const [seconds,setSeconds]=useState(0),recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),discard=useRef(false);
 const release=()=>{stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;};
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;discard.current=true;if(recorder.current?.state==='recording')recorder.current.stop();release();};},[]);
 useEffect(()=>{change(phase!=='idle');},[phase,change]);
 useEffect(()=>()=>change(false),[change]);
 useEffect(()=>{if(!visible&&recorder.current?.state==='recording')recorder.current.stop();},[visible]);
 useEffect(()=>{
  if(phase!=='recording')return;
  const start=performance.now(),timer=setInterval(()=>setSeconds(Math.min(15,(performance.now()-start)/1000)),100);
  const limit=setTimeout(()=>{if(recorder.current?.state==='recording')recorder.current.stop();},15000);
  return()=>{clearInterval(timer);clearTimeout(limit);};
 },[phase]);
 const start=async()=>{
  if(locked.current||disabled)return;locked.current=true;setPhase('starting');
  try{
   if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw Error(uploadHint?'Recording is unavailable in this browser. You can attach an audio file.':'Recording is unavailable in this browser.');
   stream.current=await navigator.mediaDevices.getUserMedia({audio:true});
   if(!alive.current||!visibleRef.current){release();locked.current=false;if(alive.current)setPhase('idle');return;}
   discard.current=false;
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(value=>MediaRecorder.isTypeSupported(value));
   const rec=new MediaRecorder(stream.current,mime?{mimeType:mime}:undefined),parts:Blob[]=[];let size=0;
   recorder.current=rec;
   rec.ondataavailable=event=>{if(event.data.size){parts.push(event.data);size+=event.data.size;}if(size>10*1024*1024&&rec.state==='recording')rec.stop();};
   rec.onerror=()=>{discard.current=true;release();locked.current=false;if(alive.current){error('The recording could not be completed. Try again.');setPhase('idle');}};
   rec.onstop=()=>{
    release();recorder.current=null;
    if(discard.current||!alive.current){locked.current=false;if(alive.current)setPhase('idle');return;}
    if(!parts.length){locked.current=false;setPhase('idle');error('The recording was empty. Try again.');return;}
    setPhase('processing');const type=rec.mimeType||parts[0].type,ext=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'weba';
    void add(new File(parts,`Voice note.${ext}`,{type})).catch(e=>{if(alive.current)error(errorText(e));}).finally(()=>{locked.current=false;if(alive.current)setPhase('idle');});
   };
   window.dispatchEvent(new CustomEvent('newdrugs:media-play',{detail:null}));
   rec.start(250);setSeconds(0);setPhase('recording');
  }catch(e){release();locked.current=false;if(alive.current){setPhase('idle');error(errorText(e));}}
 };
 return <div className="log-voice-row">
  {phase==='recording'?<>
   <button type="button" className="log-voice-progress" aria-label={`Finish voice note, ${Math.floor(seconds)} of 15 seconds`} onClick={()=>recorder.current?.stop()}>
    <span className="log-voice-track" aria-hidden="true" data-step={Math.floor(seconds)} style={{'--voice-step':Math.floor(seconds)} as CSSProperties}><ArrowRight size={18} weight="regular"/></span>
    <Stop size={18} weight="fill" aria-hidden="true"/>
   </button>
   <button type="button" onClick={()=>{discard.current=true;recorder.current?.stop();}}>Cancel</button>
  </>:<button type="button" disabled={disabled||phase!=='idle'} onClick={()=>void start()}>{phase==='processing'?'Processing…':phase==='starting'?'Opening microphone…':'Record voice note'}</button>}
 </div>;
}
