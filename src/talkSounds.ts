let context:AudioContext|null=null;

export function unlockTalkSounds(){
 if(typeof window==='undefined'||!window.AudioContext)return;
 context ||=new AudioContext();
 if(context.state!=='running')void context.resume().catch(()=>{});
}

function note(frequency:number,offset:number,volume:number){
 const audio=context;if(!audio||audio.state!=='running')return;
 const at=audio.currentTime+offset,oscillator=audio.createOscillator(),gain=audio.createGain();
 oscillator.type='sine';oscillator.frequency.value=frequency;
 gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.025);gain.gain.exponentialRampToValueAtTime(.0001,at+.24);
 oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(at);oscillator.stop(at+.25);
 oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
}

export function playTalkSound(kind:'request'|'approved'){
 if(document.hidden||context?.state!=='running')return;
 if(kind==='request'){note(440,.01,.022);note(587.33,.16,.018);}
 else {note(523.25,.01,.021);note(659.25,.13,.019);note(783.99,.25,.016);}
}
