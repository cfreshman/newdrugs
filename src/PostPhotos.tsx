import {useRef} from 'react';
import {useExperience} from './ExperienceContext';
export interface PostPhoto { id: string; name: string; url: string }
export function PostPhotos({ photos }: { photos: PostPhoto[] }) {
  const gallery=useRef<HTMLDivElement>(null),experience=useExperience();
  if (!photos.length) return null;
  return <div ref={gallery} className="post-photos" data-count={photos.length}>{photos.map((photo,index) => <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${photo.name}`} onClick={event=>{
    if(!experience||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();event.stopPropagation();
    const elements=[...gallery.current!.querySelectorAll('a')];
    experience.media(photos.map((photo,i)=>{const img=elements[i].querySelector('img');return {...photo,width:img?.naturalWidth,height:img?.naturalHeight,element:elements[i]};}),index);
  }}><img src={photo.url} alt={photo.name} loading="lazy" onError={event => { event.currentTarget.hidden = true; event.currentTarget.parentElement!.classList.add('photo-unavailable'); }} /><span className="photo-missing">Photo unavailable</span></a>)}</div>;
}
