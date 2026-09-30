import {useExperience} from './ExperienceContext';
import {BROWSER_VIEWS} from '../shared/experience';
import {compactUrlLabel} from '../shared/links';
import {remarkBareLinks} from './remarkBareLinks';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useContext } from 'react';
import { NavigationContext } from './NavigationContext';
import { destinationPath, parseDestination } from '../shared/navigation';

const Link: NonNullable<Components['a']> = ({ children, node: _node, ...props }) => {
  const navigate = useContext(NavigationContext),experience=useExperience();
  const destination = props.href ? parseDestination(props.href, window.location.origin) : null;
  return <a {...props} href={destination&&experience&&BROWSER_VIEWS.has(destination.view)?destinationPath({...destination,mode:destination.mode||experience.mode}):props.href} target={destination ? undefined : '_blank'} rel={destination ? undefined : 'noopener noreferrer'} onClick={event => {
    if (destination && navigate && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(destination); }
  }}>{typeof children==='string'?compactUrlLabel(children):children}</a>;
};

// Stable component identities keep links mounted while text streams or expands.
const components: Components = {
  a: Link,
};
const previewComponents:Components={...components,a:({children})=><span>{children}</span>,img:()=>null};
const plugins = [remarkGfm,remarkBareLinks];
export function AgentMarkdown({ text,preview=false }: { text: string;preview?:boolean }) {
  return <Markdown remarkPlugins={plugins} components={preview?previewComponents:components} skipHtml>{text}</Markdown>;
}
