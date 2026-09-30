import {useHorizontalMediaScroll} from './horizontalMediaScroll';
import {logImageUrl} from './logImageCache';
import {useRef} from 'react';
import {useExperience} from './ExperienceContext';
import type {MediaItem} from './ExperienceContext';
/** Reuse decoded pixels for this opening only, without persisting invite media. */
export function loadedPhotoPreview(image:HTMLImageElement|null){
 if(!image?.complete||!image.naturalWidth||!image.naturalHeight)return undefined;
 try{const scale=Math.min(1,1024/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const context=canvas.getContext('2d');if(!context)return undefined;context.drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/webp',.85);}catch{return undefined;}
}
export interface PostPhoto { id: string; name: string; url: string }
export function PostPhotos({ photos:original, log=false,horizontal=false,onOpen }: { photos: PostPhoto[]; log?:boolean;horizontal?:boolean;onOpen?(items:MediaItem[],index:number):void }) {
  const photos=log?original.map(photo=>({...photo,url:logImageUrl(photo.url)})):original;
  const gallery=useRef<HTMLDivElement>(null),experience=useExperience();
  useHorizontalMediaScroll(gallery,horizontal,photos.length);
  if (!photos.length) return null;
  return <div ref={gallery} className="post-photos" data-count={photos.length}>{photos.map((photo,index) => <a key={photo.id} data-photo-id={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${photo.name}`} onClick={event=>{
    if((!experience&&!onOpen)||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();event.stopPropagation();
    const elements=[...gallery.current!.querySelectorAll('a')];
    const items=photos.map((photo,i)=>{const img=elements[i].querySelector('img');return {...photo,...(i===index?{previewUrl:loadedPhotoPreview(img)}:{}),width:img?.naturalWidth,height:img?.naturalHeight,element:elements[i]};});
    if(onOpen)onOpen(items,index);else experience!.media(items,index);
  }}><img draggable={horizontal?false:undefined} src={photo.url} alt={photo.name} loading="lazy" onError={event => { event.currentTarget.hidden = true; event.currentTarget.parentElement!.classList.add('photo-unavailable'); }} /><span className="photo-missing">Photo unavailable</span></a>)}</div>;
}
