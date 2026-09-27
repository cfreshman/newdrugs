import { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';

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
    return () => { readiness.pending.delete(id.current); readiness.listeners.forEach(listener => listener()); };
  }, [loading, readiness]);
}

/** Mount the shell immediately, keeping asynchronous content mounted but hidden. */
export function useReadinessBoundary() {
  const readiness = useRef<PanelReadiness>({pending:new Set(),listeners:new Set()}).current;
  const [loading,setLoading] = useState(false);
  useLayoutEffect(()=>{
    const update=()=>setLoading(readiness.pending.size>0);
    readiness.listeners.add(update);update();
    return()=>{readiness.listeners.delete(update);};
  },[readiness]);
  return {readiness,loading};
}
