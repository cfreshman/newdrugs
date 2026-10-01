import {z} from 'zod';

export const SQUARE_SIZE=512,MAX_SQUARE_LAYERS=32,MAX_SQUARE_BYTES=8*1024*1024;
export const squareFonts={mono:'Noto Sans Mono',sans:'Noto Sans',serif:'Noto Serif',anton:'Anton',bebas:'Bebas Neue',bungee:'Bungee',caveat:'Caveat',fredoka:'Fredoka',orbitron:'Orbitron',pacifico:'Pacifico',marker:'Permanent Marker',pixel:'Press Start 2P',quicksand:'Quicksand'} as const;
const color=z.string().regex(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i),backing=z.union([color,z.literal('transparent')]);
const asset=z.string().max(MAX_SQUARE_BYTES).regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/);
const crop=z.strictObject({x:z.number().min(0).max(1),y:z.number().min(0).max(1),w:z.number().positive().max(1),h:z.number().positive().max(1)}).refine(c=>c.x+c.w<=1.000001&&c.y+c.h<=1.000001,'Keep the crop inside the image.');
export const squareLayerSchema=z.strictObject({
 id:z.string().min(1).max(80),type:z.enum(['image','shape','text','draw']),x:z.number().min(-4).max(4),y:z.number().min(-4).max(4),w:z.number().min(1/512).max(8),h:z.number().min(1/512).max(8),
 angle:z.number().min(-180).max(180).default(0),opacity:z.number().min(0).max(1).default(1),src:asset.optional(),color:color.default('#000000'),background:backing.default('transparent'),
 oval:z.boolean().default(false),border:z.boolean().default(false),borderColor:color.default('#000000'),borderWidth:z.number().min(1).max(10).default(1),crop:crop.optional(),
 text:z.string().max(1000).default(''),font:z.enum(['mono','sans','serif','anton','bebas','bungee','caveat','fredoka','orbitron','pacifico','marker','pixel','quicksand']).default('mono'),bold:z.boolean().default(false),italic:z.boolean().default(false),align:z.enum(['left','center','right']).default('left'),
 outline:z.boolean().default(false),outlineColor:color.default('#000000'),outlineWidth:z.number().min(1).max(10).default(5),
 shadow:z.boolean().default(false),shadowColor:color.default('#000000'),shadowX:z.number().min(-64).max(64).default(24),shadowY:z.number().min(-64).max(64).default(24),
}).refine(layer=>layer.type!=='image'||Boolean(layer.src),'Choose an image for the layer.');
export const squareProjectSchema=z.strictObject({version:z.literal(1),color,layers:z.array(squareLayerSchema).max(MAX_SQUARE_LAYERS)}).refine(project=>new Set(project.layers.map(layer=>layer.id)).size===project.layers.length,'Layer IDs must be unique.').refine(project=>project.layers.filter(layer=>layer.type==='draw').length<=1,'Use one drawing layer.');
export type SquareLayer=z.infer<typeof squareLayerSchema>;
export type SquareProject=z.infer<typeof squareProjectSchema>;
export const emptySquare=():SquareProject=>({version:1,color:'#ffffff',layers:[]});
export function squareLayer(type:SquareLayer['type'],data:Partial<SquareLayer>={}):SquareLayer{return squareLayerSchema.parse({id:crypto.randomUUID(),type,x:.1,y:.1,w:.5,h:.5,...(type==='text'?{x:.1,y:.4,w:.8,h:.2}:type==='draw'?{x:0,y:0,w:1,h:1}:{}),...data});}
export function squareBytes(project:SquareProject){return new TextEncoder().encode(JSON.stringify(project)).length;}
export function checkSquare(project:SquareProject){if(squareBytes(project)>MAX_SQUARE_BYTES)throw Error('This image is too large to edit. Remove a layer or try a smaller photo.');return project;}
export function parseSquareProject(value:unknown){return checkSquare(squareProjectSchema.parse(value));}

/** Inspect raster headers before asking the browser to decode an imported asset. */
export function rasterDimensions(bytes:Uint8Array){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ascii=(start:number,length:number)=>String.fromCharCode(...bytes.slice(start,start+length));
 if(bytes.length>=24&&bytes[0]===137&&ascii(1,3)==='PNG'&&ascii(12,4)==='IHDR')return {width:view.getUint32(16),height:view.getUint32(20)};
 if(bytes[0]===255&&bytes[1]===216){let offset=2;while(offset+4<=bytes.length){if(bytes[offset]!==255)break;while(bytes[offset]===255)offset++;const marker=bytes[offset++];if(marker===217||marker===218)break;const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7)return {width:view.getUint16(offset+5),height:view.getUint16(offset+3)};offset+=length;}}
 if(bytes.length>=30&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'){
  const kind=ascii(12,4),little24=(offset:number)=>bytes[offset]|bytes[offset+1]<<8|bytes[offset+2]<<16;
  if(kind==='VP8X')return {width:little24(24)+1,height:little24(27)+1};
  if(kind==='VP8 '&&bytes.length>=30)return {width:view.getUint16(26,true)&0x3fff,height:view.getUint16(28,true)&0x3fff};
  if(kind==='VP8L'&&bytes[20]===47){const bits=view.getUint32(21,true);return {width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1};}
 }
 throw Error('Choose a PNG, JPEG or WebP image.');
}
export function checkRaster(bytes:Uint8Array,maxSide=16384,maxPixels=16_000_000){const size=rasterDimensions(bytes);if(!size.width||!size.height||Math.max(size.width,size.height)>maxSide||size.width*size.height>maxPixels)throw Error('This image is too large to edit.');return size;}
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export const movedLayer=(layer:SquareLayer,dx:number,dy:number):SquareLayer=>({...layer,x:clamp(layer.x+dx,-4,4),y:clamp(layer.y+dy,-4,4)});
/** Resize from the northeast corner while keeping the rotated southwest fixed. */
export function resizedLayer(layer:SquareLayer,dx:number,dy:number):SquareLayer{
 const angle=layer.angle*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),localX=c*dx+s*dy,localY=-s*dx+c*dy;
 const scale=clamp(1+(localX*layer.w-localY*layer.h)/(layer.w**2+layer.h**2),Math.max(1/512/layer.w,1/512/layer.h),Math.min(8/layer.w,8/layer.h));
 const w=layer.type==='image'?layer.w*scale:clamp(layer.w+localX,1/512,8),h=layer.type==='image'?layer.h*scale:clamp(layer.h-localY,1/512,8);
 const shiftX=(w-layer.w)/2,shiftY=-(h-layer.h)/2;
 return {...layer,w,h,x:clamp(layer.x+layer.w/2+c*shiftX-s*shiftY-w/2,-4,4),y:clamp(layer.y+layer.h/2+s*shiftX+c*shiftY-h/2,-4,4)};
}
export function croppedLayer(layer:SquareLayer,next:NonNullable<SquareLayer['crop']>):SquareLayer{const prior=layer.crop||{x:0,y:0,w:1,h:1},w=Math.max(1/512,layer.w*next.w/prior.w),h=Math.max(1/512,layer.h*next.h/prior.h);return {...layer,crop:next,w,h,x:layer.x+(layer.w-w)/2,y:layer.y+(layer.h-h)/2};}
export interface SquarePoint {x:number;y:number}
export function transformedLayer(layer:SquareLayer,before:SquarePoint[],after:SquarePoint[]):SquareLayer{
 const midpoint=(points:SquarePoint[])=>({x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2}),distance=(points:SquarePoint[])=>Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y);
 const from=midpoint(before),to=midpoint(after),scale=clamp(distance(after)/Math.max(.005,distance(before)),Math.max(1/512/layer.w,1/512/layer.h),Math.min(8/layer.w,8/layer.h));
 const turn=Math.atan2(after[1].y-after[0].y,after[1].x-after[0].x)-Math.atan2(before[1].y-before[0].y,before[1].x-before[0].x),c=Math.cos(turn),s=Math.sin(turn),dx=layer.x+layer.w/2-from.x,dy=layer.y+layer.h/2-from.y,w=layer.w*scale,h=layer.h*scale;
 const angle=((layer.angle+turn*180/Math.PI+180)%360+360)%360-180;
 return {...layer,w,h,angle,x:clamp(to.x+scale*(c*dx-s*dy)-w/2,-4,4),y:clamp(to.y+scale*(s*dx+c*dy)-h/2,-4,4)};
}
export function squareHit(layer:SquareLayer,point:SquarePoint){const angle=-layer.angle*Math.PI/180,dx=point.x-layer.x-layer.w/2,dy=point.y-layer.y-layer.h/2,x=Math.cos(angle)*dx-Math.sin(angle)*dy,y=Math.sin(angle)*dx+Math.cos(angle)*dy;return Math.abs(x)<=layer.w/2&&Math.abs(y)<=layer.h/2&&(!layer.oval||(x/(layer.w/2))**2+(y/(layer.h/2))**2<=1);}
export function snappedLayer(layer:SquareLayer,pixels:number){const threshold=8/Math.max(1,pixels),centerX=layer.x+layer.w/2,centerY=layer.y+layer.h/2,x=Math.abs(centerX-.5)<threshold,y=Math.abs(centerY-.5)<threshold,quarter=Math.round(layer.angle/90)*90;return {layer:{...layer,x:x?.5-layer.w/2:layer.x,y:y?.5-layer.h/2:layer.y,angle:Math.abs(layer.angle-quarter)<3?quarter:layer.angle},x,y};}
