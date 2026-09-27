import {useContext,useRef,type ReactNode} from 'react';
import {PanelVisibilityContext} from './PanelReadiness';
/** A navigation ancestor keeps its DOM, pagination, drafts and exact scroll. */
export function PreservedPanels({activeKey,ancestorKeys,reset,children,retainVisited=false,underlay,renderPanel}:{activeKey:string;ancestorKeys:string[];reset:number;retainVisited?:boolean;renderPanel?(key:string,panel:ReactNode,active:boolean):ReactNode;underlay?:{key:string;content:ReactNode};children:ReactNode}) {
  const visible=useContext(PanelVisibilityContext),cache=useRef(new Map<string,ReactNode>()),generation=useRef(reset);
  if(generation.current!==reset){cache.current.clear();generation.current=reset;}
  const keep=new Set([...ancestorKeys,activeKey,...(underlay?[underlay.key]:[])]);
  if(underlay&&!cache.current.has(underlay.key))cache.current.set(underlay.key,underlay.content);
  for(const key of cache.current.keys())if(!keep.has(key)&&(!retainVisited||cache.current.size>30))cache.current.delete(key);
  cache.current.set(activeKey,children);
  return <>{[...cache.current].map(([key,content])=>{const panel=<div className={`composer-view ${key===underlay?.key&&key!==activeKey?'composer-underlay':''}`} key={key} hidden={key!==activeKey&&key!==underlay?.key} inert={key!==activeKey} aria-hidden={key!==activeKey||undefined}><PanelVisibilityContext.Provider value={visible&&key===activeKey}>{content}</PanelVisibilityContext.Provider></div>;return renderPanel?renderPanel(key,panel,visible&&key===activeKey):panel;})}</>;
}
