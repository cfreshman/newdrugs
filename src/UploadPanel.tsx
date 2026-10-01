import { useEffect, useRef, useState } from 'react';
import { X } from '@phosphor-icons/react';
import type { UploadRef } from '../shared/uploads';
import { uploadFile } from './uploads';
import { errorText, operation } from './api';

export function UploadPanel({ requestId, submit }: { requestId?: string; submit(files: UploadRef[]): Promise<void> }) {
  const [files, setFiles] = useState<UploadRef[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const choose = async (selected: File[]) => {
    if (!selected.length) return;
    if (selected.length + files.length > 5) { setError('Choose up to five files.'); return; }
    const control = new AbortController(); controller.current = control; setBusy(true); setError('');
    try { for (const file of selected) { const result = await uploadFile(file, 'agent_input', control.signal, requestId); if (control.signal.aborted) return; setFiles(previous => [...previous, result]); } }
    catch (error) { if (!control.signal.aborted) setError(errorText(error)); }
    finally { if (!control.signal.aborted) setBusy(false); }
  };
  const remove = async (file: UploadRef) => {
    try { await operation('files.discard', { fileId: file.id }); setFiles(previous => previous.filter(candidate => candidate.id !== file.id)); }
    catch (error) { setError(errorText(error)); }
  };
  return <div className="fields">
    <label>Files<input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf,.txt,.md,.csv,.json,.jsonl,.log" disabled={busy} onChange={event => { const selected = Array.from(event.target.files || []); event.target.value = ''; void choose(selected); }} /></label>
    <p className="quiet small">Images, PDFs, or text files. Up to five files, 12 MB each.</p>
    <ul className="upload-list">{files.map(file => <li key={file.id}><span>{file.originalName??file.name}<small>{Math.ceil(file.bytes / 1024)} KB</small></span><button type="button" aria-label={`Remove ${file.originalName??file.name}`} onClick={() => void remove(file)}><X size={18} /></button></li>)}</ul>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="solid" disabled={busy || !files.length} onClick={async () => { setBusy(true); setError(''); try { await submit(files); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } }}>{busy ? 'Uploading…' : requestId ? 'Use these files' : 'Attach to message'}</button>
  </div>;
}
