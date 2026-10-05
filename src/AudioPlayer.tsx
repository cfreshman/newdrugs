import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {Play,Pause,CircleNotch} from '@phosphor-icons/react';

const time=(seconds:number)=>{const value=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0));return `${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;};

/** Shared audio controls. The media element has no native menu or download UI. */
export function AudioPlayer({src,active=true,voiceNote=false,editor=false}:{src:string;active?:boolean;voiceNote?:boolean;editor?:boolean}){
 const playbackSrc=voiceNote&&/^\/api\/files\/[0-9a-f-]{36}$/i.test(src)?`${src}/playback`:src;
 const audio=useRef<HTMLAudioElement>(null),activeRef=useRef(active),intent=useRef(0);
 activeRef.current=active;
 const [playing,setPlaying]=useState(false),[waiting,setWaiting]=useState(false),[failed,setFailed]=useState(false);
 const [duration,setDuration]=useState(0),[position,setPosition]=useState(0);
 useEffect(()=>{
  const node=audio.current!;setPlaying(false);setWaiting(false);setFailed(false);setDuration(0);setPosition(0);
  const hide=()=>{if(document.hidden){intent.current++;node.pause();}};
  const other=(event:Event)=>{if((event as CustomEvent).detail!==node){intent.current++;node.pause();}};
  document.addEventListener('visibilitychange',hide);window.addEventListener('newdrugs:media-play',other);
  return()=>{intent.current++;node.pause();document.removeEventListener('visibilitychange',hide);window.removeEventListener('newdrugs:media-play',other);};
 },[playbackSrc]);
 useEffect(()=>{if(!active){intent.current++;audio.current?.pause();setPlaying(false);setWaiting(false);}},[active]);
 const toggle=async()=>{
  const node=audio.current;if(!node||!activeRef.current)return;
  const ticket=++intent.current;
  if(!node.paused){node.pause();if(voiceNote){node.currentTime=0;setPosition(0);}return;}
  setFailed(false);setWaiting(true);
  try{if(node.error)node.load();if((node.ended||voiceNote&&node.currentTime>0)&&node.readyState>0)node.currentTime=0;await node.play();if(ticket!==intent.current||!activeRef.current)node.pause();}
  catch(error){if(ticket===intent.current){setWaiting(false);setFailed(true);console.error('Audio playback:',error instanceof Error?error.message:'Unable to play.');}}
 };
 const seek=(value:number)=>{const node=audio.current;if(!node||!duration)return;const next=Math.min(duration,Math.max(0,value));node.currentTime=next;setPosition(next);};
 const updateTime=()=>{const node=audio.current!;setPosition(Number.isFinite(node.currentTime)?node.currentTime:0);setDuration(Number.isFinite(node.duration)&&node.duration>0?node.duration:0);};
 return <div className={voiceNote?'log-voice-player':'audio-player'} role="group" aria-label={voiceNote?'Voice note':'Audio player'} data-embed-interactive>
  <audio ref={audio} src={playbackSrc} preload={voiceNote?'none':active?'metadata':'none'} hidden aria-hidden="true" controlsList="nodownload" onEmptied={()=>{setDuration(0);setPosition(0);}} onLoadedMetadata={updateTime} onDurationChange={updateTime} onTimeUpdate={updateTime}
   onPlay={()=>{if(!activeRef.current){audio.current?.pause();return;}setPlaying(true);setFailed(false);window.dispatchEvent(new CustomEvent('newdrugs:media-play',{detail:audio.current}));}}
   onPlaying={()=>setWaiting(false)} onWaiting={()=>setWaiting(true)} onPause={()=>{setPlaying(false);setWaiting(false);}} onEnded={()=>{setPlaying(false);setWaiting(false);updateTime();}}
   onError={()=>{setFailed(true);setPlaying(false);setWaiting(false);}}/>
  {voiceNote?<button type="button" disabled={!active} onClick={()=>void toggle()}>{waiting?'Loading…':playing?duration?`Interrupt ${Math.max(0,Math.ceil(duration-position))}s`:'Interrupt':failed?'Retry voice note':editor?'Play voice note':'Voice note'}</button>:<>
  <button type="button" className="audio-play" aria-label={playing?'Pause audio':failed?'Retry audio':'Play audio'} disabled={!active} onClick={()=>void toggle()}>{waiting?<CircleNotch size={20} className="agent-spinner"/>:playing?<Pause size={18} weight="fill"/>:<Play size={18} weight="fill"/>}</button>
  <span className="audio-time" title={failed?'Audio could not load. Use the play button to retry.':undefined}>{failed?'Unavailable':`${time(position)} / ${time(duration)}`}</span>
  <input className="audio-seek" type="range" aria-label="Seek audio" aria-valuetext={`${time(position)} of ${time(duration)}`} min={0} max={duration||1} step={0.1} value={Math.min(position,duration||0)} disabled={!duration||failed} onChange={event=>seek(Number(event.target.value))} style={{'--audio-progress':`${duration?Math.min(100,position/duration*100):0}%`} as CSSProperties}/>
 </>}
 </div>;
}
