import { api, operation } from './api';
import { MAX_UPLOAD_BYTES, type UploadPurpose, type UploadRef } from '../shared/uploads';

export async function uploadFile(file: File, purpose: UploadPurpose, signal?: AbortSignal, requestId?: string, prepareKey?: string) {
  if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new Error('Choose a file smaller than 12 MB.');
  const bytes = await file.arrayBuffer();
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
  if (signal?.aborted) throw new DOMException('Upload cancelled', 'AbortError');
  const prepared = await operation<UploadRef>('files.prepare', { name: file.name, bytes: file.size, sha256, purpose, ...(requestId ? { requestId } : {}) },prepareKey?{key:prepareKey}:{});
  const fileRef = await api<UploadRef>(`/uploads/${encodeURIComponent(prepared.id)}`, { method: 'PUT', body: bytes, signal, headers: { 'Content-Type': 'application/octet-stream' } });
  if (!fileRef.ready || fileRef.id !== prepared.id) throw new Error('This upload is not ready yet. Please try again.');
  return fileRef;
}
