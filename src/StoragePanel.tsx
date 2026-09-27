import {DeleteConfirmation} from './DeleteConfirmation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { File, Trash, CircleNotch } from '@phosphor-icons/react';
import {storageTypes,storageLocations,type StorageLocation,type StorageType,type StoredFile,type StoragePage} from '../shared/storage';
import type {Destination} from '../shared/navigation';
import { errorText, operation } from './api';
import { useRecordRefresh } from './useRecordRefresh';

const size = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
export function StoragePanel({navigate}:{navigate(destination:Destination):void}) {
  const [expanded,setExpanded]=useState<string|null>(null);
  const [attachedTo,setAttachedTo]=useState<StorageLocation>('all'),[type,setType]=useState<StorageType>('all'),[loading,setLoading]=useState(false);
  const [storage, setStorage] = useState<StoragePage | null>(null), [review, setReview] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0), keys = useRef(new Map<string, string>());
  const loadedFilter=useRef('');
  const waitingForFiles=!storage||loadedFilter.current!==`${attachedTo}:${type}`;
  const load = useCallback(async (before?: string) => {
    const request = ++generation.current;setLoading(true);
    try { const next = await operation<StoragePage>('storage.list', {type,attachedTo,...(before?{before}:{})}); if (request === generation.current) { loadedFilter.current=`${attachedTo}:${type}`;setStorage(previous => before && previous ? { ...next, items: [...previous.items, ...next.items] } : next); setError(''); } }
    catch (error) { if (request === generation.current) setError(errorText(error)); }
    finally {if(request===generation.current)setLoading(false);}
  }, [type,attachedTo]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]); useRecordRefresh(['storage','posts','log','chat_history'], load);
  const remove = async (file: StoredFile) => {
    setBusy(true); if (!keys.current.has(file.id)) keys.current.set(file.id, crypto.randomUUID());
    try { await operation('files.delete', { fileId: file.id }, { key: keys.current.get(file.id), confirmed: true }); setReview(null); await load(); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  };
  return <><div className="storage-summary"><p className="storage-total">{storage?<><strong>{storage.usedBytes ? size(storage.usedBytes) : '0 MB'}</strong> of {size(storage.limitBytes)}</>:<span className="quiet">Loading storage…</span>}</p><progress className="storage-meter" max={storage?.limitBytes||1} value={storage?.usedBytes} aria-label="Storage used" /></div><div className="storage-filters"><nav className="view-tabs storage-types" aria-label="Attachment locations">{storageLocations.map(value=><button key={value} type="button" disabled={busy} aria-pressed={attachedTo===value} onClick={()=>{if(attachedTo!==value){generation.current++;setAttachedTo(value);setLoading(true);setExpanded(null);setReview(null);setError('');}}}>{({all:'All',hangouts:'Hangouts',profile:'Profile',posts:'Posts',chat:'Chat'})[value]}</button>)}</nav><nav className="view-tabs storage-types" aria-label="File types">{storageTypes.map(value=><button key={value} type="button" disabled={busy} aria-pressed={type===value} onClick={()=>{if(type!==value){generation.current++;setType(value);setLoading(true);setExpanded(null);setReview(null);setError('');}}}>{({all:'All',images:'Images',audio:'Audio',video:'Video',documents:'Documents'})[value]}</button>)}</nav></div><div className="storage-results" aria-busy={waitingForFiles&&loading}>{waitingForFiles&&loading&&<div className="storage-loading" role="status" aria-label="Loading files"><CircleNotch size={22} className="spin"/></div>}<div style={waitingForFiles?{visibility:'hidden'}:undefined} inert={waitingForFiles}>{storage && <>
    <ul className="storage-list">{storage.items.map(file => <li key={file.id}><div className="storage-row">{file.ready && file.mime.startsWith('image/') ? <img src={`/api/files/${encodeURIComponent(file.id)}`} alt="" /> : <File size={32} />}<div className="storage-file">{file.ready ? <a href={`/api/files/${encodeURIComponent(file.id)}`} target="_blank" rel="noopener noreferrer">{file.name}</a> : <span>{file.name}</span>}<span className="quiet small">{size(file.bytes)} · {file.inProfile ? 'Profile photo' : file.attached ? file.purpose==='log_media'?'Log attachment':'Attached file' : 'Unattached'}</span>{file.attachments?.length>0&&<div className="storage-attachments">{file.attachments.length>1&&<button type="button" aria-expanded={expanded===file.id} aria-controls={`storage-places-${file.id}`} onClick={()=>setExpanded(previous=>previous===file.id?null:file.id)}>{file.attachments.length} attachments</button>}{(file.attachments.length===1||expanded===file.id)&&<div className={file.attachments.length>1?'storage-places':undefined} id={`storage-places-${file.id}`}>{file.attachments.map(attachment=><a key={attachment.url} href={attachment.url} onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigate(attachment.destination);}}}>{attachment.label}</a>)}</div>}</div>}</div><button type="button" className="storage-delete" aria-label={`Delete ${file.name}`} disabled={busy} onClick={() => setReview(review === file.id ? null : file.id)}><Trash size={20} /></button></div>
      {review === file.id && <DeleteConfirmation title={`Delete ${file.name}?`} detail={file.inProfile?'It will also be removed from your profile.':file.attached?'It will be removed from any attached posts or Log entries, and previous chat links will stop working.':'This can’t be undone.'} confirmLabel="Delete file" busy={busy} onCancel={()=>setReview(null)} onConfirm={()=>remove(file)}/>}
    </li>)}</ul>{!storage.items.length && <p className="quiet">{type==='all'&&attachedTo==='all'?'No stored files.':'No matching files.'}</p>}{storage.nextCursor && <button className="text-link" disabled={loading} onClick={() => void load(storage.nextCursor!)}>{loading?'Loading…':'More files'}</button>}</>}</div></div>{error && <p className="error" role="alert">{error}</p>}</>;
}
