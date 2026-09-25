import {useContext,useRef,type ReactNode} from 'react';
import {PanelVisibilityContext} from './PanelReadiness';
/** A navigation ancestor keeps its DOM, pagination, drafts and exact scroll. */
export function PreservedPanels({activeKey,ancestorKeys,reset,children}:{activeKey:string;ancestorKeys:string[];reset:number;children:ReactNode}) {
  const visible=useContext(PanelVisibilityContext),cache=useRef(new Map<string,ReactNode>()),generation=useRef(reset);
  if(generation.current!==reset){cache.current.clear();generation.current=reset;}
  const keep=new Set([...ancestorKeys,activeKey]);
  for(const key of cache.current.keys())if(!keep.has(key))cache.current.delete(key);
  cache.current.set(activeKey,children);
  return <>{[...cache.current].map(([key,content])=><div className="composer-view" key={key} hidden={key!==activeKey} inert={key!==activeKey} aria-hidden={key!==activeKey||undefined}><PanelVisibilityContext.Provider value={visible&&key===activeKey}>{content}</PanelVisibilityContext.Provider></div>)}</>;
}
