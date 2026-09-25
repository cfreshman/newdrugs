import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, X } from '@phosphor-icons/react';

export function Dialog({ title, close, back, children, placement = 'settings' }: { title: string; close(): void; back?: () => void; children: ReactNode; placement?: 'settings' | 'task' }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={`sheet ${placement}-sheet`} aria-labelledby="sheet-title" onClose={() => closeRef.current()}
    onPointerDown={e => { if (e.button === 0 && e.target === e.currentTarget) { const rect = e.currentTarget.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) close(); } }}>
    <div className="sheet-heading"><h2 id="sheet-title">{title}</h2><div className="sheet-actions">{back && <button className="close" type="button" aria-label="Back" onClick={back}><ArrowLeft size={21} /></button>}<button className="close" type="button" aria-label="Close" onClick={close}><X size={21} /></button></div></div>
    {children}
  </dialog>;
}
