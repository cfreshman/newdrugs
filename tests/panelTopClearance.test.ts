// @vitest-environment jsdom
import {act,createElement,useRef} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useTopControlClearance} from '../src/useTopControlClearance';
import {rect,setupDOM} from './dom';
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();});afterEach(()=>dom.cleanup());
it('keeps the left browser below intersecting tri-tabs and releases the space when dragged clear',()=>{
 let left=12;
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this.classList.contains('mode-switch')?rect(12,12,284,46):rect(left,12,600,700);});
 function Panel({position}:{position:number}){const panel=useRef<HTMLDivElement>(null);const gap=useTopControlClearance(panel,true,String(position));return createElement('div',null,createElement('nav',{className:'mode-switch'}),createElement('div',{ref:panel,'data-gap':gap}));}
 const render=()=>act(()=>dom.root.render(createElement(Panel,{position:left})));
 render();expect(dom.container.querySelector('[data-gap]')?.getAttribute('data-gap')).toBe('58');
 left=310;render();expect(dom.container.querySelector('[data-gap]')?.getAttribute('data-gap')).toBe('0');
 left=100;render();expect(dom.container.querySelector('[data-gap]')?.getAttribute('data-gap')).toBe('58');
});

it('uses the smaller mobile gutter below top controls',()=>{
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this.classList.contains('mode-switch')?rect(6,6,136,41):rect(6,6,378,700);});
 function Panel(){const panel=useRef<HTMLDivElement>(null);const gap=useTopControlClearance(panel,true,'mobile');return createElement('div',null,createElement('nav',{className:'mode-switch'}),createElement('div',{ref:panel,style:{'--top-control-gap':'6px','--mode-top':'6px'} as React.CSSProperties,'data-gap':gap}));}
 act(()=>dom.root.render(createElement(Panel)));
 expect(dom.container.querySelector('[data-gap]')?.getAttribute('data-gap')).toBe('47');
});
