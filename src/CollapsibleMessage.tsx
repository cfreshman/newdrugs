import { useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { CaretDown, CaretUp } from '@phosphor-icons/react';
import { AgentMarkdown } from './AgentMarkdown';
import { holdConversationScroll } from './useConversationScroll';
import { LinkedText } from './LinkedText';

const interactive = 'a[href], button, input, select, textarea, summary, [role="button"], [role="link"], [contenteditable]:not([contenteditable="false"])';

// The same measured-height, pointer-safe collapse behavior as Wayfinder's
// CollapsibleAgentMessage, with New Drugs' plain user text and Phosphor icons.
export function CollapsibleMessage({ text, assistant, scrollRef, social = false, reveal = false }: { text: string; assistant: boolean; scrollRef: RefObject<HTMLDivElement | null>; social?: boolean; reveal?: boolean }) {
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const pointerInteractive = useRef(false);
  const pendingScroll = useRef<{ top: number; bottom: number | null } | null>(null);
  const [preview, setPreview] = useState(256);
  const [long, setLong] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => { if (reveal) setExpanded(true); }, [reveal]);
  const collapsed = long && !expanded;
  useLayoutEffect(() => {
    const node = content.current;
    if (!node) return;
    const measure = () => {
      const css = getComputedStyle(node);
      const multiplier = assistant && window.matchMedia('(min-width: 640px)').matches ? 2 : 1;
      const height = (parseFloat(css.getPropertyValue('--message-preview')) || 256) * multiplier;
      const threshold = (parseFloat(css.getPropertyValue('--message-collapse-threshold')) || 320) * multiplier;
      const line = parseFloat(css.lineHeight) || 24;
      setPreview(height);
      setLong(node.scrollHeight > Math.max(threshold, height + line * 2));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [text, assistant]);
  useLayoutEffect(() => {
    const anchor = pendingScroll.current, scroller = scrollRef.current, message = wrapper.current;
    if (!anchor || !scroller || !message) return;
    scroller.scrollTop = anchor.bottom === null ? anchor.top : Math.max(0, scroller.scrollTop + message.getBoundingClientRect().bottom - anchor.bottom);
    pendingScroll.current = null;
  }, [expanded, scrollRef]);
  const toggle = () => {
    const scroller = scrollRef.current, message = wrapper.current;
    if (scroller && message) {
      holdConversationScroll(scroller);
      pendingScroll.current = { top: scroller.scrollTop, bottom: expanded ? message.getBoundingClientRect().bottom : null };
    }
    setExpanded(value => !value);
  };
  return <div className="collapsible-message" ref={wrapper}>
    <div id={id} className="message-preview" style={collapsed ? { maxHeight: preview } : undefined}
      onPointerDownCapture={event => { pointerInteractive.current = event.target instanceof Element && Boolean(event.target.closest(interactive)); }}
      onPointerUpCapture={() => { pointerInteractive.current = false; }}
      onPointerCancelCapture={() => { pointerInteractive.current = false; }}
      onFocusCapture={() => { if (collapsed && !pointerInteractive.current) setExpanded(true); }}>
      <div className="message-text" ref={content}>{social ? <LinkedText text={text} /> : assistant ? <AgentMarkdown text={text} /> : text}</div>
    </div>
    {long && <button type="button" className="message-toggle" aria-expanded={expanded} aria-controls={id} onClick={toggle}>
      {expanded ? 'Show less' : 'Show more'}{expanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
    </button>}
  </div>;
}
