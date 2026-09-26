import {useEffect,useRef} from 'react';

// Same colors, centers, spreads and compositing order as the static CSS fallback.
const fields = [
  {color:'yellow',x:45,y:74,rx:58,ry:39,period:16,phase:0.2},
  {color:'red',x:88,y:51,rx:62,ry:48,period:19,phase:2.1},
  {color:'orange',x:44,y:46,rx:60,ry:40,period:14,phase:4.2},
  {color:'green',x:1,y:42,rx:56,ry:52,period:21,phase:1.3},
  {color:'blue',x:86,y:5,rx:70,ry:44,period:18,phase:3.5},
  {color:'indigo',x:10,y:96,rx:64,ry:42,period:23,phase:5.4},
  {color:'violet',x:14,y:7,rx:58,ry:44,period:20,phase:2.8},
];

/** A small raster is enough for these soft fields, without repainting full-size gradients every frame. */
export function Atmosphere(){
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const node=canvas.current!,context=node.getContext('2d');if(!context)return;
    const css=getComputedStyle(node);
    const base=css.getPropertyValue('--canvas').trim();
    const colors=fields.map(field=>css.getPropertyValue(`--gradient-${field.color}`).trim());
    const drift=parseFloat(css.getPropertyValue('--atmosphere-drift'))||10;
    const spread=parseFloat(css.getPropertyValue('--atmosphere-spread'))||0.1;
    let frame=0,last=0,painted=0,elapsed=0;
    const paint=()=>{
      const width=node.width,height=node.height;
      context.fillStyle=base;context.fillRect(0,0,width,height);
      for(let i=fields.length-1;i>=0;i--){
        const field=fields[i],angle=elapsed/1000/field.period*Math.PI*2;
        // Independent rates and a second slow wave keep the drift from reading as a rigid orbit.
        const x=(field.x+drift*(Math.cos(angle+field.phase)-Math.cos(field.phase))
          +drift*.22*(Math.sin(angle*.63+field.phase*1.7)-Math.sin(field.phase*1.7)))/100*width;
        const y=(field.y+drift*.8*(Math.sin(angle*1.13+field.phase)-Math.sin(field.phase))
          +drift*.18*(Math.cos(angle*.81-field.phase*.9)-Math.cos(-field.phase*.9)))/100*height;
        const rx=field.rx/100*width*(1+spread*(Math.sin(angle*.73+field.phase)-Math.sin(field.phase)));
        const ry=field.ry/100*height*(1+spread*(Math.cos(angle*.61+field.phase)-Math.cos(field.phase)));
        context.save();context.translate(x,y);context.scale(rx,ry);
        const gradient=context.createRadialGradient(0,0,0,0,0,1);
        gradient.addColorStop(0,colors[i]);gradient.addColorStop(1,`${colors[i]}00`);
        context.fillStyle=gradient;context.fillRect(-x/rx,-y/ry,width/rx,height/ry);context.restore();
      }
    };
    const resize=()=>{
      const rect=node.getBoundingClientRect();if(!rect.width||!rect.height)return;
      const scale=Math.min(1,512/Math.max(rect.width,rect.height));
      node.width=Math.max(1,Math.round(rect.width*scale));node.height=Math.max(1,Math.round(rect.height*scale));paint();
    };
    const tick=(time:number)=>{
      if(document.hidden)return;
      if(last)elapsed+=Math.min(time-last,100);last=time;
      if(time-painted>=1000/30){paint();painted=time;}
      frame=requestAnimationFrame(tick);
    };
    const visibility=()=>{cancelAnimationFrame(frame);last=0;if(!document.hidden)frame=requestAnimationFrame(tick);};
    resize();const observer=new ResizeObserver(resize);observer.observe(node);
    document.addEventListener('visibilitychange',visibility);visibility();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('visibilitychange',visibility);};
  },[]);
  return <canvas ref={canvas} className="atmosphere" aria-hidden="true"/>;
}
