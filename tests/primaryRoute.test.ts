// @vitest-environment jsdom
import {act,createElement} from 'react';
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
