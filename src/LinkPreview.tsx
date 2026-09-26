import { useEffect, useRef, useState } from 'react';
import { Globe } from '@phosphor-icons/react';
import { operation } from './api';
import { textLinks, type LinkPreview as Preview } from '../shared/links';
import { parseDestination } from '../shared/navigation';
import { usePanelVisible } from './PanelReadiness';

const cached = new Map<string, { preview: Preview; expires: number }>();
const requests = new Map<string, Promise<Preview>>();
function load(url: string) {
  const entry = cached.get(url); if (entry && entry.expires > Date.now()) return Promise.resolve(entry.preview);
  if (requests.has(url)) return requests.get(url)!;
  const request = operation<Preview>('links.preview', { url }).then(preview => {
    if (cached.size >= 200) cached.delete(cached.keys().next().value!);
    cached.set(url, { preview, expires: Date.now() + 300000 }); return preview;
  }).finally(() => requests.delete(url));
  requests.set(url, request); return request;
}
function WebsiteCard({ url, draft }: { url: string; draft: boolean }) {
  const node = useRef<HTMLAnchorElement>(null), visible = usePanelVisible();
  const [preview, setPreview] = useState<Preview | undefined>(cached.get(url)?.preview), [broken, setBroken] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false, started = false, timer: ReturnType<typeof setTimeout>;
    const start = () => { if (started) return; started = true; timer = setTimeout(() => { void load(url).then(result => { if (!cancelled) setPreview(result); }).catch(() => { /* Keep the real destination without disrupting the feed. */ }); }, draft ? 650 : 0); };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { start(); observer?.disconnect(); } }, { rootMargin: '300px' });
    if (observer && node.current) observer.observe(node.current); else start();
    return () => { cancelled = true; clearTimeout(timer); observer?.disconnect(); };
  }, [url, visible, draft]);
  const hostname = new URL(url).hostname.replace(/^www\./, '');
  return <a ref={node} className="website-card" href={url} target="_blank" rel="noopener noreferrer" aria-label={preview?.title ? `${preview.title}, ${hostname}` : hostname}>
    <span className="website-image">{preview?.imageUrl && !broken ? <img src={preview.imageUrl} alt="" loading="lazy" onError={() => setBroken(true)} /> : <Globe size={28} weight="light" />}</span>
    <span className="website-copy"><span className="website-host">{hostname}</span><strong>{preview?.title || hostname}</strong><span className="website-description">{preview?.description || new URL(url).pathname.replace(/^\//, '')}</span></span>
  </a>;
}
export function LinkPreviews({ text, draft = false }: { text: string; draft?: boolean }) {
  const urls = [...new Set(textLinks(text).map(link => link.url))].filter(url => !parseDestination(url, location.origin)).slice(0, 3);
  return urls.length ? <div className="website-previews">{urls.map(url => <WebsiteCard key={url} url={url} draft={draft} />)}</div> : null;
}
