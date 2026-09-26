import { useContext, type ReactNode } from 'react';
import { NavigationContext } from './NavigationContext';
import { parseDestination } from '../shared/navigation';
import { textLinks } from '../shared/links';
export function LinkedText({ text }: { text: string }) {
  const navigate = useContext(NavigationContext), parts: ReactNode[] = []; let offset = 0;
  for (const { url, start, end } of textLinks(text)) {
    parts.push(text.slice(offset, start));
    const destination = parseDestination(url, location.origin);
    parts.push(<a key={start} href={url} target={destination ? undefined : '_blank'} rel="noopener noreferrer" onClick={event => { if (destination && navigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(destination); } }}>{url}</a>);
    offset = end;
  }
  parts.push(text.slice(offset)); return parts;
}
