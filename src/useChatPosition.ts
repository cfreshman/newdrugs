import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { clampChat, mobileChatLayout, type ChatDimensions, type Point, type Viewport } from './chatPosition';

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
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const keyboard = useRef({ width: innerWidth, height: Math.max(innerHeight, document.documentElement.clientHeight), open: false });
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
    const editing = () => document.activeElement instanceof HTMLElement && document.activeElement.matches('textarea, select, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="button"]):not([type="submit"]), [contenteditable="true"]');
    const fit = () => {
      const next = readViewport();
      const baseline = keyboard.current;
      if (baseline.width !== innerWidth) { baseline.width = innerWidth; baseline.height = next.height; }
      const active = editing();
      if (!active && !baseline.open) baseline.height = Math.max(baseline.height, next.height);
      baseline.open = mobileChatLayout() && active && baseline.height - next.height > 100;
      dimensions.current = readDimensions(baseline.open);
      setKeyboardOpen(baseline.open); setViewport(next);
    };
    fit();
    const fitViewport = () => flushSync(fit);
    const observer = new ResizeObserver(() => setComposerHeight(composer.current?.offsetHeight ?? 156));
    if (composer.current) observer.observe(composer.current);
    window.addEventListener('resize', fitViewport);
    document.addEventListener('focusin', fitViewport);
    document.addEventListener('focusout', fitViewport);
    return () => {
      observer.disconnect(); window.removeEventListener('resize', fitViewport);
      document.removeEventListener('focusin', fitViewport); document.removeEventListener('focusout', fitViewport);
    };
  }, [composer, ready]);
  void revision;
  return {
    sideBySide,
    keyboardOpen,
    draggable: !mobile,
    style: { '--chat-x': mobile ? '50vw' : `${position.x}px`, '--chat-y': mobile ? 'calc(100dvh - var(--chat-gutter) - var(--safe-area-bottom) - var(--orb-radius))' : `${position.y}px`, '--chat-gutter': `${dimensions.current.gutter}px`, '--safe-area-bottom': keyboardOpen ? '0px' : undefined,
      '--orb-size': keyboardOpen ? 'var(--launcher-size)' : undefined, '--orb-radius': keyboardOpen ? 'calc(var(--launcher-size) / 2)' : undefined } as CSSProperties,
    onDragStart: () => { dragOrigin.current = positionRef.current; },
    onDrag: (dx: number, dy: number) => move({ x: dragOrigin.current.x + dx, y: dragOrigin.current.y + dy }),
    onDragEnd: save,
    onNudge: (dx: number, dy: number) => { if(!dx)return;move({ x: positionRef.current.x + dx, y: positionRef.current.y + dy }); save(); },
  };
}
