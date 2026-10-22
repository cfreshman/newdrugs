// @vitest-environment jsdom
import {act,createElement,useState} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {usePrimaryRoute,type PrimaryRouteState} from '../src/usePrimaryRoute';
import type {AppMode} from '../shared/experience';
import {setupDOM} from './dom';
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{history.replaceState({},'','/');dom=setupDOM();});afterEach(()=>dom.cleanup());
function Harness({mode,state,landingPage}:{mode:AppMode;state:PrimaryRouteState;landingPage?:AppMode}){usePrimaryRoute(true,mode,state,()=>{},landingPage);return null;}
it('replaces neighbor navigation once without turning later mode switches into replacements',async()=>{
 const push=vi.spyOn(history,'pushState'),replace=vi.spyOn(history,'replaceState');const show=async(mode:AppMode,state:PrimaryRouteState)=>{await act(async()=>dom.root.render(createElement(Harness,{mode,state})));dom.frame();};
 await show('log',{destination:{view:'log'}});await show('log',{destination:{view:'log',resourceId:'one'},browser:{tab:'home',stack:[{view:'log'},{view:'log',resourceId:'one'}]}});
 const next:PrimaryRouteState={destination:{view:'log',resourceId:'two'},browser:{tab:'home',replace:true,stack:[{view:'log'},{view:'log',resourceId:'two'}]}};await show('log',next);expect(location.pathname).toBe('/log/two');expect(push).toHaveBeenCalledTimes(1);expect(replace).toHaveBeenCalledTimes(2);
 await show('agent',{destination:{view:'chat'}});await show('log',next);expect(push).toHaveBeenCalledTimes(3);
});

it('uses explicit /agent when the root URL belongs to another landing page',async()=>{
 await act(async()=>dom.root.render(createElement(Harness,{mode:'agent',state:{destination:{view:'chat'}},landingPage:'log'})));dom.frame();expect(location.pathname).toBe('/agent');
 await act(async()=>dom.root.render(createElement(Harness,{mode:'agent',state:{destination:{view:'chat'}},landingPage:'agent'})));dom.frame();expect(location.pathname).toBe('/');
});

it('replaces Agent list navigation and restores its source context from browser history',async()=>{
 const restore=vi.fn(),push=vi.spyOn(history,'pushState'),context={key:'profile-list',ids:['one','two'],query:{scope:'shared' as const,personId:'friend'}};
 function Agent({state}:{state:PrimaryRouteState}){usePrimaryRoute(true,'agent',state,restore);return null;}
 const show=async(state:PrimaryRouteState)=>{await act(async()=>dom.root.render(createElement(Agent,{state})));dom.frame();};
 await show({destination:{view:'person',resourceId:'friend'}});
 await show({destination:{view:'log',resourceId:'one',logSequence:context}});
 await show({destination:{view:'log',resourceId:'two',logSequence:context}});
 expect(location.pathname).toBe('/agent/log/two');expect(push).toHaveBeenCalledTimes(1);
 const saved=history.state;
 await act(async()=>window.dispatchEvent(new PopStateEvent('popstate',{state:saved})));
 expect(restore.mock.lastCall![0].destination).toMatchObject({view:'log',mode:'agent',resourceId:'two',logSequence:{key:'profile-list',ids:['one','two']}});
 await show({destination:{view:'chat'}});expect(push).toHaveBeenCalledTimes(1);
 await show({destination:{view:'log',resourceId:'two',logSequence:context}});expect(push).toHaveBeenCalledTimes(2);
});
it('writes and restores the selected Log day in browser history',async()=>{
 const restore=vi.fn();function Day({date}:{date:string}){usePrimaryRoute(true,'log',{destination:{view:'log',date}},restore);return null;}
 await act(async()=>dom.root.render(createElement(Day,{date:'2026-09-29'})));dom.frame();const original=history.state;
 await act(async()=>dom.root.render(createElement(Day,{date:'2026-08-01'})));dom.frame();expect(location.pathname+location.search).toBe('/log?date=2026-08-01');
 history.replaceState(original,'','/log?date=2026-09-29');await act(async()=>window.dispatchEvent(new PopStateEvent('popstate',{state:original})));expect(restore.mock.lastCall?.[0].destination).toMatchObject({view:'log',date:'2026-09-29'});
});

let overlayRoute:ReturnType<typeof usePrimaryRoute>,visibleState:PrimaryRouteState,setVisibleState:(state:PrimaryRouteState)=>void;
function OverlayHarness({initial,mode='agent'}:{initial:PrimaryRouteState;mode?:AppMode}){
 const [state,setState]=useState(initial);visibleState=state;setVisibleState=setState;
 overlayRoute=usePrimaryRoute(true,state.destination.mode||mode,state,setState);
 return null;
}
const traverse=async(action:()=>void)=>{
 await act(async()=>{const changed=new Promise<void>(resolve=>window.addEventListener('popstate',()=>resolve(),{once:true}));action();await changed;});dom.frame();
};
it('keeps the source mounted in route state while Back and Forward reopen the same artifact placement',async()=>{
 const source:PrimaryRouteState={destination:{view:'people',query:'weekend hikes',scope:'nearby'},browser:{tab:'explore',stack:[{view:'people',scope:'nearby'},{view:'person',resourceId:'friend'}]},panels:[{panel:'inbox',context:{resourceId:'update'}}]};
 await act(async()=>dom.root.render(createElement(OverlayHarness,{initial:source,mode:'friends'})));dom.frame();const sourcePath=location.pathname+location.search;
 act(()=>setVisibleState({...source,artifact:{id:'artifact-one',placement:'message-one:artifact-one'}}));dom.frame();
 expect(location.pathname).toBe('/friends/artifacts/artifact-one');
 expect(history.state.newdrugs).toMatchObject({...source,artifact:{id:'artifact-one',placement:'message-one:artifact-one'}});
 expect(visibleState.destination).toEqual(source.destination);
 await traverse(()=>{expect(overlayRoute.closeArtifact()).toBe(true);});
 expect(location.pathname+location.search).toBe(sourcePath);expect(visibleState.artifact).toBeUndefined();
 expect(visibleState.browser).toEqual(source.browser);expect(visibleState.panels).toEqual(source.panels);
 await traverse(()=>history.forward());
 expect(location.pathname).toBe('/friends/artifacts/artifact-one');
 expect(visibleState).toMatchObject({destination:{view:'people',mode:'friends',query:'weekend hikes',scope:'nearby'},artifact:{id:'artifact-one',placement:'message-one:artifact-one'}});
});
it('uses canonical Agent artifact paths and ignores a duplicate Close while Back is pending',async()=>{
 await act(async()=>dom.root.render(createElement(OverlayHarness,{initial:{destination:{view:'chat'}}})));dom.frame();
 act(()=>setVisibleState({destination:{view:'chat'},artifact:{id:'artifact-one'}}));dom.frame();expect(location.pathname).toBe('/artifacts/artifact-one');
 const back=vi.spyOn(history,'back');
 await traverse(()=>{expect(overlayRoute.closeArtifact()).toBe(true);expect(overlayRoute.closeArtifact()).toBe(true);});
 expect(back).toHaveBeenCalledOnce();expect(visibleState.artifact).toBeUndefined();
});
it('bootstraps a direct artifact URL over chat and replaces its URL when closing without app history',async()=>{
 history.replaceState({},'','/posts/artifacts/artifact-direct');
 const push=vi.spyOn(history,'pushState'),back=vi.spyOn(history,'back');
 await act(async()=>dom.root.render(createElement(OverlayHarness,{initial:{destination:{view:'chat'}}})));dom.frame();
 expect(visibleState).toMatchObject({destination:{view:'chat',mode:'posts'},artifact:{id:'artifact-direct'}});
 act(()=>{expect(overlayRoute.closeArtifact()).toBe(false);setVisibleState({destination:visibleState.destination});});dom.frame();
 expect(back).not.toHaveBeenCalled();expect(push).not.toHaveBeenCalled();expect(location.pathname).toBe('/posts/chat');
});
it('validates the artifact URL before accepting saved source state and placement',async()=>{
 const restore=vi.fn();
 function Source(){usePrimaryRoute(true,'agent',{destination:{view:'chat'}},restore);return null;}
 await act(async()=>dom.root.render(createElement(Source)));dom.frame();
 const wrong={newdrugs:{destination:{view:'person',resourceId:'another-person',mode:'agent'},browser:{tab:'wrong',stack:[]},artifact:{id:'another-artifact',placement:'stale-placement'}}};
 history.replaceState(wrong,'','/artifacts/artifact-one');
 act(()=>window.dispatchEvent(new PopStateEvent('popstate',{state:wrong})));
 expect(restore.mock.lastCall?.[0]).toEqual({destination:{view:'chat',mode:'agent'},artifact:{id:'artifact-one'}});
});
it('writes each artifact opening before a frame so immediate Back always returns to its source',async()=>{
 const source:PrimaryRouteState={destination:{view:'chat'},panels:[]};
 await act(async()=>dom.root.render(createElement(OverlayHarness,{initial:source})));
 // No RAF has run, including the initial ordinary route write.
 act(()=>setVisibleState({...source,artifact:{id:'first'}}));expect(location.pathname).toBe('/artifacts/first');
 await traverse(()=>{expect(overlayRoute.closeArtifact()).toBe(true);});expect(location.pathname).toBe('/');
 act(()=>setVisibleState({...source,artifact:{id:'second'}}));expect(location.pathname).toBe('/artifacts/second');
 await traverse(()=>history.back());expect(location.pathname).toBe('/');expect(visibleState.artifact).toBeUndefined();
});

it.each([3,'legacy'] as const)('preserves a direct artifact selector %s and replaces on Close without app history',async contentRevision=>{
 history.replaceState({},'',`/friends/artifacts/artifact-direct?version=${contentRevision}`);
 const push=vi.spyOn(history,'pushState'),back=vi.spyOn(history,'back');
 await act(async()=>dom.root.render(createElement(OverlayHarness,{initial:{destination:{view:'chat'}}})));dom.frame();
 expect(visibleState).toEqual({destination:{view:'chat',mode:'friends'},artifact:{id:'artifact-direct',contentRevision}});
 expect(history.state.newdrugsArtifact).toEqual({id:'artifact-direct',contentRevision,pushedFromApp:false});
 act(()=>{expect(overlayRoute.closeArtifact()).toBe(false);setVisibleState({destination:visibleState.destination});});
 expect(location.pathname+location.search).toBe('/friends/chat');expect(push).not.toHaveBeenCalled();expect(back).not.toHaveBeenCalled();
});

it('keeps separately opened versions in synchronous Back and Forward history',async()=>{
 const source:PrimaryRouteState={destination:{view:'people',scope:'all'},browser:{tab:'explore',stack:[{view:'people',scope:'all'}]}};
 await act(async()=>dom.root.render(createElement(OverlayHarness,{initial:source,mode:'friends'})));dom.frame();
 act(()=>setVisibleState({...source,artifact:{id:'graph',contentRevision:1,placement:'old-message'}}));
 expect(location.pathname+location.search).toBe('/friends/artifacts/graph?version=1');
 act(()=>setVisibleState({...source,artifact:{id:'graph',contentRevision:2,placement:'new-message'}}));
 expect(location.pathname+location.search).toBe('/friends/artifacts/graph?version=2');
 await traverse(()=>{expect(overlayRoute.closeArtifact()).toBe(true);});
 expect(visibleState.artifact).toEqual({id:'graph',contentRevision:1,placement:'old-message'});expect(visibleState.browser).toEqual(source.browser);
 await traverse(()=>history.forward());
 expect(visibleState.artifact).toEqual({id:'graph',contentRevision:2,placement:'new-message'});
 await traverse(()=>history.back());await traverse(()=>history.back());
 expect(visibleState.artifact).toBeUndefined();expect(visibleState.destination).toMatchObject(source.destination);
});

it('distinguishes two inline placements of the same artifact version even though their URL is equal',async()=>{
 const source:PrimaryRouteState={destination:{view:'chat'}};
 await act(async()=>dom.root.render(createElement(OverlayHarness,{initial:source})));dom.frame();
 const push=vi.spyOn(history,'pushState');
 act(()=>setVisibleState({...source,artifact:{id:'graph',contentRevision:1,placement:'message-a'}}));
 act(()=>setVisibleState({...source,artifact:{id:'graph',contentRevision:1,placement:'message-b'}}));
 expect(location.pathname+location.search).toBe('/artifacts/graph?version=1');expect(push).toHaveBeenCalledTimes(2);
 await traverse(()=>{expect(overlayRoute.closeArtifact()).toBe(true);});
 expect(visibleState.artifact).toEqual({id:'graph',contentRevision:1,placement:'message-a'});
 await traverse(()=>history.forward());expect(visibleState.artifact?.placement).toBe('message-b');
});

it.each(['version','placement'] as const)('rejects mismatched artifact %s in saved source state',async mismatch=>{
 const restore=vi.fn();function Source(){usePrimaryRoute(true,'agent',{destination:{view:'chat'}},restore);return null;}
 await act(async()=>dom.root.render(createElement(Source)));dom.frame();
 const artifact={id:'graph',contentRevision:1,placement:'message-a'};
 const state={newdrugs:{destination:{view:'person',resourceId:'friend',mode:'agent'},browser:{tab:'wrong',stack:[]},artifact:{...artifact,...(mismatch==='version'?{contentRevision:2}:{})}},newdrugsArtifact:{...artifact,...(mismatch==='placement'?{placement:'message-b'}:{}),pushedFromApp:true}};
 history.replaceState(state,'','/artifacts/graph?version=1');
 act(()=>window.dispatchEvent(new PopStateEvent('popstate',{state})));
 expect(restore.mock.lastCall?.[0]).toEqual({destination:{view:'chat',mode:'agent'},artifact:{id:'graph',contentRevision:1}});
});

it('does not use Back when the artifact entry marker identifies another placement or version',async()=>{
 const source:PrimaryRouteState={destination:{view:'chat'}};
 await act(async()=>dom.root.render(createElement(OverlayHarness,{initial:source})));dom.frame();
 const artifact={id:'graph',contentRevision:1,placement:'message-a'};
 act(()=>setVisibleState({...source,artifact}));
 const back=vi.spyOn(history,'back');
 for(const marker of [{...artifact,contentRevision:2},{...artifact,placement:'message-b'}]){
  history.replaceState({...history.state,newdrugsArtifact:{...marker,pushedFromApp:true}},'',location.href);
  expect(overlayRoute.closeArtifact()).toBe(false);
 }
 expect(back).not.toHaveBeenCalled();
});

it('replaces a version within an app-owned viewer so Close returns to the original source',async()=>{
 const source:PrimaryRouteState={destination:{view:'chat'},panels:[]};
 await act(async()=>dom.root.render(createElement(OverlayHarness,{initial:source})));dom.frame();
 const push=vi.spyOn(history,'pushState');
 act(()=>setVisibleState({...source,artifact:{id:'graph',contentRevision:1,placement:'message-a'}}));
 act(()=>{overlayRoute.replaceArtifact();setVisibleState({...source,artifact:{id:'graph'}});});
 expect(location.pathname+location.search).toBe('/artifacts/graph');expect(push).toHaveBeenCalledTimes(1);
 expect(history.state.newdrugsArtifact).toEqual({id:'graph',pushedFromApp:true});
 await traverse(()=>{expect(overlayRoute.closeArtifact()).toBe(true);});
 expect(location.pathname).toBe('/');expect(visibleState.artifact).toBeUndefined();
 await traverse(()=>history.forward());expect(visibleState.artifact).toEqual({id:'graph'});
});

it('keeps a direct viewer independent of app Back history when replacing its selected version',async()=>{
 history.replaceState({},'','/artifacts/graph?version=1');
 await act(async()=>dom.root.render(createElement(OverlayHarness,{initial:{destination:{view:'chat'}}})));dom.frame();
 const push=vi.spyOn(history,'pushState'),back=vi.spyOn(history,'back');
 act(()=>{overlayRoute.replaceArtifact();setVisibleState({destination:visibleState.destination,artifact:{id:'graph'}});});
 expect(location.pathname+location.search).toBe('/artifacts/graph');expect(history.state.newdrugsArtifact.pushedFromApp).toBe(false);
 act(()=>{expect(overlayRoute.closeArtifact()).toBe(false);setVisibleState({destination:visibleState.destination});});
 expect(location.pathname).toBe('/');expect(push).not.toHaveBeenCalled();expect(back).not.toHaveBeenCalled();
});
