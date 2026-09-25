import { createContext, useContext, useLayoutEffect, useRef } from 'react';

export interface PanelReadiness { pending: Set<symbol>; listeners: Set<() => void> }
export const PanelReadinessContext = createContext<PanelReadiness | null>(null);
export const PanelVisibilityContext = createContext(true);
export const usePanelVisible = () => useContext(PanelVisibilityContext);
export function usePanelLoading(loading: boolean) {
  const readiness = useContext(PanelReadinessContext), id = useRef(Symbol('panel-read'));
  useLayoutEffect(() => {
    if (!readiness) return;
    if (loading) readiness.pending.add(id.current); else readiness.pending.delete(id.current);
    readiness.listeners.forEach(listener => listener());
    return () => { readiness.pending.delete(id.current); };
  }, [loading, readiness]);
}
