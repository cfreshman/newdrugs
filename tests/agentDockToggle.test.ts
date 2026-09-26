// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {AgentDockToggle} from '../src/AgentDockToggle';
import {setupDOM,rect} from './dom';
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();});afterEach(()=>dom.cleanup());
it('hides the optional agent button while it covers content and restores it when clear',()=>{
 let panelRight=900;
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this.classList.contains('agent-dock-toggle')?rect(880,700,100,48):rect(200,70,panelRight-200,730);});
 act(()=>dom.root.render(createElement('div',{className:'app'},createElement('section',{className:'social-experience'},createElement('div',{className:'mode-main'})),createElement(AgentDockToggle,{mode:'posts',busy:false,open:vi.fn()}))));
 const button=dom.container.querySelector<HTMLElement>('.agent-dock-toggle')!;
 expect(button.dataset.overlapsPanel).toBe('true');expect(button.tabIndex).toBe(-1);
 dom.resize();expect(button.dataset.overlapsPanel).toBe('true');
 panelRight=850;dom.resize();expect(button.dataset.overlapsPanel).toBeUndefined();expect(button.getAttribute('aria-hidden')).toBeNull();
});
