import type {Room} from 'livekit-client';

const RATE=16000,MAX_FRAMES=60*RATE;
/** This buffer exists only while the browser is connected to a Talk. */
export class TalkEvidence {
 private stopped=false;
 private resume=()=>{if(this.context&&this.context.state!=='running')void this.context.resume().catch(()=>{});};
 private context:AudioContext|null=null;
 private mixer:GainNode|null=null;
 private worklet:AudioWorkletNode|null=null;
 private sources=new Map<string,MediaStreamAudioSourceNode>();
 private chunks:Float32Array[]=[];
 private frames=0;
 prime(){if(this.stopped||!window.AudioContext)return;this.context||=new AudioContext();this.resume();}
 async start(room:Room){
  if(!window.AudioContext||!window.AudioWorkletNode)throw Error('Talk audio evidence is unavailable in this browser.');
  this.prime();const context=this.context!;
  await context.audioWorklet.addModule('/talk-evidence-worklet.js');
  if(this.stopped)throw Error('Talk ended.');
  const mixer=context.createGain(),compressor=context.createDynamicsCompressor(),worklet=new AudioWorkletNode(context,'talk-evidence'),silent=context.createGain();
  silent.gain.value=0;
  mixer.connect(compressor);compressor.connect(worklet);worklet.connect(silent);silent.connect(context.destination);
  this.mixer=mixer;this.worklet=worklet;
  worklet.port.onmessage=(event:MessageEvent<Float32Array>)=>{
   if(!(event.data instanceof Float32Array)||!this.context)return;
   this.chunks.push(event.data);this.frames+=event.data.length;
   while(this.frames>MAX_FRAMES&&this.chunks.length>1)this.frames-=this.chunks.shift()!.length;
  };
  this.sync(room);
  document.addEventListener('pointerdown',this.resume,{passive:true});this.resume();
 }
 sync(room:Room){
  if(!this.context||!this.mixer)return;
  const tracks=new Map<string,MediaStreamTrack>();
  for(const participant of [room.localParticipant,...room.remoteParticipants.values()])for(const publication of participant.audioTrackPublications.values()){
   const track=publication.audioTrack?.mediaStreamTrack;if(track&&track.readyState==='live')tracks.set(track.id,track);
  }
  for(const [id,source] of this.sources)if(!tracks.has(id)){source.disconnect();this.sources.delete(id);}
  for(const [id,track] of tracks)if(!this.sources.has(id)){
   const source=this.context.createMediaStreamSource(new MediaStream([track]));source.connect(this.mixer);this.sources.set(id,source);
  }
 }
 snapshot():Blob|null{
  if(!this.frames)return null;
  const frameCount=Math.min(MAX_FRAMES,this.frames),bytes=new Uint8Array(44+frameCount*2),view=new DataView(bytes.buffer);
  const label=(offset:number,value:string)=>{for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i));};
  label(0,'RIFF');view.setUint32(4,bytes.length-8,true);label(8,'WAVE');label(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,RATE,true);view.setUint32(28,RATE*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);label(36,'data');view.setUint32(40,frameCount*2,true);
  let skip=this.frames-frameCount,cursor=44;
  for(const chunk of this.chunks){const start=Math.min(skip,chunk.length);skip-=start;for(let i=start;i<chunk.length;i++){const sample=Math.max(-1,Math.min(1,chunk[i]));view.setInt16(cursor,Math.round(sample<0?sample*32768:sample*32767),true);cursor+=2;}}
  return new Blob([bytes],{type:'audio/wav'});
 }
 async stop(){this.stopped=true;document.removeEventListener('pointerdown',this.resume);this.worklet?.port.close();for(const source of this.sources.values())source.disconnect();this.sources.clear();this.chunks=[];this.frames=0;this.mixer=null;this.worklet=null;const context=this.context;this.context=null;await context?.close().catch(()=>{});}
}
