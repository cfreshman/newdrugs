import { useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { CaretDown, CaretUp } from '@phosphor-icons/react';
import { AgentMarkdown } from './AgentMarkdown';
import { messagePreviewHeight,useMessageExpansion } from './useMessageExpansion';
import { LinkedText } from './LinkedText';

const interactive = 'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [contenteditable]:not([contenteditable="false"])';

// The same measured-height, pointer-safe collapse behavior as Wayfinder's
// CollapsibleAgentMessage, with New Drugs' plain user text and Phosphor icons.
export function CollapsibleMessage({ text, assistant, scrollRef, social = false, reveal = false, collapsible = true }: { text: string; assistant: boolean; scrollRef: RefObject<HTMLDivElement | null>; social?: boolean; reveal?: boolean; collapsible?: boolean }) {
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const pointerInteractive = useRef(false);
  const [preview, setPreview] = useState(256);
  const [long, setLong] = useState(false);
  const {expanded,setExpanded,toggle}=useMessageExpansion({wrapper,scrollRef,reveal});
  const collapsed = collapsible && long && !expanded;
  useLayoutEffect(() => {
    const node = content.current;
    if (!node) return;
    const measure = () => {
      const css = getComputedStyle(node);
      const multiplier = assistant && window.matchMedia('(min-width: 640px)').matches ? 2 : 1;
      const height = messagePreviewHeight(node,assistant);
      const threshold = (parseFloat(css.getPropertyValue('--message-collapse-threshold')) || 320) * multiplier;
      const line = parseFloat(css.lineHeight) || 24;
      setPreview(height);
      setLong(collapsible && node.scrollHeight > Math.max(threshold, height + line * 2));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [text, assistant, collapsible]);
  return <div className="collapsible-message" ref={wrapper}>
    <div id={id} className="message-preview" style={collapsed ? { maxHeight: preview } : undefined}
      onPointerDownCapture={event => { pointerInteractive.current = event.target instanceof Element && Boolean(event.target.closest(interactive)); }}
      onPointerUpCapture={() => { pointerInteractive.current = false; }}
      onPointerCancelCapture={() => { pointerInteractive.current = false; }}
      onFocusCapture={() => { if (collapsed && !pointerInteractive.current) setExpanded(true); }}>
      <div className="message-text" ref={content}>{social ? <LinkedText text={text} /> : assistant ? <AgentMarkdown text={text} /> : text}</div>
    </div>
    {collapsible && long && <button type="button" className="message-toggle" aria-expanded={expanded} aria-controls={id} onClick={toggle}>
      {expanded ? 'Show less' : 'Show more'}{expanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
    </button>}
  </div>;
}
