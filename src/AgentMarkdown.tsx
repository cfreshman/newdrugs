import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useContext } from 'react';
import { NavigationContext } from './NavigationContext';
import { parseDestination } from '../shared/navigation';

const Link: NonNullable<Components['a']> = ({ children, node: _node, ...props }) => {
  const navigate = useContext(NavigationContext);
  const destination = props.href ? parseDestination(props.href, window.location.origin) : null;
  return <a {...props} target={destination ? undefined : '_blank'} rel={destination ? undefined : 'noopener noreferrer'} onClick={event => {
    if (destination && navigate && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(destination); }
  }}>{children}</a>;
};

// Stable component identities keep links mounted while text streams or expands.
const components: Components = {
  a: Link,
};
const plugins = [remarkGfm];
export function AgentMarkdown({ text }: { text: string }) {
  return <Markdown remarkPlugins={plugins} components={components} skipHtml>{text}</Markdown>;
}
