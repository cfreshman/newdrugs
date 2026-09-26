export interface PostPhoto { id: string; name: string; url: string }
export function PostPhotos({ photos }: { photos: PostPhoto[] }) {
  if (!photos.length) return null;
  return <div className="post-photos" data-count={photos.length}>{photos.map(photo => <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${photo.name}`}><img src={photo.url} alt={photo.name} loading="lazy" onError={event => { event.currentTarget.hidden = true; event.currentTarget.parentElement!.classList.add('photo-unavailable'); }} /><span className="photo-missing">Photo unavailable</span></a>)}</div>;
}
