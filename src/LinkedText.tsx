import {useExperience} from './ExperienceContext';
import {BROWSER_VIEWS} from '../shared/experience';
import { useContext, type ReactNode } from 'react';
import { NavigationContext } from './NavigationContext';
import { destinationPath, parseDestination } from '../shared/navigation';
import { compactUrlLabel, textLinks } from '../shared/links';
import {postMentionTokens,type PostMention} from '../shared/postFeatures';
export function LinkedText({ text, mentions=[] }: { text: string; mentions?:PostMention[] }) {
  const experience=useExperience();
  const navigate = useContext(NavigationContext), parts: ReactNode[] = []; let offset = 0;
  const validMentions=new Set(postMentionTokens(text).map(token=>`${token.start}:${token.end}`));
  const segments=[...textLinks(text).map(link=>({...link,kind:'url' as const})),...mentions.filter(mention=>validMentions.has(`${mention.start}:${mention.end}`)).map(mention=>({...mention,kind:'mention' as const}))].sort((a,b)=>a.start-b.start||b.end-a.end);
  for (const segment of segments) {
    const {start,end}=segment;if(start<offset)continue;
    parts.push(text.slice(offset, start));
    const destination=segment.kind==='mention'?{view:'person' as const,resourceId:segment.userId}:parseDestination(segment.url,location.origin);
    const href=segment.kind==='mention'?destinationPath({view:'person',resourceId:segment.userId}):segment.url;
    parts.push(<a key={start} href={destination&&experience&&BROWSER_VIEWS.has(destination.view)?destinationPath({...destination,mode:destination.mode||experience.mode}):href} target={destination ? undefined : '_blank'} rel="noopener noreferrer" onClick={event => { if (destination && navigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(destination); } }}>{segment.kind==='mention'?text.slice(start,end):compactUrlLabel(text.slice(start,end))}</a>);
    offset = end;
  }
  parts.push(text.slice(offset)); return parts;
}
