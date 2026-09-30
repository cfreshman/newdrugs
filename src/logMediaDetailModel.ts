import type {LogEntry} from '../shared/log';

export type LogMediaContributor=LogEntry['contributors'][number];
export interface LogMediaSource {id:string;title:string;contributors:LogMediaContributor[];coverId?:string}
export interface LogMediaEntry {key:string;contributor:LogMediaContributor;file?:LogMediaContributor['files'][number]}

/** Visuals keep their strip order; people with only a note/voice note remain reachable. */
export function logMediaEntries(source:LogMediaSource):LogMediaEntry[]{
 const visuals=source.contributors.flatMap(contributor=>contributor.files.filter(file=>/^(image|video)\//.test(file.mime)).map(file=>({key:file.id,contributor,file})));
 visuals.sort((a,b)=>Number(b.key===source.coverId)-Number(a.key===source.coverId));
 const notes=source.contributors.filter(person=>!person.files.some(file=>/^(image|video)\//.test(file.mime))&&(person.note.trim()||person.files.some(file=>file.mime.startsWith('audio/')))).map(contributor=>({key:`note:${contributor.userId}`,contributor}));
 return [...visuals,...notes];
}

export interface LogImageTransform {scale:number;x:number;y:number}
export interface LogImageSize {width:number;height:number}
export const logImageBase:LogImageTransform={scale:1,x:0,y:0};
const clamp=(value:number,max:number)=>Math.max(-max,Math.min(max,value));
export function boundLogImage(transform:LogImageTransform,image:LogImageSize,frame:LogImageSize):LogImageTransform{
 const scale=Math.max(1,Math.min(4,transform.scale));
 if(!image.width||!image.height||!frame.width||!frame.height)return {...logImageBase,scale};
 const fit=Math.min(frame.width/image.width,frame.height/image.height);
 return {scale,x:clamp(transform.x,Math.max(0,(image.width*fit*scale-frame.width)/2)),y:clamp(transform.y,Math.max(0,(image.height*fit*scale-frame.height)/2))};
}
/** Keep the image point under the moving pinch midpoint, using contained image bounds. */
export function pinchLogImage(current:LogImageTransform,scale:number,from:{x:number;y:number},to:{x:number;y:number},image:LogImageSize,frame:LogImageSize){
 const next=Math.max(1,Math.min(4,scale)),ratio=next/current.scale;
 return boundLogImage({scale:next,x:to.x-(from.x-current.x)*ratio,y:to.y-(from.y-current.y)*ratio},image,frame);
}
