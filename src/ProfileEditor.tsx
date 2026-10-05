import {TransientError} from './TransientError';
import {avatarImageUrl} from './logImageCache';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Eye, CameraPlus, PencilSimple, X } from '@phosphor-icons/react';
import type { Profile } from '../shared/types';
import { operation, errorText } from './api';
import { uploadFile } from './uploads';
import { ProfileCard } from './ProfileCard';
import { LocationPicker } from './LocationPicker';
import {profileMediaUrl} from '../shared/profileMedia';
import {LogVoiceRecorder} from './LogVoiceRecorder';
import {AudioPlayer} from './AudioPlayer';
import {usePanelVisible} from './PanelReadiness';

export function ProfileEditor({ person: initial, saved }: { person: Profile; saved(): Promise<void> }) {
  const visible=usePanelVisible();
  const [person, setPerson] = useState(initial), [interests, setInterests] = useState(initial.interests.join(', '));
  const [preview, setPreview] = useState(false), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false),[recording,setRecording]=useState(false), [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const stagedVoice=useRef<string|null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const photos = person.photos || [];
  const deletionKeys = useRef(new Map<string, string>());
  const remove = async (id: string) => {
    setBusy(true); setError(''); if (!deletionKeys.current.has(id)) deletionKeys.current.set(id, crypto.randomUUID());
    try { await operation('files.delete', { fileId: id }, { confirmed: true, key: deletionKeys.current.get(id) }); setPerson(current => ({ ...current, photos: current.photos?.filter(photo => photo !== id) })); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  };
  const upload = async (selected: File[]) => {
    if (!selected.length) return;
    if (selected.length + photos.length > 6) { setError('Choose up to six photos.'); return; }
    const control = new AbortController(); controller.current = control; setUploading(true); setError('');
    try {
      for (const file of selected) {
        const uploaded = await uploadFile(file, 'profile_photo', control.signal);
        if (control.signal.aborted) return;
        setPerson(current => ({ ...current, photos: [...(current.photos || []), uploaded.id] }));
      }
    } catch (e) { if (!control.signal.aborted) setError(errorText(e)); }
    finally { if (!control.signal.aborted) setUploading(false); }
  };
  const addVoice=async(file:File)=>{setUploading(true);setError('');try{const uploaded=await uploadFile(file,'profile_voice');stagedVoice.current=uploaded.id;setPerson(current=>({...current,voiceFileId:uploaded.id}));}catch(cause){setError(errorText(cause));}finally{setUploading(false);}};
  const removeVoice=()=>{const id=person.voiceFileId;if(id&&stagedVoice.current===id){stagedVoice.current=null;void operation('files.discard',{fileId:id}).catch(()=>{});}setPerson(current=>({...current,voiceFileId:undefined}));};
  const move = (index: number, direction: number) => {
    const next = [...photos]; [next[index], next[index + direction]] = [next[index + direction], next[index]];
    setPerson({ ...person, photos: next });
  };
  const interestsList = () => [...new Set(interests.split(',').map(value => value.trim()).filter(Boolean))];
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await operation<Profile>('profile.update', { name: person.name.trim(), bio: person.bio, interests: interestsList(),
        locationCell: person.area?.cell || null, photos, discoverable: person.discoverable,mediaUrl:person.mediaUrl?.trim()?profileMediaUrl(person.mediaUrl):null,voiceFileId:person.voiceFileId||null });
      await saved();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  return <>
    <div className="profile-editor-actions"><span className="quiet">@{person.handle}</span><button type="button" className="text-link" aria-pressed={preview} onClick={() => setPreview(value => !value)}>{preview ? <PencilSimple size={17} /> : <Eye size={17} />}{preview ? 'Edit profile' : 'Preview profile'}</button></div>
    {preview ? <><ProfileCard person={{ ...person, interests: interestsList() }} />{!person.discoverable && <p className="quiet small">Your profile is currently private. This is how it will look when you share it.</p>}</> : <form className="fields" onSubmit={save}>
      <fieldset className="profile-photos"><legend>Photos</legend>
        <div className="photo-editor-grid">{photos.map((id, index) => <div className="photo-editor-item" key={id}>
          <img src={avatarImageUrl(id)} alt={`Profile photo ${index + 1}`} />
          <button className="photo-remove" type="button" aria-label={`Delete photo ${index + 1}`} disabled={uploading || busy} onClick={() => void remove(id)}><X size={16} /></button>
          <div className="photo-order"><button type="button" disabled={index === 0 || uploading} aria-label={`Move photo ${index + 1} earlier`} onClick={() => move(index, -1)}><ArrowLeft size={16} /></button><span>{index === 0 ? 'Main' : index + 1}</span><button type="button" disabled={index === photos.length - 1 || uploading} aria-label={`Move photo ${index + 1} later`} onClick={() => move(index, 1)}><ArrowRight size={16} /></button></div>
        </div>)}</div>
        <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" tabIndex={-1} aria-label="Choose profile photos" onChange={event => { const selected = Array.from(event.target.files || []); event.target.value = ''; void upload(selected); }} />
        <button className="photo-add text-action" type="button" disabled={uploading || photos.length >= 6} onClick={() => picker.current?.click()}><CameraPlus size={20} />{uploading ? 'Uploading photos…' : 'Add photos'}</button>
        <p className="quiet small">Up to six photos. JPEG, PNG or WebP, 12 MB each.</p>
      </fieldset>
      <label>Name<input value={person.name} maxLength={80} onChange={event => setPerson({ ...person, name: event.target.value })} autoComplete="given-name" /></label>
      <LocationPicker value={person.area || null} onChange={area => setPerson(current => ({ ...current, area, city: area?.label || '' }))} />
      <label>About you<textarea value={person.bio} maxLength={500} rows={3} onChange={event => setPerson({ ...person, bio: event.target.value })} /></label>
      <label>Interests<input value={interests} placeholder="Separate with commas" onChange={event => setInterests(event.target.value)} /></label>
      <section className="profile-voice-editor"><h3>Voice note</h3>{person.voiceFileId?<div className="log-voice-row"><AudioPlayer src={`/api/files/${encodeURIComponent(person.voiceFileId)}`} active={visible} voiceNote editor/><button type="button" disabled={busy||uploading} onClick={removeVoice}>Remove</button></div>:<LogVoiceRecorder add={addVoice} error={setError} disabled={busy||uploading} change={setRecording} uploadHint={false}/>}</section>
      <label>Media link<input type="url" inputMode="url" placeholder="Spotify, Apple Music, SoundCloud, Bandcamp or YouTube" maxLength={2048} value={person.mediaUrl||''} onChange={event=>setPerson({...person,mediaUrl:event.target.value})}/></label>
      <label className="check-label"><input type="checkbox" checked={person.discoverable} onChange={event => setPerson({ ...person, discoverable: event.target.checked })} />Make my profile discoverable</label>
      <p className="quiet small">Turn this on to appear nearby. Public posts show your name and first photo.</p>
      <button className="solid" disabled={busy || uploading||recording}>{busy ? 'Saving…' : 'Save profile'}</button>
    </form>}
    {error && <TransientError className="error" role="alert">{error}</TransientError>}
  </>;
}
