import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { bottomAnchoredScroll } from './chatPosition';
import { captureHistoryAnchor, restoreHistoryAnchor } from './ChatHistory';

const heldUntil = new WeakMap<HTMLElement, number>();
export const holdConversationScroll = (element: HTMLElement) => { heldUntil.set(element, performance.now() + 300); };
const held = (element: HTMLElement) => (heldUntil.get(element) || 0) > performance.now();
export function shouldFadeConversationTop(element: HTMLElement) {
  return element.scrollTop > 1 || element.clientHeight > 0 && element.scrollHeight > 0 &&
    element.getBoundingClientRect().top <= 1;
}

export function useConversationScroll(signals: { viewId?:string; submittedId?:string; completedId?:string; approvalIds?:string } = {}) {
  const transcript = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const forceBottom = useRef(true);
  const priorSignals = useRef<typeof signals>({});
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const jumpTarget = useRef<string | null>(null);
  const [fadedTop, setFadedTop] = useState(false);
  const previous = useRef({ top: 0, height: 0 });
  const headroom = useRef(0);
  const prepend = useRef<{ anchor: ReturnType<typeof captureHistoryAnchor>; signals: typeof signals } | null>(null);
  const restoreView=useRef<{anchor:ReturnType<typeof captureHistoryAnchor>;following:boolean}|null>(null);
  const suspension=useRef<{element:HTMLDivElement|null;anchor:ReturnType<typeof captureHistoryAnchor>|null;viewId?:string;following:boolean;forceBottom:boolean}|null>(null);
  const measureHeadroom=useRef<(()=>number)|null>(null);
  const remember = useCallback(() => {
    const el = transcript.current;
    if (el) { previous.current = { top: el.scrollTop, height: el.clientHeight }; setFadedTop(shouldFadeConversationTop(el)); setAwayFromBottom(!forceBottom.current && !following.current && el.scrollHeight - el.scrollTop - el.clientHeight > 24); }
  },[]);
  const suspend=useCallback((active:boolean)=>{
    if(active){
      if(suspension.current)return;
      const element=transcript.current;
      suspension.current={element,anchor:element?captureHistoryAnchor(element):null,viewId:priorSignals.current.viewId,following:following.current,forceBottom:forceBottom.current};
      forceBottom.current=false;following.current=false;
      return;
    }
    const saved=suspension.current;if(!saved)return;suspension.current=null;
    const element=transcript.current;if(!element){forceBottom.current=saved.forceBottom;following.current=saved.following;return;}
    const delta=measureHeadroom.current?.()||0;
    if(saved.anchor&&saved.element===element&&saved.viewId===priorSignals.current.viewId){
      if(saved.anchor.message?.isConnected&&element.contains(saved.anchor.message))restoreHistoryAnchor(element,saved.anchor);
      else element.scrollTop=saved.anchor.scrollTop+delta;
      jumpTarget.current=null;prepend.current=null;restoreView.current=null;
      forceBottom.current=false;
      following.current=saved.following&&element.scrollHeight-element.scrollTop-element.clientHeight<=24;
      holdConversationScroll(element);
    }else{
      forceBottom.current=saved.forceBottom;following.current=saved.following;
      if(forceBottom.current||following.current){element.scrollTop=element.scrollHeight;following.current=true;forceBottom.current=false;}
    }
    remember();
  },[remember]);
  // Wayfinder keeps an explicit one-shot follow request separate from resize anchoring.
  // The scroll must happen after React has committed the new message, not before it.
  useLayoutEffect(() => {
    const prior=priorSignals.current;
    const newApprovals = signals.approvalIds?.split(',').some(id => id && !prior.approvalIds?.split(',').includes(id));
    if(!suspension.current&&(prior.viewId!==signals.viewId || signals.submittedId&&prior.submittedId!==signals.submittedId || signals.completedId&&prior.completedId!==signals.completedId || newApprovals)) forceBottom.current=true;
    priorSignals.current=signals;
    if(suspension.current)return;
    const saved = prepend.current; prepend.current = null;
    if (saved && saved.signals.viewId === signals.viewId && saved.signals.submittedId === signals.submittedId && saved.signals.completedId === signals.completedId && saved.signals.approvalIds === signals.approvalIds && transcript.current) {
      restoreHistoryAnchor(transcript.current, saved.anchor);
      forceBottom.current = false; following.current = false; remember();
    }
    const restored=restoreView.current;restoreView.current=null;
    if(restored&&transcript.current){jumpTarget.current=null;following.current=restored.following;forceBottom.current=restored.following;if(!restored.following){restoreHistoryAnchor(transcript.current,restored.anchor);holdConversationScroll(transcript.current);}remember();}
    const frame=requestAnimationFrame(()=>{
      const el=transcript.current;if(!el||suspension.current)return;
      if (jumpTarget.current) {
        const target = [...el.querySelectorAll<HTMLElement>('[data-message-id]')].find(node => node.dataset.messageId === jumpTarget.current);
        if (!target) return;
        jumpTarget.current = null; forceBottom.current = false; following.current = false; holdConversationScroll(el);
        el.scrollTop += target.getBoundingClientRect().top - el.getBoundingClientRect().top - 24; remember(); return;
      }
      if(!forceBottom.current && held(el)){following.current=el.scrollHeight-el.clientHeight-el.scrollTop<=24;remember();return;}
      if(forceBottom.current||following.current){el.scrollTop=el.scrollHeight;following.current=true;forceBottom.current=false;remember();}
      else setFadedTop(shouldFadeConversationTop(el));
    });
    return()=>cancelAnimationFrame(frame);
  });
  useLayoutEffect(() => {
    const el = transcript.current, body = content.current;
    if (!el || !body) return;
    const addHeadroom = () => {
      const contentHeight = body.scrollHeight - headroom.current;
      const next = contentHeight > el.clientHeight + 1 ? parseFloat(getComputedStyle(el).getPropertyValue('--chat-headroom-size')) || 120 : 0;
      const delta = next - headroom.current;
      if (delta) { body.style.paddingTop = `${next}px`; headroom.current = next; }
      return delta;
    };
    measureHeadroom.current=addHeadroom;
    if(!suspension.current){addHeadroom();remember();}
    const layout = new ResizeObserver(() => {
      if(suspension.current)return;
      const delta = addHeadroom();
      const before = { ...previous.current, top: previous.current.top + delta };
      if (delta && !following.current && !forceBottom.current) el.scrollTop += delta;
      if (jumpTarget.current) { remember(); return; }
      if (forceBottom.current) {
        el.scrollTop=el.scrollHeight;following.current=true;forceBottom.current=false;
      } else if (held(el)) {
        following.current=el.scrollHeight-el.clientHeight-el.scrollTop<=24;
      } else if (before.height !== el.clientHeight && before.height > 0) {
        el.scrollTop = bottomAnchoredScroll(before, el.clientHeight, el.scrollHeight);
        following.current=el.scrollHeight-el.clientHeight-el.scrollTop<=24;
      } else if (following.current) el.scrollTop = el.scrollHeight;
      remember();
    });
    layout.observe(el); layout.observe(body);
    return () => {layout.disconnect();if(measureHeadroom.current===addHeadroom)measureHeadroom.current=null;};
  }, [signals.viewId]);
  return {
    transcript, content, fadedTop, awayFromBottom,suspend,
    capture:()=>transcript.current?{anchor:captureHistoryAnchor(transcript.current),following:following.current||forceBottom.current}:null,
    restore:(saved:{anchor:ReturnType<typeof captureHistoryAnchor>;following:boolean}|null)=>{if(saved)restoreView.current=saved;else{forceBottom.current=true;following.current=true;}},
    jumpTo: (messageId: string) => { jumpTarget.current = messageId; forceBottom.current = false; following.current = false; },
    preparePrepend: () => {
      const el = transcript.current; if (!el || forceBottom.current || suspension.current) return;
      prepend.current = { anchor: captureHistoryAnchor(el), signals: priorSignals.current };
      following.current = false; holdConversationScroll(el);
    },
    follow: () => { if(suspension.current)return;jumpTarget.current = null; forceBottom.current = true; following.current = true; setAwayFromBottom(false); },
    onScroll: () => {
      const el = transcript.current;
      if (!el || suspension.current || forceBottom.current || previous.current.height !== el.clientHeight) return;
      following.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 24;
      remember();
    },
  };
}
