// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {useAppearance,useFont} from '../src/useAppearance';
import {initialDestination} from '../shared/preferences';
import {setupDOM} from './dom';
let dom:ReturnType<typeof setupDOM>,dark:boolean,events:EventTarget;
beforeEach(()=>{dom=setupDOM();dark=false;events=new EventTarget();vi.stubGlobal('matchMedia',()=>({get matches(){return dark;},addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)}));});afterEach(()=>{dom.cleanup();delete document.documentElement.dataset.theme;document.documentElement.style.colorScheme='';localStorage.removeItem('nd-appearance');});
function Probe({mode}:{mode:'light'|'dark'|'system'}){useAppearance(mode);return null;}
it('applies and caches the selected scheme, tracks system changes only in System mode',async()=>{await act(async()=>dom.root.render(createElement(Probe,{mode:'system'})));expect(document.documentElement.dataset.theme).toBe('light');act(()=>{dark=true;events.dispatchEvent(new Event('change'));});expect(document.documentElement.dataset.theme).toBe('dark');expect(localStorage.getItem('nd-appearance')).toBe('system');await act(async()=>dom.root.render(createElement(Probe,{mode:'light'})));act(()=>events.dispatchEvent(new Event('change')));expect(document.documentElement.dataset.theme).toBe('light');expect(document.documentElement.style.colorScheme).toBe('light');});
it('uses the preferred landing tab only for a fresh root visit, preserving direct links and explicit Agent entry',()=>{const origin='https://druggie.org';expect(initialDestination('/',origin,'log')).toEqual({view:'log'});expect(initialDestination('/',origin,'posts')).toEqual({view:'feed'});expect(initialDestination('/',origin,'friends')).toEqual({view:'people'});expect(initialDestination('/posts/post-id',origin,'log')).toEqual({view:'post',resourceId:'post-id'});expect(initialDestination('/agent',origin,'log')).toEqual({view:'chat',mode:'agent'});expect(initialDestination('/log/join/'+'a'.repeat(32),origin,'posts')).toEqual({view:'log_join',resourceId:'a'.repeat(32)});});

it('applies and caches the account font selection',async()=>{
 function Font({font}:{font:'mono'|'sans'|'serif'}){useFont(font);return null;}
 for(const font of ['mono','sans','serif'] as const){await act(async()=>dom.root.render(createElement(Font,{font})));expect(document.documentElement.dataset.font).toBe(font);expect(localStorage.getItem('nd-font')).toBe(font);}
 delete document.documentElement.dataset.font;localStorage.removeItem('nd-font');
});
