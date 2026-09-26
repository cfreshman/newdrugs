import { createHash, randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { MAX_UPLOAD_BYTES, type UploadRef } from '../shared/uploads';
import type { Login } from './config';

type Invoke = (name: string, input: unknown, key?: string) => Promise<unknown>;
export async function uploadLocalFile(login: Login, path: string, invoke: Invoke, key: string = randomUUID(), requestId?: string, purpose:'agent_input'|'log_media'='agent_input') {
  if (!path) throw new Error('Choose a file: newdrugs file-upload <path>.');
  const handle = await open(resolve(path), 'r');
  let bytes: Buffer;
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size < 1 || info.size > MAX_UPLOAD_BYTES) throw new Error('Choose a regular file between 1 byte and 12 MB.');
    bytes = Buffer.alloc(info.size + 1);
    let read = 0;
    while (read < bytes.length) { const part = await handle.read(bytes, read, bytes.length - read, read); if (!part.bytesRead) break; read += part.bytesRead; }
    if (read !== info.size) throw new Error('The file changed while it was being read. Try again.');
    bytes = bytes.subarray(0, read);
  } finally { await handle.close(); }
  const prepared = await invoke('files.prepare', { name: basename(path), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), purpose, ...(requestId ? { requestId } : {}) }, key) as { ok: boolean; data: UploadRef };
  if (!prepared.ok || !prepared.data?.uploadUrl) throw new Error('The upload could not be prepared.');
  const url = new URL(prepared.data.uploadUrl, login.url);
  if (url.origin !== new URL(login.url).origin || url.pathname !== `/api/uploads/${prepared.data.id}` || url.username || url.password) throw new Error('The server returned an invalid upload destination.');
  const response = await fetch(url, { method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${login.token}`, 'Content-Type': 'application/octet-stream' }, body: new Uint8Array(bytes) });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(failure.error?.message || `Upload failed (${response.status}). Reuse --key ${key} when retrying.`);
  }
  const verified = await invoke('files.get', { fileId: prepared.data.id }) as { ok: boolean; data: UploadRef };
  if (!verified.ok || !verified.data?.ready) throw new Error('The uploaded file is not ready.');
  return verified;
}
