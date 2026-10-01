import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Room,RoomEvent,Track} from 'livekit-client';
import {Microphone,MicrophoneSlash,PhoneDisconnect,VideoCamera,VideoCameraSlash} from '@phosphor-icons/react';
import type {CallAccess} from '../shared/calling';
import {errorText} from './api';
import './calling.css';

function AudioVisualizer({track}:{track?:MediaStreamTrack}){
 const canvas=useRef<HTMLCanvasElement>(null);
 useEffect(()=>{
  const node=canvas.current;if(!node||!track)return;
  const context=new AudioContext(),source=context.createMediaStreamSource(new MediaStream([track])),analyser=context.createAnalyser();analyser.fftSize=1024;analyser.smoothingTimeConstant=.72;source.connect(analyser);
  const samples=new Uint8Array(analyser.frequencyBinCount);let frame=0,stopped=false;
  const resume=()=>void context.resume().catch(()=>{});
  const paint=()=>{if(stopped)return;const bounds=node.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2),width=Math.max(1,bounds.width),height=Math.max(1,bounds.height);node.width=Math.round(width*ratio);node.height=Math.round(height*ratio);const draw=node.getContext('2d');if(!draw)return;draw.setTransform(ratio,0,0,ratio,0,0);draw.clearRect(0,0,width,height);draw.fillStyle='#e9e7de';analyser.getByteFrequencyData(samples);const count=9,gap=Math.max(2,width*.025),bar=(width-gap*(count-1))/count;for(let index=0;index<count;index++){const start=2+Math.floor(index*80/count),end=Math.min(samples.length,start+8);let sum=0;for(let bin=start;bin<end;bin++)sum+=samples[bin]*samples[bin];const level=Math.min(1,Math.sqrt(sum/Math.max(1,end-start))/255),extent=Math.max(bar/2,level*height*.42),x=index*(bar+gap);draw.beginPath();draw.roundRect(x,height/2-extent,bar,extent*2,bar/2);draw.fill();}frame=requestAnimationFrame(paint);};
  resume();document.addEventListener('pointerdown',resume);frame=requestAnimationFrame(paint);
  return()=>{stopped=true;cancelAnimationFrame(frame);document.removeEventListener('pointerdown',resume);source.disconnect();analyser.disconnect();void context.close().catch(()=>{});};
 },[track]);
 return <canvas ref={canvas} className="call-audio-visualizer" role="img" aria-label="Audio activity"/>;
}

/** The two-square stage follows the Pair Video reference. Call state stays in the DM. */
export function CallStage({access,otherName,onEnd,onClosed}:{access:CallAccess;otherName:string;onEnd():Promise<void>;onClosed():void}){
 const roomRef=useRef<Room|null>(null),localVideo=useRef<HTMLVideoElement>(null),remoteVideo=useRef<HTMLVideoElement>(null),remoteAudio=useRef<HTMLAudioElement>(null);
 const [connected,setConnected]=useState(false),[peer,setPeer]=useState(false),[mic,setMic]=useState(false),[camera,setCamera]=useState(false),[peerMic,setPeerMic]=useState(false),[peerCamera,setPeerCamera]=useState(false),[localAudioTrack,setLocalAudioTrack]=useState<MediaStreamTrack>(),[remoteAudioTrack,setRemoteAudioTrack]=useState<MediaStreamTrack>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  const previous=document.body.style.overflow;document.body.style.overflow='hidden';let active=true;
  const room=new Room({adaptiveStream:true,dynacast:true});roomRef.current=room;
  const sync=()=>{
   if(!active)return;
   const local=room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
   if(local&&localVideo.current)local.attach(localVideo.current);
   const remote=[...room.remoteParticipants.values()][0];setPeer(Boolean(remote));
   const video=remote?.getTrackPublication(Track.Source.Camera),audio=remote?.getTrackPublication(Track.Source.Microphone);
   if(video?.track&&remoteVideo.current)video.track.attach(remoteVideo.current);
   if(audio?.track&&remoteAudio.current)audio.track.attach(remoteAudio.current);
   setLocalAudioTrack(room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack);
   setRemoteAudioTrack(audio?.track?.mediaStreamTrack);
   setPeerCamera(Boolean(video?.track&&!video.isMuted));setPeerMic(Boolean(audio?.track&&!audio.isMuted));
   setMic(room.localParticipant.isMicrophoneEnabled);setCamera(room.localParticipant.isCameraEnabled);
  };
  room.on(RoomEvent.ParticipantConnected,sync).on(RoomEvent.ParticipantDisconnected,sync).on(RoomEvent.TrackSubscribed,sync).on(RoomEvent.TrackUnsubscribed,sync).on(RoomEvent.TrackMuted,sync).on(RoomEvent.TrackUnmuted,sync).on(RoomEvent.LocalTrackPublished,sync).on(RoomEvent.LocalTrackUnpublished,sync);
  room.on(RoomEvent.Disconnected,()=>{if(active){setConnected(false);onClosed();}});
  void(async()=>{try{
   await room.connect(access.url,access.token);if(!active)return;setConnected(true);sync();
   try{await room.localParticipant.setMicrophoneEnabled(true);}catch(error){if(active)setError(`Microphone: ${errorText(error)}`);}
   try{await room.localParticipant.setCameraEnabled(true);}catch(error){if(active)setError(previous=>previous||`Camera: ${errorText(error)}`);}
   sync();
  }catch(error){if(active){setError(errorText(error));setConnected(false);}}})();
  return()=>{active=false;document.body.style.overflow=previous;roomRef.current=null;void room.disconnect();};
 },[access.call.id,access.token]);
 useEffect(()=>{if(!connected||!('wakeLock' in navigator))return;let cancelled=false,lock:WakeLockSentinel|null=null;const acquire=async()=>{if(cancelled||document.hidden||lock)return;try{lock=await navigator.wakeLock.request('screen');if(cancelled){await lock.release();lock=null;}}catch{lock=null;}};void acquire();document.addEventListener('visibilitychange',acquire);return()=>{cancelled=true;document.removeEventListener('visibilitychange',acquire);void lock?.release().catch(()=>{});};},[connected]);
 const toggle=async(kind:'mic'|'camera')=>{const room=roomRef.current;if(!room||busy)return;setBusy(true);setError('');try{if(kind==='mic'){await room.localParticipant.setMicrophoneEnabled(!mic);setMic(room.localParticipant.isMicrophoneEnabled);}else{await room.localParticipant.setCameraEnabled(!camera);setCamera(room.localParticipant.isCameraEnabled);}}catch(error){setError(errorText(error));}finally{setBusy(false);}};
 const leave=async()=>{if(busy)return;setBusy(true);try{await onEnd();onClosed();}catch(error){setError(errorText(error));setBusy(false);}};
 return createPortal(<div className="call-stage" role="dialog" aria-modal="true" aria-label={`Video call with ${otherName}`}>
  <div className="call-pair">
   <section className={`call-square call-local${camera?'':' camera-off'}`} aria-label="Your video"><video ref={localVideo} muted autoPlay playsInline/>{!camera&&(mic?<AudioVisualizer track={localAudioTrack}/>:<span className="call-input-status">Inputs off</span>)}<div className="call-controls">
    <button type="button" aria-label={mic?'Mute microphone':'Unmute microphone'} title={mic?'Mute microphone':'Unmute microphone'} className={mic?'':'off'} disabled={!connected||busy} onClick={()=>void toggle('mic')}>{mic?<Microphone size={21} weight="bold"/>:<MicrophoneSlash size={21} weight="bold"/>}</button>
    <button type="button" aria-label={camera?'Turn camera off':'Turn camera on'} title={camera?'Turn camera off':'Turn camera on'} className={camera?'':'off'} disabled={!connected||busy} onClick={()=>void toggle('camera')}>{camera?<VideoCamera size={21} weight="bold"/>:<VideoCameraSlash size={21} weight="bold"/>}</button>
    <button type="button" aria-label="End call" title="End call" className="end" disabled={busy} onClick={()=>void leave()}><PhoneDisconnect size={21} weight="bold"/></button>
   </div>{error&&<p className="call-error" role="alert">{error}</p>}</section>
   <section className={`call-square call-remote${peerCamera?'':' camera-off'}`} aria-label={`${otherName}'s video`}><video ref={remoteVideo} autoPlay playsInline/><audio ref={remoteAudio} autoPlay/>{!peer?<span className="call-waiting">Waiting for {otherName}</span>:!peerCamera?(peerMic?<AudioVisualizer track={remoteAudioTrack}/>:<span className="call-input-status">Inputs off</span>):null}</section>
  </div>
 </div>,document.body);
}
