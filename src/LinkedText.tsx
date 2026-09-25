import { useContext } from 'react';
import { NavigationContext } from './NavigationContext';
import { parseDestination } from '../shared/navigation';

/** Plain social text stays literal; only explicit HTTP(S) URLs become links. */
export function LinkedText({ text }: { text: string }) {
  const navigate = useContext(NavigationContext);
  return text.split(/(https?:\/\/[^\s<>]+)/g).map((part, index) => {
    if (!/^https?:\/\//.test(part)) return part;
    const url = part.replace(/[.,!?;:)]+$/, ''), tail = part.slice(url.length);
    try { const parsed = new URL(url); if (parsed.username || parsed.password) return part; } catch { return part; }
    const destination = parseDestination(url, location.origin);
    return <span key={index}><a href={url} target={destination ? undefined : '_blank'} rel="noopener noreferrer" onClick={event => { if (destination && navigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(destination); } }}>{url}</a>{tail}</span>;
  });
}
