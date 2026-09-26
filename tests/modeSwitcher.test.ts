// @vitest-environment jsdom
import {act,createElement,createRef} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ModeSwitcher} from '../src/ModeSwitcher';
import {rect,setupDOM} from './dom';
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();});afterEach(()=>dom.cleanup());
it('uses the expanded collision boundary but only covers actual content with white',()=>{
 const chat=createRef<HTMLElement>();let left=200;
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
  if(this.classList.contains('mode-switch-measure'))return rect(0,-200,280,46);
  if(this.classList.contains('mode-switch'))return rect(12,12,this.dataset.collapsed?142:280,46);
  return rect(left,0,400,600);
 });
 act(()=>dom.root.render(createElement('div',{className:'app','data-mode':'agent'},createElement('main',{className:'workspace',ref:chat},createElement('div',{className:'bubble'},'A message')),createElement(ModeSwitcher,{mode:'agent',change:()=>{},chat,chatVisible:true,layoutKey:'one'}))));
 const toggle=dom.container.querySelector<HTMLElement>('.mode-switch')!;
 expect(toggle.dataset.collapsed).toBe('true');expect(toggle.dataset.overPanel).toBeUndefined();
 // Still intersects the full label footprint, even though the compact control fits.
 left=270;dom.resize();dom.frame();expect(toggle.dataset.collapsed).toBe('true');
 left=40;dom.resize();dom.frame();expect(toggle.dataset.overPanel).toBe('true');
 left=300;dom.resize();dom.frame();expect(toggle.dataset.collapsed).toBe('true');
 left=330;dom.resize();dom.frame();expect(toggle.dataset.collapsed).toBeUndefined();expect(toggle.dataset.overPanel).toBeUndefined();
});
