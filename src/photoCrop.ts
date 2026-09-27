export interface PhotoSize {width:number;height:number}
export interface SquareCrop {x:number;y:number;size:number}
export interface CropPoint {x:number;y:number}
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export function boundCrop(image:PhotoSize,crop:SquareCrop):SquareCrop{
 const edge=Math.min(image.width,image.height),size=clamp(crop.size,edge/6,edge);
 return {size,x:clamp(crop.x,0,image.width-size),y:clamp(crop.y,0,image.height-size)};
}
export function centeredCrop(image:PhotoSize):SquareCrop{const size=Math.min(image.width,image.height);return {x:(image.width-size)/2,y:(image.height-size)/2,size};}
/** Keep the source point under the fingers stationary while their midpoint moves. */
export function moveCrop(image:PhotoSize,crop:SquareCrop,size:number,from:CropPoint,to:CropPoint):SquareCrop{
 const nextSize=clamp(size,Math.min(image.width,image.height)/6,Math.min(image.width,image.height));
 return boundCrop(image,{size:nextSize,x:crop.x+from.x*crop.size-to.x*nextSize,y:crop.y+from.y*crop.size-to.y*nextSize});
}
export function zoomCrop(image:PhotoSize,crop:SquareCrop,zoom:number,point:CropPoint={x:.5,y:.5}):SquareCrop{return moveCrop(image,crop,Math.min(image.width,image.height)/clamp(zoom,1,6),point,point);}
export async function croppedPhoto(image:HTMLImageElement,crop:SquareCrop,originalName:string):Promise<File>{
 const canvas=document.createElement('canvas'),size=Math.max(1,Math.min(512,Math.floor(crop.size)));canvas.width=size;canvas.height=size;
 const context=canvas.getContext('2d');if(!context)throw Error('Photo editing is unavailable in this browser.');
 context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
 context.drawImage(image,crop.x,crop.y,crop.size,crop.size,0,0,size,size);
 const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Could not prepare this photo. Try again.')),'image/webp',.9));
 return new File([blob],`${originalName.replace(/\.[^.]+$/,'')||'Photo'}.${blob.type==='image/webp'?'webp':'png'}`,{type:blob.type});
}
