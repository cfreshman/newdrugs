import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

interface Controls { draggable?: boolean; onDragStart(): void; onDrag(dx: number, dy: number): void; onDragEnd(): void; onNudge(dx: number, dy: number): void }
export function useControlDrag({ draggable = true, onDragStart, onDrag, onDragEnd, onNudge }: Controls) {
  const gesture = useRef<{ x: number; y: number; dragged: boolean } | null>(null), moved = useRef(false);
  const [dragging, setDragging] = useState(false);
  const reset = () => { if (gesture.current?.dragged) onDragEnd(); gesture.current = null; setDragging(false); };
  return { dragging, click: (action: () => void) => { if (!moved.current) action(); moved.current = false; }, handlers: {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => { if (event.button !== 0 || !draggable) return; moved.current = false; gesture.current = { x: event.clientX, y: event.clientY, dragged: false }; onDragStart(); event.currentTarget.setPointerCapture(event.pointerId); },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => { const start = gesture.current; if (!start) return; const dx = event.clientX - start.x, dy = event.clientY - start.y; if (Math.hypot(dx, dy) > 7) start.dragged = true; if (start.dragged) { moved.current = true; setDragging(true); onDrag(dx, dy); } },
    onPointerUp: reset,
    onPointerCancel: () => { moved.current = true; reset(); },
    onLostPointerCapture: reset,
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => { if (!draggable) return; const step = event.shiftKey ? 30 : 10; const direction: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0] }; if (direction[event.key]) { event.preventDefault(); onNudge(...direction[event.key]); } },
  } };
}
