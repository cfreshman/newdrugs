class TalkEvidenceProcessor extends AudioWorkletProcessor {
  constructor(){
    super();
    this.phase=0;
    this.sum=0;
    this.count=0;
    this.samples=new Float32Array(1600);
    this.used=0;
  }
  process(inputs,outputs){
    const channels=inputs[0],left=channels?.[0],right=channels?.[1],frames=outputs[0]?.[0]?.length||128;
    for(let index=0;index<frames;index++){
      const sample=left?.[index]||0;
      this.sum+=right?(sample+right[index])/2:sample;
      this.count++;
      this.phase+=16000;
      if(this.phase>=sampleRate){
        this.phase-=sampleRate;
        this.samples[this.used++]=Math.max(-1,Math.min(1,this.sum/this.count));
        this.sum=0;this.count=0;
        if(this.used===this.samples.length){
          const ready=this.samples;
          this.port.postMessage(ready,[ready.buffer]);
          this.samples=new Float32Array(1600);
          this.used=0;
        }
      }
    }
    return true;
  }
}
registerProcessor('talk-evidence',TalkEvidenceProcessor);
