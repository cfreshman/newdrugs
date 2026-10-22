import {createContext,useContext,useEffect,useId,useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore,type ReactNode,type RefObject} from 'react';
import {ArrowsOutSimple,CaretDown,CaretUp,Check,CircleNotch,ShareNetwork,X} from '@phosphor-icons/react';
import type {ArtifactDetail,ArtifactPresentationReference,ArtifactVersionSelector} from '../shared/artifacts';
import type {RecordInvalidation} from '../shared/liveState';
import {ArtifactCache,artifactCacheKey} from './artifactCache';
import {ArtifactFrame} from './ArtifactFrame';
import {ArtifactMenu,ArtifactEditor,type ArtifactEditKind} from './ArtifactControls';
import {useArtifactShare} from './useArtifactShare';
import {NavLink} from './NavLink';
import {PanelVisibilityContext} from './PanelReadiness';
import {observeRecordInterests} from './recordInterests';
import {messagePreviewHeight,useMessageExpansion} from './useMessageExpansion';
import './artifactExperience.css';

export interface ArtifactOpening {id:string;placement?:string;contentRevision?:ArtifactVersionSelector}
interface ArtifactActions {cache:ArtifactCache;opened:ArtifactOpening|null;visible:boolean;awake:boolean;scrollRef:RefObject<HTMLDivElement|null>;refreshDisabled:boolean;open(id:string,placement?:string,contentRevision?:ArtifactVersionSelector,replace?:boolean):void;close():void;refresh(artifact:ArtifactDetail):void;discuss(artifact:ArtifactDetail):void}
const Context=createContext<ArtifactActions|null>(null);
const useArtifacts=()=>{const context=useContext(Context);if(!context)throw Error('Missing artifact context.');return context;};
export function ArtifactExperience({accountId,opened,visible,scrollRef,refreshDisabled,open,close,refresh,discuss,children}:{accountId?:string;opened:ArtifactOpening|null;visible:boolean;scrollRef:RefObject<HTMLDivElement|null>;refreshDisabled:boolean;open(id:string,placement?:string,contentRevision?:ArtifactVersionSelector,replace?:boolean):void;close():void;refresh(artifact:ArtifactDetail):void;discuss(artifact:ArtifactDetail):void;children:ReactNode}){
  const cache=useMemo(()=>new ArtifactCache(),[accountId]);
  const [awake,setAwake]=useState(document.visibilityState!=='hidden');
  useSyncExternalStore(cache.subscribe,cache.snapshot);
  useEffect(()=>{
    const records=(event:Event)=>{if(event instanceof CustomEvent)cache.invalidate(Array.isArray(event.detail)?{keys:event.detail}:event.detail as RecordInvalidation);};
    const poll=()=>{setAwake(document.visibilityState!=='hidden');void cache.poll();};
    window.addEventListener('newdrugs:records',records);window.addEventListener('focus',poll);document.addEventListener('visibilitychange',poll);
    const timer=setInterval(poll,10000),unobserve=observeRecordInterests(['artifacts']);
    return()=>{clearInterval(timer);unobserve();window.removeEventListener('newdrugs:records',records);window.removeEventListener('focus',poll);document.removeEventListener('visibilitychange',poll);cache.dispose();};
  },[cache]);
  return <Context.Provider value={{cache,opened,visible,awake,scrollRef,refreshDisabled,open,close,refresh,discuss}}>{children}{opened&&(!opened.placement||!cache.mounted(opened.placement))&&<ArtifactSurface key={opened.id} id={opened.id} contentRevision={opened.contentRevision} placement={`viewer:${opened.id}`} expanded inline={false}/>}</Context.Provider>;
}

export function ArtifactAttachment({reference,messageId,createdAt}:{reference:ArtifactPresentationReference;messageId:string;createdAt:string}){
  const context=useArtifacts(),contentRevision=reference.contentRevision??'legacy',placement=`${messageId}:${reference.artifactId}:${contentRevision}`;
  if(reference.presentation==='link')return <NavLink className="message-file artifact-reference" to={{view:'artifacts',resourceId:reference.artifactId,artifactVersion:contentRevision}} navigate={()=>context.open(reference.artifactId,undefined,contentRevision)}>{reference.title}</NavLink>;
  return <ArtifactSurface id={reference.artifactId} contentRevision={contentRevision} placement={placement} title={reference.title} expanded={context.opened?.placement===placement} inline/>;
}

function safeLink(value:string){try{const url=new URL(value,location.origin);return ['https:','http:','mailto:','tel:'].includes(url.protocol)?url.href:null;}catch{return null;}}
function ArtifactSurface({id,placement,title,contentRevision,expanded,inline}:{id:string;placement:string;title?:string;contentRevision?:ArtifactVersionSelector;expanded:boolean;inline:boolean}){
  const context=useArtifacts(),{cache}=context;
  useSyncExternalStore(cache.subscribe,cache.snapshot);
  const key=artifactCacheKey(id,contentRevision),value=cache.get(key),slot=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDialogElement>(null),dismiss=useRef<HTMLButtonElement>(null),editSource=useRef<ArtifactDetail|null>(null);
  const [near,setNear]=useState(false),[height,setHeight]=useState(256),[edit,setEdit]=useState<ArtifactEditKind|null>(null),[error,setError]=useState(''),[link,setLink]=useState<string|null>(null);
  const expansion=useMessageExpansion({wrapper:slot,scrollRef:context.scrollRef}),contentId=useId();
  const [preview,setPreview]=useState(256);
  useLayoutEffect(()=>{
    const measure=()=>{if(slot.current)setPreview(messagePreviewHeight(slot.current,true));};
    measure();window.addEventListener('resize',measure);return()=>window.removeEventListener('resize',measure);
  },[]);
  const long=height>preview+2,inlineHeight=long&&!expansion.expanded?preview:height;
  const renderedTitle=value.document?.title||title||'Artifact',share=useArtifactShare({id,title:renderedTitle});
  const active=cache.active(placement),show=(expanded||near&&context.visible)&&context.awake;
  useLayoutEffect(()=>inline?cache.mount(placement):undefined,[cache,placement,inline]);
  useEffect(()=>{
    if(!inline)return;
    const element=slot.current;if(!element)return;
    const observer=new IntersectionObserver(entries=>setNear(entries[0]?.isIntersecting||false),{root:element.closest('.conversation'),rootMargin:'120px 0px'});
    observer.observe(element);return()=>observer.disconnect();
  },[inline]);
  useLayoutEffect(()=>{cache.place(placement,key,show,expanded&&context.awake);return()=>cache.place(placement,key,false,false);},[cache,placement,key,show,expanded,context.awake]);
  useEffect(()=>{
    if(!active)return;const release=cache.watch(key);if(cache.get(key).document)void cache.poll();void cache.load(key);
    return release;
  },[cache,key,active]);
  useEffect(()=>{if(expanded&&!value.unavailable)void cache.manage(key);},[cache,key,expanded,value.document?.revision,value.unavailable,value.owner]);
  useLayoutEffect(()=>{
    const element=dialog.current;if(!element)return;
    if(expanded){element.showModal();dismiss.current?.focus({preventScroll:true});}
    else{if(element.open)element.close();setEdit(null);editSource.current=null;setLink(null);}
    return()=>{if(element.open)element.close();};
  },[expanded]);
  useEffect(()=>{if(value.unavailable){setEdit(null);editSource.current=null;}},[value.unavailable]);
  const cancelEdit=()=>{setEdit(null);editSource.current=null;};
  const changed=(artifact:ArtifactDetail)=>{cache.updateOwner(artifact);cancelEdit();};
  const displayedVersion=value.document?.contentRevision??contentRevision,historical=Boolean(value.document&&value.owner&&value.document.contentRevision!==value.owner.contentRevision);
  return <div ref={slot} className={`artifact-slot ${inline?'artifact-inline':'artifact-standalone'}`} data-artifact-id={id} data-artifact-version={contentRevision??'latest'} style={inline?{'--artifact-inline-height':`${inlineHeight}px`,'--artifact-content-height':`${height}px`} as React.CSSProperties:undefined}>
    <dialog id={contentId} ref={dialog} className="artifact-surface" data-expanded={expanded||undefined} role={expanded?'dialog':'group'} aria-modal={expanded||undefined} aria-label={renderedTitle} onCancel={event=>{event.preventDefault();context.close();}} onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();if(edit)cancelEdit();else if(expanded)context.close();}}}>
      <header className="artifact-header" hidden={!expanded}>
        <h2>{edit==='title'?'Rename':edit==='instruction'?'Refresh instructions':edit==='delete'?'Delete artifact':renderedTitle}</h2>
        <button type="button" className="close" aria-label={share.copied?'Link copied':'Share artifact'} title={share.copied?'Link copied':'Share artifact'} disabled={share.sharing} onClick={()=>void share.share()}>{share.copied?<Check size={23}/>:<ShareNetwork size={23}/>}</button>
        {value.owner&&<ArtifactMenu artifact={value.owner} historical={historical} refreshDisabled={context.refreshDisabled} onRefresh={()=>context.refresh(value.owner!)} onDiscuss={()=>context.discuss({...value.owner!,title:value.document?.title||value.owner!.title,contentRevision:value.document?.contentRevision||value.owner!.contentRevision})} onEdit={kind=>{editSource.current=value.owner!;setEdit(kind);}} onChanged={changed} onError={setError}/>}
        <button ref={dismiss} type="button" className="close" aria-label="Close artifact" onClick={context.close}><X size={23}/></button>
      </header>
      {expanded&&contentRevision!==undefined&&<div className="artifact-version-bar"><span className="quiet small">{typeof displayedVersion==='number'?`Version ${displayedVersion}`:''}</span><NavLink to={{view:'artifacts',resourceId:id}} navigate={()=>context.open(id,undefined,undefined,true)}>Latest version</NavLink></div>}
      {(error||share.error)&&<p className="artifact-action-error error" role="alert">{error||share.error}</p>}
      {edit&&editSource.current&&expanded&&<div className="artifact-edit-body"><ArtifactEditor artifact={editSource.current} kind={edit} cancel={cancelEdit} saved={changed} deleted={()=>{cache.remove(id);cancelEdit();}}/></div>}
      <div className="artifact-display" hidden={Boolean(edit)}>
        {active&&value.document&&!value.unavailable?<PanelVisibilityContext.Provider value={active}><ArtifactFrame artifact={value.document} display={expanded?'expanded':'inline'} onEscape={()=>{if(expanded)context.close();}} onLink={href=>setLink(safeLink(href))} onResize={next=>{if(!expanded)setHeight(Math.max(80,Math.min(20000,Math.ceil(next))));}}/></PanelVisibilityContext.Provider>:<div className="artifact-placeholder">{value.unavailable?<span>This artifact is no longer available.</span>:value.error?<><span>{value.error}</span><button type="button" className="text-link" onClick={()=>void cache.load(key,true)}>Try again</button></>:show?<CircleNotch className="spin" size={22} aria-label="Loading artifact"/>:<span>{renderedTitle}</span>}</div>}
      </div>
      {value.error&&value.document&&<p className="artifact-action-error error" role="alert">{value.error}</p>}
      {link&&<div className="artifact-link-prompt"><a href={link} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">Open {new URL(link).hostname||link.split(':')[0]} link</a><button type="button" aria-label="Dismiss link" onClick={()=>setLink(null)}><X size={16}/></button></div>}
    </dialog>
    {inline&&<>{typeof displayedVersion==='number'&&<div className="artifact-update">Version {displayedVersion}</div>}<div className="artifact-caption">{long&&!value.unavailable&&<button type="button" className="message-toggle" aria-expanded={expansion.expanded} aria-controls={contentId} onClick={expansion.toggle}>{expansion.expanded?'Show less':'Show more'}{expansion.expanded?<CaretUp size={14}/>:<CaretDown size={14}/>}</button>}<NavLink to={{view:'artifacts',resourceId:id,artifactVersion:displayedVersion}} navigate={()=>context.open(id,placement,displayedVersion)}>Open full screen<ArrowsOutSimple size={14}/></NavLink></div></>}
  </div>;
}
