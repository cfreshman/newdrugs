import { useLayoutEffect, useRef, type RefObject } from 'react';
import { animateMessagePlacement, captureMessagePlacement, type MessagePlacementMotion, type MessagePlacementSnapshot } from './messagePlacementMotion';

export function useMessagePlacement(composer: RefObject<HTMLElement | null>, transcript: RefObject<HTMLDivElement | null>, identity: string | undefined, blocked: boolean) {
  const pending = useRef<{ id: string; snapshot: MessagePlacementSnapshot } | null>(null);
  const active = useRef<MessagePlacementMotion | null>(null);
  useLayoutEffect(() => {
    const placement = pending.current;
    if (!placement) return;
    // Let the scroll hook and textarea resize settle before measuring.
    const frame = requestAnimationFrame(() => {
      pending.current = null;
      const scroller = transcript.current;
      const target = scroller && Array.from(scroller.querySelectorAll<HTMLElement>('[data-message-id]')).find(node => node.dataset.messageId === placement.id);
      if (!target || !scroller) return;
      scroller.scrollTop = scroller.scrollHeight;
      const motion = animateMessagePlacement(placement.snapshot, target);
      active.current = motion;
      void motion?.finished.then(() => { if (active.current === motion) active.current = null; });
    });
    return () => cancelAnimationFrame(frame);
  });
  useLayoutEffect(() => {
    if (blocked) { pending.current = null; active.current?.cancel(); active.current = null; }
    return () => { pending.current = null; active.current?.cancel(); active.current = null; };
  }, [identity, blocked]);
  return (id: string, text: string) => {
    active.current?.cancel(); active.current = null;
    const snapshot = captureMessagePlacement(composer.current, text);
    pending.current = snapshot ? { id, snapshot } : null;
  };
}
