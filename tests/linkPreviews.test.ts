import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
const network = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: network.lookup }));
vi.mock('node:http', () => ({ request: network.request }));
vi.mock('node:https', () => ({ request: network.request }));
import { fetchPublic, publicAddress, publicUrl } from '../server/publicFetch';
import { pageMetadata, previewRaster } from '../server/linkPreviews';
import { textLinks } from '../shared/links';

beforeEach(() => { network.lookup.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]); network.request.mockReset(); });
function response(status: number, headers: Record<string, string>, body = '') {
  network.request.mockImplementationOnce((_url, _options, callback) => {
    const request = new EventEmitter() as EventEmitter & { end(): void };
    request.end = () => { const stream = Object.assign(new EventEmitter(), { statusCode: status, headers, destroy(error?: Error) { if (error) stream.emit('error', error); } }); callback(stream); queueMicrotask(() => { stream.emit('data', Buffer.from(body)); stream.emit('end'); }); };
    return request;
  });
}
describe('public preview fetch boundary', () => {
  it('rejects local, link-local, mapped-private and special-use addresses', () => {
    for (const ip of ['127.0.0.1','10.1.2.3','172.20.0.1','192.168.1.1','169.254.169.254','0.0.0.0','100.64.0.1','224.0.0.1','::1','fc00::1','fe80::1','::ffff:127.0.0.1','64:ff9b::7f00:1','2002:7f00:1::']) expect(publicAddress(ip), ip).toBe(false);
    expect(publicAddress('8.8.8.8')).toBe(true); expect(publicAddress('2606:4700:4700::1111')).toBe(true);
    for (const url of ['file:///etc/passwd','http://localhost/','http://2130706433/','http://0x7f000001/','https://user:pass@example.com/','https://example.com:7331/']) expect(() => publicUrl(url), url).toThrow();
  });
  it('pins the validated address to the request lookup and forwards no credentials', async () => {
    response(200, { 'content-type': 'text/html' }, '<title>Hi</title>');
    expect((await fetchPublic('https://example.com/page', 'page', AbortSignal.timeout(1000))).bytes.toString()).toContain('Hi');
    const options = network.request.mock.calls[0][1], callback = vi.fn();
    options.lookup('example.com', {}, callback); expect(callback).toHaveBeenCalledWith(null, '93.184.216.34', 4);
    expect(options.agent).toBe(false); expect(options.headers).not.toHaveProperty('Cookie'); expect(options.headers).not.toHaveProperty('Authorization');
  });
  it('checks every DNS answer and every redirect before connecting', async () => {
    network.lookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.2', family: 4 }]);
    await expect(fetchPublic('https://example.com', 'page', AbortSignal.timeout(1000))).rejects.toThrow(); expect(network.request).not.toHaveBeenCalled();
    response(302, { location: 'http://169.254.169.254/latest/meta-data' });
    await expect(fetchPublic('https://example.com', 'page', AbortSignal.timeout(1000))).rejects.toThrow(); expect(network.request).toHaveBeenCalledTimes(1);
  });
  it('rejects oversized responses and active image formats', async () => {
    response(200, { 'content-type': 'text/html', 'content-length': '2097152' });
    await expect(fetchPublic('https://example.com', 'page', AbortSignal.timeout(1000))).rejects.toThrow();
    response(200, { 'content-type': 'image/svg+xml' }, '<svg/>');
    await expect(fetchPublic('https://example.com/image', 'image', AbortSignal.timeout(1000))).rejects.toThrow();
  });
});
it('uses OG then Twitter then ordinary head metadata, resolves relative images and ignores body forgeries', () => {
  expect(pageMetadata('<head><title>Fallback &amp; title</title><meta content="OG &amp; title" property="og:title"><meta name="twitter:description" content="A description"><meta property="og:image" content="../photo.png"><meta property="og:url" content="https://evil.example/"></head><body><meta property="og:title" content="Wrong"></body>', 'https://example.com/articles/post')).toEqual({ title: 'OG & title', description: 'A description', image: 'https://example.com/photo.png' });
  expect(pageMetadata('<title>Just a title</title><meta name="description" content="Details"><meta property="og:image" content="http://127.0.0.1/private">', 'https://example.com')).toEqual({ title: 'Just a title', description: 'Details', image: undefined });
});
it('keeps parentheses in links, excludes credentials and leaves sentence punctuation out', () => {
  const text = 'Read (https://example.com/wiki/Plant_(life)). Or https://example.org/a?x=1&y=2! https://user:pass@example.com/secret';
  expect(textLinks(text).map(link => link.url)).toEqual(['https://example.com/wiki/Plant_(life)', 'https://example.org/a?x=1&y=2']);
  for (const link of textLinks(text)) expect(text.slice(link.start, link.end)).toBe(link.url);
});
it('rejects SVG and HTML bytes even when a website labels them as a raster image', () => {
  expect(previewRaster(Buffer.from('<svg><image href="file:///etc/passwd"/></svg>'))).toBe(false);
  expect(previewRaster(Buffer.from('<html>picture</html>'))).toBe(false);
  expect(previewRaster(Buffer.from([137,80,78,71,13,10,26,10]))).toBe(true);
});
