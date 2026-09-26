import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import ipaddr from 'ipaddr.js';

export function publicAddress(address: string) {
  try {
    const ip = ipaddr.process(address);
    // Exclude private, loopback, mapped private, transition and special-use ranges.
    return ip.range() === 'unicast' && (ip.kind() === 'ipv4' || (ip.toByteArray()[0] & 0xe0) === 0x20);
  } catch { return false; }
}
export function publicUrl(value: string) {
  const url = new URL(value);
  if (value.length > 2048 || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error('Unsupported preview URL.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host.includes('.') && !host.includes(':') || /(^|\.)(localhost|local|internal|test|invalid)$/.test(host) || (ipaddr.isValid(host) && !publicAddress(host))) throw new Error('Non-public preview URL.');
  url.hash = '';
  return url;
}

/** DNS is validated at every redirect and pinned to the actual socket lookup. */
export async function fetchPublic(value: string, kind: 'page' | 'image' | 'preview' | 'manifest' | 'text', signal: AbortSignal, redirects = 0): Promise<{ bytes: Buffer; url: string; mime: string }> {
  if (redirects > 3) throw new Error('Too many redirects.');
  const url = publicUrl(value), hostname = url.hostname.replace(/^\[|\]$/g, '');
  const answers = await Promise.race([lookup(hostname, { all: true }), new Promise<never>((_, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  })]);
  signal.throwIfAborted();
  if (!answers.length || answers.some(answer => !publicAddress(answer.address))) throw new Error('Non-public preview address.');
  const picked = answers.find(answer => answer.family === 4) || answers[0];
  const limit=kind==='text'?256*1024:['page','manifest'].includes(kind)?1024*1024:5*1024*1024;
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      agent: false, signal, family: picked.family,
      lookup: (_host, options, callback) => { if (options.all) callback(null, [picked]); else callback(null, picked.address, picked.family); },
      headers: { 'User-Agent': 'NewDrugs-LinkPreview/1.0 (+https://druggie.org)', Accept: kind === 'page' ? 'text/html,application/xhtml+xml' : kind==='manifest'?'application/json,text/plain,application/octet-stream':kind==='text'?'text/plain,text/markdown':kind==='preview'?'text/html,application/xhtml+xml,image/*':'image/*', 'Accept-Encoding': 'identity' },
    }, response => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.destroy();
        try { resolve(fetchPublic(new URL(response.headers.location, url).href, kind, signal, redirects + 1)); } catch (error) { reject(error); }
        return;
      }
      const mime = (response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const html=['text/html','application/xhtml+xml'].includes(mime),image=['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(mime);
      const allowed=kind==='manifest'?(/(?:^|[+/])json$/.test(mime)||['text/plain','application/octet-stream','application/muse','application/cif','application/pops'].includes(mime)):kind==='text'?['text/plain','text/markdown'].includes(mime):kind==='page'?html:kind==='image'?image:html||image;
      if (status !== 200 || !allowed || response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity' || Number(response.headers['content-length']) > limit) {
        response.destroy(); reject(new Error('Unsupported preview response.')); return;
      }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > limit) response.destroy(new Error('Preview too large.')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => resolve({ bytes: Buffer.concat(chunks), url: url.href, mime }));
    });
    request.on('error', reject); request.end();
  });
}
