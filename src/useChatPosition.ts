import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { clampChat, type ChatDimensions, type Point, type Viewport } from './chatPosition';

const readViewport = (): Viewport => {
  const v = window.visualViewport;
  return { width: v?.width ?? innerWidth, height: v?.height ?? innerHeight, left: v?.offsetLeft ?? 0, top: v?.offsetTop ?? 0 };
};
const readDimensions = (): ChatDimensions => {
  const css = getComputedStyle(document.documentElement);
  const gap = parseFloat(css.getPropertyValue('--chat-gutter')) || 12;
  const keyboard = Boolean(window.visualViewport && window.visualViewport.height < innerHeight * .75);
  return { width: parseFloat(css.getPropertyValue('--chat-width')) || 480,
    gutter: gap + Math.max(parseFloat(css.getPropertyValue('--safe-area-left')) || 0, parseFloat(css.getPropertyValue('--safe-area-right')) || 0),
    radius: parseFloat(css.getPropertyValue('--orb-radius')) || 36,
    bottomGutter: gap + (keyboard ? 0 : parseFloat(css.getPropertyValue('--safe-area-bottom')) || 0) };
};
const readPreference = () => {
  if (window.matchMedia('(max-width: 639px)').matches) return { x: .5, y: 1 };
  try {
    const point = JSON.parse(localStorage.getItem('nd-chat-position') || 'null');
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) return point as Point;
  } catch { /* Optional position preference. */ }
  return { x: .5, y: 1 };
};

export function useChatPosition(composer: RefObject<HTMLDivElement | null>, ready = true, expanded = false, launcherOpen = false) {
  const preferred = useRef(readPreference());
  const dimensions = useRef(readDimensions());
  const [viewport, setViewport] = useState(readViewport);
  const [composerHeight, setComposerHeight] = useState(156);
  const [revision, setRevision] = useState(0);
  // Keyboard/panning only constrain the displayed position; they never replace the saved one.
  const mobile = innerWidth < 640;
  const width = Math.min(dimensions.current.width, viewport.width - dimensions.current.gutter * 2), gap = 12;
  const sideBySide = launcherOpen && !mobile && viewport.width >= width * 2 + gap + dimensions.current.gutter * 2;
  const inputHeight = (composer.current?.querySelector<HTMLElement>('.composer-input-layer')?.offsetHeight || 76) + dimensions.current.radius * 2 + 6;
  const base = clampChat(mobile ? { x: innerWidth / 2, y: innerHeight } : { x: preferred.current.x * innerWidth, y: preferred.current.y * innerHeight }, viewport, launcherOpen ? 156 : inputHeight, dimensions.current);
  const position = sideBySide ? { ...base, x: Math.max(viewport.left + dimensions.current.gutter + width * 1.5 + gap, base.x) } : base;
  const anchor = position;
  const positionRef = useRef(anchor); positionRef.current = anchor;
  const dragOrigin = useRef(position);
  const move = useCallback((point: Point) => {
    const next = clampChat(point, readViewport(), expanded ? 156 : composer.current?.offsetHeight ?? 156, dimensions.current);
    preferred.current = { x: next.x / innerWidth, y: next.y / innerHeight };
    setRevision(n => n + 1);
  }, [composer, expanded]);
  const save = useCallback(() => {
    if (window.matchMedia('(max-width: 639px)').matches) return;
    try { localStorage.setItem('nd-chat-position', JSON.stringify(preferred.current)); } catch { /* Optional storage. */ }
  }, []);
  useLayoutEffect(() => {
    if (!ready) return;
    const fit = () => { dimensions.current = readDimensions(); setViewport(readViewport()); };
    const observer = new ResizeObserver(() => setComposerHeight(composer.current?.offsetHeight ?? 156));
    if (composer.current) observer.observe(composer.current);
    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('scroll', fit);
    return () => {
      observer.disconnect(); window.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('scroll', fit);
    };
  }, [composer, ready]);
  void revision;
  return {
    sideBySide,
    draggable: !mobile,
    style: { '--chat-x': `${position.x}px`, '--chat-y': `${position.y}px`, '--chat-gutter': `${dimensions.current.gutter}px`, '--viewport-width': `${viewport.width}px`, '--viewport-height': `${viewport.height}px`, '--viewport-top': `${viewport.top}px` } as CSSProperties,
    onDragStart: () => { dragOrigin.current = positionRef.current; },
    onDrag: (dx: number, dy: number) => move({ x: dragOrigin.current.x + dx, y: dragOrigin.current.y + dy }),
    onDragEnd: save,
    onNudge: (dx: number, dy: number) => { move({ x: positionRef.current.x + dx, y: positionRef.current.y + dy }); save(); },
  };
}
