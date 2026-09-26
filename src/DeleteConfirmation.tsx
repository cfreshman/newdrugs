import {useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';

/** Shared inline review for irreversible deletions. The caller owns the operation and its errors. */
export function DeleteConfirmation({title,detail,confirmLabel='Delete',pendingLabel='Deleting…',busy=false,onCancel,onConfirm}:{title:string;detail?:ReactNode;confirmLabel?:string;pendingLabel?:string;busy?:boolean;onCancel():void;onConfirm():void|Promise<void>}){
  const id=useId(),container=useRef<HTMLElement>(null),cancel=useRef<HTMLButtonElement>(null),pending=useRef(false);
  const [saving,setSaving]=useState(false),disabled=busy||saving;
  useLayoutEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null,node=container.current;
    cancel.current?.focus({preventScroll:true});
    return()=>{if(previous?.isConnected&&(document.activeElement===document.body||node?.contains(document.activeElement)))previous.focus({preventScroll:true});};
  },[]);
  const confirm=async()=>{if(busy||pending.current)return;pending.current=true;setSaving(true);try{await onConfirm();}finally{pending.current=false;setSaving(false);}};
  return <section ref={container} className="delete-confirmation" role="group" aria-labelledby={id} aria-busy={disabled||undefined} onClick={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();event.preventDefault();if(!disabled)onCancel();}}}>
    <div className="delete-confirmation-copy"><strong id={id}>{title}</strong>{detail&&<p className="delete-confirmation-detail">{detail}</p>}</div>
    <div className="delete-confirmation-actions"><button ref={cancel} type="button" disabled={disabled} onClick={onCancel}>Cancel</button><button type="button" className="delete-confirmation-submit" disabled={disabled} onClick={()=>void confirm()}>{saving?pendingLabel:confirmLabel}</button></div>
  </section>;
}
