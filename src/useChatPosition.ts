import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { clampChat, mobileChatLayout, type ChatDimensions, type Point, type Viewport } from './chatPosition';

const readViewport = (): Viewport => {
  const v = window.visualViewport;
  return { width: v?.width ?? innerWidth, height: v?.height ?? innerHeight, left: v?.offsetLeft ?? 0, top: v?.offsetTop ?? 0 };
};
const readDimensions = (keyboard = false): ChatDimensions => {
  const css = getComputedStyle(document.documentElement);
  const gap = parseFloat(css.getPropertyValue('--chat-gutter')) || 12;
  return { width: parseFloat(css.getPropertyValue('--chat-width')) || 480,
    gutter: gap + Math.max(parseFloat(css.getPropertyValue('--safe-area-left')) || 0, parseFloat(css.getPropertyValue('--safe-area-right')) || 0),
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
  // iOS standalone can both resize the window and pan the visual viewport for
  // its keyboard. A window-height anchor then lands near the visible top.
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
    const fit = () => {
      const next = readViewport(), scale = window.visualViewport?.scale || 1;
      // Normalize zoom before comparing heights. iOS may shrink innerHeight
      // along with visualViewport, so retain the unobscured height per width.
      const height = next.height * scale;
      const baseline = keyboard.current;
      if (baseline.width !== innerWidth) {
        baseline.width = innerWidth;
        baseline.height = Math.max(innerHeight, document.documentElement.clientHeight, height);
      } else baseline.height = Math.max(baseline.height, height);
      const editing = document.activeElement instanceof HTMLElement && document.activeElement.matches('textarea, select, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="button"]):not([type="submit"]), [contenteditable="true"]');
      // Keep the inset removed through the closing animation, even after blur.
      baseline.open = mobileChatLayout() && baseline.height - height > 100 && (editing || baseline.open);
      dimensions.current = readDimensions(baseline.open);
      setKeyboardOpen(baseline.open); setViewport(next);
    };
    fit();
    // Apply visual-viewport geometry before the browser paints its next keyboard
    // frame. Deferred React updates otherwise expose one frame of the old anchor.
    const fitViewport = () => flushSync(fit);
    const observer = new ResizeObserver(() => setComposerHeight(composer.current?.offsetHeight ?? 156));
    if (composer.current) observer.observe(composer.current);
    window.addEventListener('resize', fitViewport);
    document.addEventListener('focusin', fit);
    document.addEventListener('focusout', fit);
    window.visualViewport?.addEventListener('resize', fitViewport);
    window.visualViewport?.addEventListener('scroll', fitViewport);
    return () => {
      observer.disconnect(); window.removeEventListener('resize', fitViewport);
      document.removeEventListener('focusin', fit); document.removeEventListener('focusout', fit);
      window.visualViewport?.removeEventListener('resize', fitViewport);
      window.visualViewport?.removeEventListener('scroll', fitViewport);
    };
  }, [composer, ready]);
  void revision;
  return {
    sideBySide,
    keyboardOpen,
    draggable: !mobile,
    style: { '--chat-x': `${position.x}px`, '--chat-y': `${position.y}px`, '--chat-gutter': `${dimensions.current.gutter}px`, '--viewport-width': `${viewport.width}px`, '--viewport-height': `${viewport.height}px`, '--viewport-top': `${viewport.top}px`, '--safe-area-bottom': keyboardOpen ? '0px' : undefined,
      '--orb-size': keyboardOpen ? 'var(--launcher-size)' : undefined, '--orb-radius': keyboardOpen ? 'calc(var(--launcher-size) / 2)' : undefined } as CSSProperties,
    onDragStart: () => { dragOrigin.current = positionRef.current; },
    onDrag: (dx: number, dy: number) => move({ x: dragOrigin.current.x + dx, y: dragOrigin.current.y + dy }),
    onDragEnd: save,
    onNudge: (dx: number, dy: number) => { if(!dx)return;move({ x: positionRef.current.x + dx, y: positionRef.current.y + dy }); save(); },
  };
}
