import {useCallback, useEffect, useLayoutEffect, useRef} from 'react';
import {readLogSequence} from './logSequence';
import {destinationPath, parseDestination, type Destination} from '../shared/navigation';
import type {PanelLocation} from './panelHistory';
import {modeForDestination, type AppMode} from '../shared/experience';
import type {ArtifactVersionSelector} from '../shared/artifacts';

export interface BrowserPanelState {replace?:boolean;tab:string; stack:Destination[]}
export interface PrimaryRouteState {destination:Destination; browser?:BrowserPanelState; panels?:PanelLocation[]; artifact?:{id:string;contentRevision?:ArtifactVersionSelector;placement?:string}}
type ArtifactRoute=NonNullable<PrimaryRouteState['artifact']>;
interface ArtifactHistoryEntry extends ArtifactRoute {pushedFromApp:boolean}
const sameArtifact=(left:ArtifactRoute|undefined,right:ArtifactRoute|undefined)=>Boolean(left&&right&&left.id===right.id&&left.contentRevision===right.contentRevision&&left.placement===right.placement);
const matchesArtifactUrl=(artifact:ArtifactRoute|undefined,destination:Destination|null)=>Boolean(artifact&&destination?.view==='artifacts'&&artifact.id===destination.resourceId&&artifact.contentRevision===destination.artifactVersion);
function artifactRoute(destination:Destination,saved:PrimaryRouteState|undefined,entry:ArtifactHistoryEntry|undefined):PrimaryRouteState {
  const mode=destination.mode||'agent',id=destination.resourceId!;
  const artifact:ArtifactRoute={id,...(destination.artifactVersion!==undefined?{contentRevision:destination.artifactVersion}:{})};
  if(matchesArtifactUrl(saved?.artifact,destination)&&sameArtifact(saved?.artifact,entry)&&saved?.destination){
    try{
      const underlying=parseDestination(destinationPath(saved.destination),location.origin);
      if(underlying&&(saved.destination.mode||modeForDestination(saved.destination))===mode){
        const logSequence=underlying.view==='log'?readLogSequence(saved.destination.logSequence):undefined;
        return {destination:{...underlying,mode,...(logSequence?{logSequence}:{})},browser:saved.browser,panels:saved.panels,artifact:{...artifact,...(typeof saved.artifact?.placement==='string'?{placement:saved.artifact.placement}:{})}};
      }
    }catch{/* Ignore invalid saved source navigation. */}
  }
  return {destination:{view:'chat',mode},artifact};
}
/** One history entry per settled navigation, including a restorable in-app Back stack. */
export function usePrimaryRoute(enabled:boolean, mode:AppMode, state:PrimaryRouteState, restore:(state:PrimaryRouteState)=>void, landingPage:AppMode='agent') {
  const consumedReplacements=useRef(new WeakSet<BrowserPanelState>());
  const lastDestination=useRef<Destination|null>(null);
  const ready=useRef(false), replace=useRef(true), apply=useRef(restore);
  const replaceArtifactEntry=useRef(false);
  const closingArtifact=useRef(false),current=useRef(state);current.current=state;
  const lastArtifact=useRef<string|undefined>(undefined);
  apply.current=restore;
  const destination={...state.destination,mode};
  const naturalPath=state.artifact?destinationPath({view:'artifacts',resourceId:state.artifact.id,artifactVersion:state.artifact.contentRevision,mode}):destinationPath(destination),path=naturalPath==='/'&&landingPage!=='agent'?'/agent':naturalPath, serialized=JSON.stringify({...state,destination});
  useEffect(()=>{
    if(!enabled)return;
    const pop=(event:PopStateEvent)=>{
      const destination=parseDestination(location.href,location.origin);if(!destination)return;
      closingArtifact.current=false;
      replaceArtifactEntry.current=false;
      replace.current=true;
      const saved=event.state?.newdrugs;
      if(destination.view==='artifacts'&&destination.resourceId){apply.current(artifactRoute(destination,saved,event.state?.newdrugsArtifact));return;}
      // Never trust history state in place of the validated visible URL.
      const matches=saved?.destination&&destinationPath(saved.destination)===destinationPath(destination);
      const logSequence=matches&&destination.view==='log'?readLogSequence(saved.destination.logSequence):undefined;
      apply.current({destination:{...destination,...(logSequence?{logSequence}:{})},...(matches?{browser:saved.browser,panels:saved.panels}: {})});
    };
    window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);
  },[enabled]);
  useLayoutEffect(()=>{
    if(!enabled)return;
    const initial=parseDestination(location.href,location.origin);
    if(!ready.current&&initial?.view==='artifacts'&&initial.resourceId&&!matchesArtifactUrl(state.artifact,initial)){replace.current=true;apply.current(artifactRoute(initial,history.state?.newdrugs,history.state?.newdrugsArtifact));return;}
    const write=()=>{
      // An interactive result can open before the first settled route frame.
      // Keep a source entry for Back instead of replacing it with the overlay.
      if(state.artifact&&!ready.current&&initial?.view!=='artifacts'){
        const source=JSON.parse(serialized);delete source.artifact;
        const payload={...(history.state||{}),newdrugs:source};delete payload.newdrugsArtifact;
        const natural=destinationPath(destination),sourcePath=natural==='/'&&landingPage!=='agent'?'/agent':natural;
        history.replaceState(payload,'',sourcePath);ready.current=true;replace.current=false;
      }
      const payload={...(history.state||{}),newdrugs:JSON.parse(serialized)};
      const replacement=state.browser?.replace&&!consumedReplacements.current.has(state.browser);
      const previous=lastDestination.current;
      const sameList=previous?.mode===mode&&previous?.view==='log'&&destination.view==='log'&&destination.logSequence&&previous.logSequence?.key===destination.logSequence.key;
      const previousEntry=history.state?.newdrugsArtifact as ArtifactHistoryEntry|undefined,samePath=location.pathname+location.search===path;
      const replaceOpened=Boolean(state.artifact&&replaceArtifactEntry.current);
      const replacing=!ready.current||replace.current||replaceOpened||!state.artifact&&(replacement||sameList)||samePath&&(!state.artifact||sameArtifact(previousEntry,state.artifact));
      if(state.artifact){
        const retainSource=replaceOpened&&previousEntry?.id===state.artifact.id&&matchesArtifactUrl(previousEntry,initial)&&sameArtifact(previousEntry,history.state?.newdrugs?.artifact);
        const pushedFromApp=!replacing||(retainSource||samePath&&sameArtifact(previousEntry,state.artifact))&&previousEntry?.pushedFromApp===true;
        payload.newdrugsArtifact={...state.artifact,pushedFromApp};
      }else delete payload.newdrugsArtifact;
      if(replacing)history.replaceState(payload,'',path);
      else history.pushState(payload,'',path);
      if(state.browser?.replace)consumedReplacements.current.add(state.browser);
      lastDestination.current=destination;lastArtifact.current=state.artifact?.id;ready.current=true;replace.current=false;replaceArtifactEntry.current=false;
    };
    // The top layer must never become interactive before its Back entry exists.
    if(state.artifact||lastArtifact.current){write();return;}
    const frame=requestAnimationFrame(write);
    return()=>cancelAnimationFrame(frame);
  },[enabled,path,serialized]);
  const closeArtifact=useCallback(()=>{
    if(closingArtifact.current)return true;
    if(!current.current.artifact)return false;
    const visible=parseDestination(location.href,location.origin),entry=history.state?.newdrugsArtifact as ArtifactHistoryEntry|undefined;
    if(matchesArtifactUrl(current.current.artifact,visible)&&sameArtifact(history.state?.newdrugs?.artifact,current.current.artifact)&&sameArtifact(entry,current.current.artifact)&&entry?.pushedFromApp===true){closingArtifact.current=true;history.back();return true;}
    replace.current=true;return false;
  },[]);
  const replaceArtifact=useCallback(()=>{if(current.current.artifact)replaceArtifactEntry.current=true;},[]);
  return {closeArtifact,replaceArtifact};
}
