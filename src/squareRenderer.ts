import {SQUARE_SIZE,squareFonts,checkRaster,type SquareLayer,type SquareProject} from './squareModel';
import {ensureSquareFonts} from './squareFonts';

export interface TextLayout {size:number;lines:string[]}
function context(canvas:HTMLCanvasElement){const result=canvas.getContext('2d');if(!result)throw Error('Image editing is unavailable in this browser.');return result;}
function font(layer:SquareLayer,size:number){return `${layer.italic?'italic ':''}${layer.bold?'700':'400'} ${size}px "${squareFonts[layer.font]}", "Noto Color Emoji", ${layer.font==='mono'?'monospace':layer.font==='serif'?'serif':'sans-serif'}`;}
function wrap(ctx:CanvasRenderingContext2D,text:string,width:number){
 const lines:string[]=[];
 for(const paragraph of text.split('\n')){let line='';for(const word of paragraph.split(/(\s+)/)){if(line&&ctx.measureText(line+word).width>width){lines.push(line.trimEnd());line='';}if(ctx.measureText(word).width<=width){line+=word;continue;}for(const char of word){if(line&&ctx.measureText(line+char).width>width){lines.push(line);line='';}line+=char;}}lines.push(line.trimEnd());}
 return lines;
}

/** One renderer for the editor and the approved image, without a remote script. */
export interface SquarePainterPlatform {createCanvas():HTMLCanvasElement;image(src:string):Promise<HTMLImageElement>;fonts(faces:string[]):Promise<void>}
export class SquarePainter {
 private images=new Map<string,Promise<HTMLImageElement>>();
 private layouts=new Map<string,TextLayout>();
 private bitmap:HTMLCanvasElement|null=null;
 constructor(private readonly platform?:SquarePainterPlatform){}
 private createCanvas(){return this.platform?.createCanvas()||document.createElement('canvas');}
 async image(src:string){let promise=this.images.get(src);if(!promise){promise=this.platform?.image(src)||new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Could not open this image. Try another photo.'));image.src=src;});this.images.set(src,promise);if(this.images.size>32)this.images.delete(this.images.keys().next().value!);}return promise;}
 async prepare(project:SquareProject){const result=new Map<string,HTMLImageElement>(),fonts=new Set(project.layers.filter(layer=>layer.type==='text').map(layer=>font(layer,16))),fontReady=fonts.size?this.platform?this.platform.fonts([...fonts]):ensureSquareFonts().then(()=>Promise.all([...fonts].map(value=>document.fonts?.load(value,'New Drugs'))).then(()=>{})):Promise.resolve();await Promise.all([fontReady,...project.layers.filter(layer=>layer.src).map(async layer=>result.set(layer.src!,await this.image(layer.src!)))]);if(fonts.size)this.layouts.clear();return result;}
 layoutText(layer:SquareLayer){this.bitmap ||= this.createCanvas();return this.text(context(this.bitmap),layer,layer.w*SQUARE_SIZE,layer.h*SQUARE_SIZE);}
 private text(ctx:CanvasRenderingContext2D,layer:SquareLayer,width:number,height:number){
  const key=JSON.stringify([layer.text,layer.font,layer.bold,layer.italic,width,height]);let result=this.layouts.get(key);if(result)return result;
  let low=1,high=Math.min(2048,Math.max(1,height/1.1)),lines:string[]=[''];
  for(let step=0;step<12;step++){const size=(low+high)/2;ctx.font=font(layer,size);const wrapped=wrap(ctx,layer.text,width);if(wrapped.length*size*1.1<=height){low=size;lines=wrapped;}else high=size;}
  ctx.font=font(layer,low);result={size:low,lines:wrap(ctx,layer.text,width)};this.layouts.set(key,result);if(this.layouts.size>96)this.layouts.delete(this.layouts.keys().next().value!);return result;
 }
 paint(canvas:HTMLCanvasElement,project:SquareProject,images:Map<string,HTMLImageElement>,drawing?:{id:string;canvas:HTMLCanvasElement}){
  canvas.width=canvas.height=SQUARE_SIZE;const ctx=context(canvas);ctx.clearRect(0,0,SQUARE_SIZE,SQUARE_SIZE);
  ctx.fillStyle=project.color;ctx.fillRect(0,0,SQUARE_SIZE,SQUARE_SIZE);
  const shadowPad=64;this.bitmap ||= this.createCanvas();const bitmap=this.bitmap;bitmap.width=bitmap.height=SQUARE_SIZE+2*shadowPad;const layerContext=context(bitmap);
  for(const layer of project.layers){
   layerContext.clearRect(0,0,bitmap.width,bitmap.height);layerContext.save();layerContext.translate(shadowPad+(layer.x+layer.w/2)*SQUARE_SIZE,shadowPad+(layer.y+layer.h/2)*SQUARE_SIZE);layerContext.rotate(layer.angle*Math.PI/180);
   const width=layer.w*SQUARE_SIZE,height=layer.h*SQUARE_SIZE,left=-width/2,top=-height/2;
   const path=()=>{layerContext.beginPath();if(layer.oval)layerContext.ellipse(0,0,width/2,height/2,0,0,Math.PI*2);else layerContext.rect(left,top,width,height);};
   if(layer.type==='shape'||layer.type!=='text'&&layer.background!=='transparent'){layerContext.fillStyle=layer.type==='shape'?layer.color:layer.background;path();layerContext.fill();}
   if(layer.type==='image'||layer.type==='draw'){
    const image=layer.id===drawing?.id?drawing.canvas:layer.src?images.get(layer.src):undefined;
    if(image){layerContext.save();path();layerContext.clip();const region=layer.crop||{x:0,y:0,w:1,h:1},browserImage=typeof HTMLImageElement!=='undefined'&&image instanceof HTMLImageElement,sourceWidth=browserImage?image.naturalWidth:image.width,sourceHeight=browserImage?image.naturalHeight:image.height;layerContext.imageSmoothingEnabled=true;layerContext.imageSmoothingQuality='high';layerContext.drawImage(image,region.x*sourceWidth,region.y*sourceHeight,region.w*sourceWidth,region.h*sourceHeight,left,top,width,height);layerContext.restore();}
   }else if(layer.type==='text'&&layer.text){
    const layout=this.text(layerContext,layer,width,height);layerContext.font=font(layer,layout.size);layerContext.textBaseline='alphabetic';layerContext.textAlign=layer.align;layerContext.fillStyle=layer.color;
    const first=layerContext.measureText(layout.lines[0]||'M'),last=layerContext.measureText(layout.lines.at(-1)||'M'),ascent=first.actualBoundingBoxAscent||layout.size*.8,descent=last.actualBoundingBoxDescent||layout.size*.2,lineHeight=layout.size*1.1;
    const x=layer.align==='left'?left:layer.align==='right'?width/2:0,y=(ascent-(layout.lines.length-1)*lineHeight-descent)/2;
    layout.lines.forEach((line,index)=>{const baseline=y+index*lineHeight;if(line&&layer.background!=='transparent'){const measured=layerContext.measureText(line),left=layer.align==='left'?x:layer.align==='right'?x-measured.width:x-measured.width/2;layerContext.fillStyle=layer.background;layerContext.fillRect(left,baseline-layout.size*.8,measured.width,lineHeight);layerContext.fillStyle=layer.color;}if(layer.outline){layerContext.strokeStyle=layer.outlineColor;layerContext.lineWidth=layout.size*layer.outlineWidth/100;layerContext.lineJoin='round';layerContext.strokeText(line,x,baseline);}layerContext.fillText(line,x,baseline);});
   }
   if(layer.border){path();layerContext.strokeStyle=layer.borderColor;layerContext.lineWidth=layer.borderWidth;layerContext.stroke();}
   layerContext.restore();ctx.save();ctx.globalAlpha=layer.opacity;if(layer.shadow){ctx.shadowColor=layer.shadowColor;ctx.shadowOffsetX=layer.shadowX;ctx.shadowOffsetY=layer.shadowY;}ctx.drawImage(bitmap,-shadowPad,-shadowPad);ctx.restore();
  }
 }
 dispose(){this.images.clear();this.layouts.clear();this.bitmap=null;}
}

export async function squareImage(file:File){
 if(!file.size||file.size>12*1024*1024)throw Error('Choose an image smaller than 12 MB.');
 checkRaster(new Uint8Array(await file.arrayBuffer()));const url=URL.createObjectURL(file);
 try{const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const value=new Image();value.onload=()=>resolve(value);value.onerror=()=>reject(Error('Could not open this photo. Try a PNG, JPEG or WebP image.'));value.src=url;});const scale=Math.min(1,SQUARE_SIZE/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const ctx=context(canvas);ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,canvas.width,canvas.height);return {src:canvas.toDataURL('image/png'),aspect:canvas.width/canvas.height};}finally{URL.revokeObjectURL(url);}
}
export async function madeSquare(project:SquareProject,painter:SquarePainter){
 await document.fonts?.ready;const canvas=document.createElement('canvas');painter.paint(canvas,project,await painter.prepare(project));
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Could not prepare this image. Try again.')),'image/png'));
 return new File([blob],'Made image.png',{type:'image/png'});
}
