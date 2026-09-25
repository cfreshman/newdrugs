import { useRef, useState } from 'react';
import { Microphone, PaperPlaneRight, X } from '@phosphor-icons/react';

interface Props { active: boolean; listening: boolean; finishing: boolean; canSend: boolean; busy: boolean; draggable?: boolean; hideIcon?: boolean; onTap(): void; onCancel(): void; onSend(): void; onDragStart(): void; onDrag(dx: number, dy: number): void; onDragEnd(): void; onNudge(dx: number, dy: number): void }
export function Orb({ active, listening, finishing, canSend, busy, draggable = true, hideIcon = false, onTap, onCancel, onSend, onDragStart, onDrag, onDragEnd, onNudge }: Props) {
  const gesture = useRef<{ x: number; y: number; dragged: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const moved = useRef(false);
  const reset = () => { if (gesture.current?.dragged) onDragEnd(); gesture.current = null; setDragging(false); };
  const variants = active
    ? [{ key: 'cancel', label: 'Cancel dictation', color: 'red', action: onCancel, icon: <X size={25} weight="bold" />, disabled: finishing },
       { key: 'send', label: 'Send dictation', color: 'green', action: onSend, icon: <PaperPlaneRight size={25} weight="fill" />, disabled: finishing || !canSend || busy }]
    : [{ key: 'dictate', label: 'Start dictation', color: 'blue', action: onTap, icon: <Microphone size={23} />, disabled: false }];
  return <div className={`orb-stage ${active ? 'split' : ''}`}>
    {variants.map(variant => <button key={variant.key} className={`orb ${variant.color} ${active ? 'dictation-action' : ''} ${listening ? 'listening' : ''} ${busy ? 'thinking' : ''} ${dragging ? 'dragging' : ''}`}
      aria-label={variant.label} disabled={variant.disabled}
      aria-describedby="orb-hint" type="button" title={active ? variant.label : draggable ? 'Dictate · drag to move chat' : 'Dictate'}
      onPointerDown={e => { if (e.button !== 0 || !draggable) return; moved.current = false; gesture.current = { x: e.clientX, y: e.clientY, dragged: false }; onDragStart(); e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={e => {
        const g = gesture.current;
        if (!g) return;
        const dx = e.clientX - g.x, dy = e.clientY - g.y;
        if (Math.hypot(dx, dy) > 7) g.dragged = true;
        if (g.dragged) {
          moved.current = true; setDragging(true);
          onDrag(dx, dy);
        }
      }}
      onPointerUp={reset} onPointerCancel={() => { moved.current = true; reset(); }} onLostPointerCapture={reset}
      onKeyDown={e => {
        if (!draggable) return;
        const step = e.shiftKey ? 30 : 10;
        const directions: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (directions[e.key]) { e.preventDefault(); onNudge(...directions[e.key]); }
      }}
      onClick={() => { if (!moved.current) variant.action(); moved.current = false; }}>
      <span className="orb-core" />
      <span className={`orb-icon ${hideIcon && !active ? 'icon-hidden' : ''}`} aria-hidden="true">{variant.icon}</span>
    </button>)}
  </div>;
}
