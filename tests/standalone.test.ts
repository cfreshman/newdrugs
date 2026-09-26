// @vitest-environment jsdom
import {act,createElement} from 'react';import {beforeEach,afterEach,it,expect,vi} from 'vitest';import {setupDOM} from './dom';import {useStandalone} from '../src/useStandalone';
let dom:ReturnType<typeof setupDOM>;beforeEach(()=>{dom=setupDOM();});afterEach(()=>{delete (navigator as Navigator&{standalone?:boolean}).standalone;dom.cleanup();});
function Status(){return createElement('output',null,String(useStandalone()));}
it('distinguishes browser tabs from installed display mode and reacts to changes',()=>{
 let installed=false;const changes=new EventTarget();vi.stubGlobal('matchMedia',(query:string)=>({get matches(){return query==='(display-mode: standalone)'&&installed},addEventListener:changes.addEventListener.bind(changes),removeEventListener:changes.removeEventListener.bind(changes)}));
 act(()=>dom.root.render(createElement(Status)));expect(dom.container.textContent).toBe('false');
 act(()=>{installed=true;changes.dispatchEvent(new Event('change'));});expect(dom.container.textContent).toBe('true');
});
it('supports the iOS home-screen flag',()=>{vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));Object.defineProperty(navigator,'standalone',{configurable:true,value:true});act(()=>dom.root.render(createElement(Status)));expect(dom.container.textContent).toBe('true');});
