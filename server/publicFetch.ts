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
export async function fetchPublic(value: string, kind: 'page' | 'image' | 'icon' | 'preview' | 'video_poster' | 'manifest' | 'text' | 'site_source', signal: AbortSignal, redirects = 0, requireHttps = false): Promise<{ bytes: Buffer; url: string; mime: string }> {
  if (redirects > 3) throw new Error('Too many redirects.');
  const url = publicUrl(value), hostname = url.hostname.replace(/^\[|\]$/g, '');
  if(requireHttps&&url.protocol!=='https:')throw new Error('HTTPS is required.');
  const answers = await Promise.race([lookup(hostname, { all: true }), new Promise<never>((_, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  })]);
  signal.throwIfAborted();
  if (!answers.length || answers.some(answer => !publicAddress(answer.address))) throw new Error('Non-public preview address.');
  const picked = answers.find(answer => answer.family === 4) || answers[0];
  const limit=kind==='video_poster'?12*1024*1024:kind==='text'?256*1024:kind==='icon'||kind==='site_source'?512*1024:['page','manifest'].includes(kind)?1024*1024:5*1024*1024;
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      agent: false, signal, family: picked.family,
      lookup: (_host, options, callback) => { if (options.all) callback(null, [picked]); else callback(null, picked.address, picked.family); },
      headers: { 'User-Agent': 'NewDrugs-LinkPreview/1.0 (+https://druggie.org)', Accept: kind === 'page' ? 'text/html,application/xhtml+xml' : kind==='site_source'?'text/html,text/css,application/javascript,text/javascript,text/plain':kind==='manifest'?'application/json,text/plain,application/octet-stream':kind==='text'?'text/plain,text/markdown':kind==='preview'?'text/html,application/xhtml+xml,image/*,video/*':kind==='video_poster'?'video/*':'image/*', 'Accept-Encoding': 'identity',...(kind==='video_poster'?{Range:`bytes=0-${limit-1}`}:{}) },
    }, response => {
      const status = response.statusCode || 0;
      if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
        response.destroy();
        try { resolve(fetchPublic(new URL(response.headers.location, url).href, kind, signal, redirects + 1,requireHttps)); } catch (error) { reject(error); }
        return;
      }
      const mime = (response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const html=['text/html','application/xhtml+xml'].includes(mime),image=['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(mime),video=['preview','video_poster'].includes(kind)&&['video/mp4','video/webm','video/ogg','video/quicktime'].includes(mime);
      const siteSource=['text/css','text/javascript','application/javascript','application/x-javascript','text/plain'].includes(mime)||html||['application/octet-stream',''].includes(mime)&&/\.(?:css|m?js)$/.test(url.pathname);
      const allowed=kind==='manifest'?(/(?:^|[+/])json$/.test(mime)||['text/plain','application/octet-stream','application/muse','application/cif','application/pops'].includes(mime)):kind==='site_source'?siteSource:kind==='text'?['text/plain','text/markdown'].includes(mime):kind==='page'?html:kind==='image'?image:kind==='icon'?image||['image/x-icon','image/vnd.microsoft.icon','image/ico'].includes(mime)||mime==='application/octet-stream'&&/\.ico$/i.test(url.pathname):kind==='video_poster'?video:html||image||video;
      const partial=kind==='video_poster'&&status===206&&/^bytes 0-\d+\/\d+$/.test(String(response.headers['content-range']||''));
      const headersOnlyVideo=kind==='preview'&&video;
      if ((status!==200&&!partial) || !allowed || (response.headers['content-encoding']&&response.headers['content-encoding']!=='identity') || (!headersOnlyVideo&&Number(response.headers['content-length'])>limit)) {
        response.destroy(); reject(new Error('Unsupported preview response.')); return;
      }
      // Classify direct video from headers without downloading it into the API.
      if(headersOnlyVideo){response.destroy();resolve({bytes:Buffer.alloc(0),url:url.href,mime});return;}
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > limit) response.destroy(new Error('Preview too large.')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => resolve({ bytes: Buffer.concat(chunks), url: url.href, mime }));
    });
    request.on('error', reject); request.end();
  });
}
