import { useCallback, useEffect, useRef, useState } from 'react';
import { File, Trash } from '@phosphor-icons/react';
import type { UploadRef } from '../shared/uploads';
import { errorText, operation } from './api';
import { useRecordRefresh } from './useRecordRefresh';
import { usePanelLoading } from './PanelReadiness';

interface StoredFile extends UploadRef { createdAt: string; attached: boolean; inProfile: boolean }
interface Storage { usedBytes: number; limitBytes: number; items: StoredFile[]; nextCursor: string | null }
const size = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
export function StoragePanel() {
  const [storage, setStorage] = useState<Storage | null>(null), [review, setReview] = useState<string | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0), keys = useRef(new Map<string, string>());
  usePanelLoading(!storage && !error);
  const load = useCallback(async (before?: string) => {
    const request = ++generation.current;
    try { const next = await operation<Storage>('storage.list', before ? { before } : {}); if (request === generation.current) { setStorage(previous => before && previous ? { ...next, items: [...previous.items, ...next.items] } : next); setError(''); } }
    catch (error) { if (request === generation.current) setError(errorText(error)); }
  }, []);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]); useRecordRefresh(['storage'], load);
  const remove = async (file: StoredFile) => {
    setBusy(true); if (!keys.current.has(file.id)) keys.current.set(file.id, crypto.randomUUID());
    try { await operation('files.delete', { fileId: file.id }, { key: keys.current.get(file.id), confirmed: true }); setReview(null); await load(); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  };
  return <>{storage && <><p className="storage-total"><strong>{storage.usedBytes ? size(storage.usedBytes) : '0 MB'}</strong> of {size(storage.limitBytes)}</p><progress className="storage-meter" max={storage.limitBytes} value={storage.usedBytes} aria-label="Storage used" /><p className="quiet small">Images are reduced to a 512px shorter side. Smaller images stay their original size.</p>
    <ul className="storage-list">{storage.items.map(file => <li key={file.id}><div className="storage-row">{file.ready && file.mime.startsWith('image/') ? <img src={`/api/files/${encodeURIComponent(file.id)}`} alt="" /> : <File size={32} />}<div className="storage-file">{file.ready ? <a href={`/api/files/${encodeURIComponent(file.id)}`} target="_blank" rel="noopener noreferrer">{file.name}</a> : <span>{file.name}</span>}<span className="quiet small">{size(file.bytes)} · {file.inProfile ? 'Profile photo' : file.attached ? 'Chat attachment' : 'Unattached'}</span></div><button type="button" className="storage-delete" aria-label={`Delete ${file.name}`} disabled={busy} onClick={() => setReview(review === file.id ? null : file.id)}><Trash size={20} /></button></div>
      {review === file.id && <div className="fields storage-review"><p className="small">Delete {file.name}? {file.inProfile ? 'It will also be removed from your profile.' : file.attached ? 'It will no longer open from previous chats.' : ''}</p><div className="review-buttons"><button disabled={busy} onClick={() => setReview(null)}>Keep file</button><button disabled={busy} onClick={() => void remove(file)}>Delete permanently</button></div></div>}
    </li>)}</ul>{!storage.items.length && <p className="quiet">No stored files.</p>}{storage.nextCursor && <button className="text-link" onClick={() => void load(storage.nextCursor!)}>More files</button>}</>}{error && <p className="error" role="alert">{error}</p>}</>;
}
