import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { clampChat, mobileChatLayout, type ChatDimensions, type Point, type Viewport } from './chatPosition';
import { ARTIFACT_EDITABLE_FOCUS_EVENT, artifactEditableFocused } from './embeddedArtifactFocus';

const readViewport = (): Viewport => {
  return { width: innerWidth, height: innerHeight, left: 0, top: 0 };
};
const readDimensions = (keyboard = false): ChatDimensions => {
  const css = getComputedStyle(document.documentElement);
  const gap = parseFloat(css.getPropertyValue('--chat-gutter')) || 12;
  return { width: innerWidth < 640 ? readViewport().width : parseFloat(css.getPropertyValue('--chat-width')) || 600,
    gutter: Math.max(gap, parseFloat(css.getPropertyValue('--safe-area-left')) || 0, parseFloat(css.getPropertyValue('--safe-area-right')) || 0),
    radius: keyboard ? (parseFloat(css.getPropertyValue('--launcher-size')) || 48) / 2 : parseFloat(css.getPropertyValue('--orb-radius')) || 36,
    bottomGutter: gap + (keyboard ? 0 : parseFloat(css.getPropertyValue('--safe-area-bottom')) || 0) };
};
const readPreference = () => {
  if (mobileChatLayout()) return { x: .5, y: 1 };
  try {
    const point = JSON.parse(localStorage.getItem('nd-chat-position') || 'null');
    if (point && Number.isFinite(point.x)) return {x:point.x,y:1};
  } catch { /* Optional position preference. */ }
  return { x: .5, y: 1 };
};

export function useChatPosition(composer: RefObject<HTMLDivElement | null>, ready = true, expanded = false, launcherOpen = false) {
  const preferred = useRef(readPreference());
  const dimensions = useRef(readDimensions());
  const [viewport, setViewport] = useState(readViewport);
  const [keyboardView, setKeyboardView] = useState<{height:number;top:number}|null>(null);
  const keyboardOpen=keyboardView!==null;
  const keyboard = useRef({ width: innerWidth, height: innerHeight });
  const [composerHeight, setComposerHeight] = useState(156);
  const [revision, setRevision] = useState(0);
  // Keep only the horizontal preference. Every layout anchors to the visible bottom.
  const mobile = mobileChatLayout();
  const width = Math.min(dimensions.current.width, viewport.width - dimensions.current.gutter * 2), gap = 12;
  const sideBySide = launcherOpen && !mobile && viewport.width >= width * 2 + gap + dimensions.current.gutter * 2;
  const inputHeight = (composer.current?.querySelector<HTMLElement>('.composer-input-layer')?.offsetHeight || 76) + dimensions.current.radius * 2 + 6;
  const base = clampChat({ x: mobile ? viewport.left + viewport.width / 2 : preferred.current.x * innerWidth, y: viewport.top + viewport.height }, viewport, launcherOpen ? 156 : inputHeight, dimensions.current);
  const position = sideBySide ? { ...base, x: Math.max(viewport.left + dimensions.current.gutter + width * 1.5 + gap, base.x) } : base;
  const anchor = position;
  const positionRef = useRef(anchor); positionRef.current = anchor;
  const dragOrigin = useRef(position);
  const move = useCallback((point: Point) => {
    const viewport=readViewport();
    const next = clampChat({...point,y:viewport.top+viewport.height}, viewport, expanded ? 156 : composer.current?.offsetHeight ?? 156, dimensions.current);
    preferred.current = { x: next.x / innerWidth, y: 1 };
    setRevision(n => n + 1);
  }, [composer, expanded]);
  const save = useCallback(() => {
    if (mobileChatLayout()) return;
    try { localStorage.setItem('nd-chat-position', JSON.stringify(preferred.current)); } catch { /* Optional storage. */ }
  }, []);
  useLayoutEffect(() => {
    if (!ready) return;
    const visual=window.visualViewport;
    const editing = () => {
      const embedded = artifactEditableFocused();
      return embedded || document.activeElement instanceof HTMLElement && document.activeElement.matches('textarea, select, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="button"]):not([type="submit"]), [contenteditable="true"]');
    };
    const fit = () => {
      const next = readViewport();
      const baseline = keyboard.current;
      if (baseline.width !== next.width) {baseline.width=next.width;baseline.height=next.height;}
      baseline.height=Math.max(baseline.height,next.height);
      const active = editing();
      const height=visual?.height||next.height,scale=visual?.scale||1;
      // Pinch zoom keeps the existing layout. A full-height zoomed viewport
      // can still tell us the keyboard was dismissed.
      if(active&&Math.abs(scale-1)>.01&&baseline.height-height*scale>100)return;
      const open=mobileChatLayout()&&active&&Math.abs(scale-1)<.01&&baseline.height-height>100;
      const top=open?Math.max(0,visual?.offsetTop||0):0;
      dimensions.current = readDimensions(open);
      setKeyboardView(previous=>open?previous?.height===height&&previous.top===top?previous:{height,top}:null);
      setViewport(previous=>previous.width===next.width&&previous.height===next.height?previous:next);
    };
    fit();
    const fitViewport = () => flushSync(fit);
    let stopped = false, artifactFitQueued = false;
    const fitArtifactFocus = () => {
      if (artifactFitQueued) return;
      artifactFitQueued = true;
      // Frame cleanup may relay during React's commit. Flush after that stack,
      // in the same pre-paint microtask checkpoint as an ordinary focus relay.
      queueMicrotask(() => { artifactFitQueued = false; if (!stopped) fitViewport(); });
    };
    const observer = new ResizeObserver(() => setComposerHeight(composer.current?.offsetHeight ?? 156));
    if (composer.current) observer.observe(composer.current);
    window.addEventListener('resize', fitViewport);
    window.addEventListener(ARTIFACT_EDITABLE_FOCUS_EVENT, fitArtifactFocus);
    document.addEventListener('focusin', fitViewport);
    document.addEventListener('focusout', fitViewport);
    visual?.addEventListener('resize',fitViewport);
    visual?.addEventListener('scroll',fitViewport);
    return () => {
      stopped = true;
      observer.disconnect(); window.removeEventListener('resize', fitViewport);
      window.removeEventListener(ARTIFACT_EDITABLE_FOCUS_EVENT, fitArtifactFocus);
      document.removeEventListener('focusin', fitViewport); document.removeEventListener('focusout', fitViewport);
      visual?.removeEventListener('resize',fitViewport);visual?.removeEventListener('scroll',fitViewport);
    };
  }, [composer, ready]);
  void revision;
  return {
    sideBySide,
    keyboardOpen,
    draggable: !mobile,
    style: { '--chat-x': mobile ? '50vw' : `${position.x}px`, '--chat-y': mobile ? 'calc(var(--app-viewport-bottom, 100dvh) - var(--chat-gutter) - var(--safe-area-bottom) - var(--orb-radius))' : `${position.y}px`, '--chat-gutter': `${dimensions.current.gutter}px`, '--app-viewport-height':keyboardView?`${keyboardView.height}px`:undefined,'--keyboard-top':keyboardView?`${keyboardView.top}px`:undefined,'--safe-area-bottom': keyboardOpen ? '0px' : undefined,
      '--orb-size': keyboardOpen ? 'var(--launcher-size)' : undefined, '--orb-radius': keyboardOpen ? 'calc(var(--launcher-size) / 2)' : undefined } as CSSProperties,
    onDragStart: () => { dragOrigin.current = positionRef.current; },
    onDrag: (dx: number, dy: number) => move({ x: dragOrigin.current.x + dx, y: dragOrigin.current.y + dy }),
    onDragEnd: save,
    onNudge: (dx: number, dy: number) => { if(!dx)return;move({ x: positionRef.current.x + dx, y: positionRef.current.y + dy }); save(); },
  };
}
