import {LocationLabel} from './LocationLabel';
import { useState } from 'react';
import type { Profile } from '../shared/types';
import { ArrowUp } from '@phosphor-icons/react';

/** The public person view and the editor preview deliberately share this renderer. */
export function ProfileCard({ person }: { person: Profile }) {
  const [photo, setPhoto] = useState(0);
  const photos = person.photos || [];
  const selected = Math.min(photo, Math.max(0, photos.length - 1));
  return <article className="profile-card">
    {photos.length > 0 && <div className="profile-gallery">
      <img className="profile-photo" src={`/api/files/${encodeURIComponent(photos[selected])}`} alt={`Photo ${selected + 1} of ${person.name || person.handle || 'this person'}`} />
      {photos.length > 1 && <div className="profile-thumbnails" aria-label="Profile photos">{photos.map((id, index) => <button type="button" key={id} aria-label={`Photo ${index + 1}${selected === index ? ', currently displayed' : ''}`} aria-pressed={selected === index} onClick={() => setPhoto(index)}>{selected === index ? <ArrowUp size={21} weight="bold" aria-hidden="true" /> : <img src={`/api/files/${encodeURIComponent(id)}`} alt="" />}</button>)}</div>}
    </div>}
    {(person.name||person.handle)&&<div className="profile-identity">{person.name&&<h3>{person.name}</h3>}{person.handle&&<span className="profile-handle">@{person.handle}</span>}</div>}
    {person.area?.label && <p className="quiet small"><LocationLabel label={person.area.label}/></p>}
    {person.bio && <p className="profile-bio">{person.bio}</p>}
    {person.interests.length > 0 && <ul className="profile-interests">{person.interests.map(interest => <li key={interest}>{interest}</li>)}</ul>}
  </article>;
}
