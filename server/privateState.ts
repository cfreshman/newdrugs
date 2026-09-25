import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config';

let stateKey: Buffer;
function key() {
  if (stateKey) return stateKey;
  const filename = resolve(config.DATA_DIR, 'state.key');
  mkdirSync(config.DATA_DIR, { recursive: true, mode: 0o700 });
  try { stateKey = readFileSync(filename); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const created = randomBytes(32);
    try { writeFileSync(filename, created, { flag: 'wx', mode: 0o600 }); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
    stateKey = readFileSync(filename);
  }
  if (stateKey.length !== 32) throw new Error('Invalid state encryption key.');
  return stateKey;
}
export function seal(value: unknown, identity: string) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), nonce);
  cipher.setAAD(Buffer.from(identity));
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64');
}
export function unseal<T>(value: string, identity: string): T {
  const bytes = Buffer.from(value, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key(), bytes.subarray(0, 12));
  decipher.setAAD(Buffer.from(identity)); decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')) as T;
}
