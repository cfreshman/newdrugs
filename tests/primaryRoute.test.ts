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
