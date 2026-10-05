import {scrollFromPanelHeader} from './panelHeaderScroll';
import {PanelReadinessContext,PanelVisibilityContext,useReadinessBoundary} from './PanelReadiness';
import { createContext, useLayoutEffect, useRef, useId, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { ArrowLeft, X } from '@phosphor-icons/react';

export const SettingsHeaderActionContext = createContext<Dispatch<SetStateAction<ReactNode>> | null>(null);

export function Dialog({ title, close, back, children, placement = 'settings', visible = true }: {visible?:boolean; title: string; close(): void; back?: () => void; children: ReactNode; placement?: 'settings' | 'task' }) {
  const {readiness,loading}=useReadinessBoundary();
  const [headerAction,setHeaderAction]=useState<ReactNode>(null);
  const ref = useRef<HTMLDialogElement>(null),scroll=useRef({outer:0,body:0}),shown=useRef(visible),titleId=useId();shown.current=visible;
  const closeRef = useRef(close); closeRef.current = close;
  useLayoutEffect(() => { const dialog = ref.current!,body=dialog.querySelector<HTMLElement>(':scope > .sheet-body');if(visible){if(!dialog.open)dialog.showModal();dialog.scrollTop=scroll.current.outer;if(body)body.scrollTop=scroll.current.body;}else{scroll.current={outer:dialog.scrollTop,body:body?.scrollTop||0};if(dialog.open)dialog.close();} }, [visible]);
  useLayoutEffect(()=>()=>{ref.current?.close();},[]);
  return <dialog ref={ref} className={`sheet ${placement}-sheet`} aria-labelledby={titleId} inert={!visible} onClose={() => {if(shown.current&&!ref.current?.open)closeRef.current();}}
    onPointerDown={e => { if (e.button === 0 && e.target === e.currentTarget) { const rect = e.currentTarget.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) close(); } }}>
    <div className="sheet-heading" onClick={event=>scrollFromPanelHeader(event,ref.current?.querySelector<HTMLElement>(':scope > .sheet-body')||ref.current)}><h2 id={titleId}>{title}</h2><div className="sheet-actions">{placement==='settings'&&headerAction}{back && <button className="close" type="button" aria-label="Back" onClick={back}><ArrowLeft size={21} /></button>}<button className="close" type="button" aria-label="Close" onClick={close}><X size={21} /></button></div></div>
    <PanelVisibilityContext.Provider value={visible}><PanelReadinessContext.Provider value={readiness}><SettingsHeaderActionContext.Provider value={placement==='settings'?setHeaderAction:null}><div className="sheet-body" data-loading={loading||undefined} aria-busy={loading} inert={loading}>{children}</div></SettingsHeaderActionContext.Provider></PanelReadinessContext.Provider></PanelVisibilityContext.Provider>
  </dialog>;
}
