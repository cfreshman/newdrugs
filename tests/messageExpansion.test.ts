// @vitest-environment jsdom
import {act,createElement,useRef} from 'react';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {messagePreviewHeight,useMessageExpansion} from '../src/useMessageExpansion';
import {rect,setupDOM} from './dom';
let dom:ReturnType<typeof setupDOM>,scroller:HTMLDivElement,controls:ReturnType<typeof useMessageExpansion>;
function Display({reveal=false}:{reveal?:boolean}){
 const wrapper=useRef<HTMLElement>(null);controls=useMessageExpansion({wrapper,scrollRef:{current:scroller},reveal});
 return createElement('section',{ref:wrapper},createElement('button',{onClick:controls.toggle},controls.expanded?'Show less':'Show more'));
}
beforeEach(()=>{dom=setupDOM();scroller=document.createElement('div');document.body.append(scroller);});
afterEach(()=>dom.cleanup());
it('keeps the same display mounted and preserves the reading position while expanding',()=>{
 act(()=>dom.root.render(createElement(Display)));const display=dom.container.firstElementChild;
 scroller.scrollTop=150;act(()=>controls.toggle());
 expect(controls.expanded).toBe(true);expect(scroller.scrollTop).toBe(150);expect(dom.container.firstElementChild).toBe(display);
});
it('anchors collapse by the display bottom and clamps at the beginning',()=>{
 act(()=>dom.root.render(createElement(Display)));const display=dom.container.firstElementChild!;
 Object.defineProperty(display,'getBoundingClientRect',{configurable:true,value:()=>rect(0,0,300,controls.expanded?600:100)});
 act(()=>controls.toggle());scroller.scrollTop=900;act(()=>controls.toggle());expect(scroller.scrollTop).toBe(400);
 act(()=>controls.toggle());scroller.scrollTop=50;act(()=>controls.toggle());expect(scroller.scrollTop).toBe(0);
});
it('supports explicit reveal and shared preview tokens without multiplying user or mobile content',()=>{
 act(()=>dom.root.render(createElement(Display,{reveal:true})));expect(controls.expanded).toBe(true);
 const node=dom.container.firstElementChild as HTMLElement;node.style.setProperty('--message-preview','300px');
 expect(messagePreviewHeight(node,true)).toBe(300);dom.desktop(true);expect(messagePreviewHeight(node,true)).toBe(600);expect(messagePreviewHeight(node,false)).toBe(300);
});
