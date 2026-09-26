import {useExperience} from './ExperienceContext';
import {BROWSER_VIEWS} from '../shared/experience';
import { useContext, type ReactNode } from 'react';
import { NavigationContext } from './NavigationContext';
import { destinationPath, parseDestination } from '../shared/navigation';
import { compactUrlLabel, textLinks } from '../shared/links';
export function LinkedText({ text }: { text: string }) {
  const experience=useExperience();
  const navigate = useContext(NavigationContext), parts: ReactNode[] = []; let offset = 0;
  for (const { url, start, end } of textLinks(text)) {
    parts.push(text.slice(offset, start));
    const destination = parseDestination(url, location.origin);
    parts.push(<a key={start} href={destination&&experience&&BROWSER_VIEWS.has(destination.view)?destinationPath({...destination,mode:destination.mode||experience.mode}):url} target={destination ? undefined : '_blank'} rel="noopener noreferrer" onClick={event => { if (destination && navigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(destination); } }}>{compactUrlLabel(text.slice(start,end))}</a>);
    offset = end;
  }
  parts.push(text.slice(offset)); return parts;
}
