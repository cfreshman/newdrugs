// @vitest-environment jsdom
import {act,createElement,useRef} from 'react';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {placeMenu,menuVisibleBounds,useEdgeAwareMenu} from '../src/useEdgeAwareMenu';
import {rect,setupDOM} from './dom';
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();vi.stubGlobal('innerWidth',390);vi.stubGlobal('innerHeight',844);});afterEach(()=>dom.cleanup());
it('shifts left at the right edge and opens above a low trigger',()=>{
 const placed=placeMenu(rect(318,690,52,48),{width:160,height:144},rect(12,100,366,650));
 expect(placed.placement).toBe('above');expect(placed.left).toBe(212);expect(placed.top).toBe(542);expect(placed.width).toBe(160);
});
it('opens below when it fits and limits both dimensions in tiny panels',()=>{
 expect(placeMenu(rect(30,120,52,48),{width:160,height:144},rect(12,100,366,650))).toMatchObject({placement:'below',left:30,top:172});
 const tiny=placeMenu(rect(80,225,52,44),{width:240,height:180},rect(50,200,140,100));
 expect(tiny).toMatchObject({placement:'within',left:56,top:206,width:128,maxHeight:88});
});
it('intersects nested clipping containers with the panned visual viewport',()=>{
 vi.stubGlobal('visualViewport',{offsetLeft:10,offsetTop:200,width:350,height:400});
 const outer=document.createElement('div'),inner=document.createElement('div'),anchor=document.createElement('summary');document.body.append(outer);outer.append(inner);inner.append(anchor);
 outer.style.overflowX='hidden';outer.style.overflowY='hidden';inner.style.overflowY='auto';
 outer.getBoundingClientRect=()=>rect(20,50,340,700);inner.getBoundingClientRect=()=>rect(25,150,330,400);
 Object.defineProperties(outer,{clientWidth:{value:340},clientHeight:{value:700}});Object.defineProperty(inner,'clientHeight',{value:400});
 expect(menuVisibleBounds(anchor)).toEqual({left:20,right:360,top:200,bottom:550});
});
function Probe(){const ref=useRef<HTMLDetailsElement>(null);useEdgeAwareMenu(ref,true);return createElement('section',{style:{overflowX:'hidden',overflowY:'hidden'}},createElement('details',{ref},createElement('summary',null,'More'),createElement('div',null,createElement('button',null,'Unfriend'))));}
it('positions before revealing, follows scrolling, and closes when the trigger leaves the panel',async()=>{
 let top=690;
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this.tagName==='SECTION'?rect(12,100,366,650):this.tagName==='DETAILS'||this.tagName==='SUMMARY'?rect(318,top,52,48):rect(318,top+52,160,144);});
 vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(366);vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(650);
 await act(async()=>dom.root.render(createElement(Probe)));
 const details=dom.container.querySelector('details')!,menu=details.querySelector('div')!;
 await act(async()=>{details.open=true;});
 expect(details.dataset.menuPositioned).toBe('true');expect(details.dataset.menuPlacement).toBe('above');expect(menu.style.left).toBe('-106px');expect(menu.style.top).toBe('-148px');
 menu.scrollTop=40;act(()=>menu.dispatchEvent(new Event('scroll',{bubbles:true})));dom.frame();expect(menu.scrollTop).toBe(40);
 act(()=>{top=200;window.dispatchEvent(new Event('scroll'));});dom.frame();expect(details.dataset.menuPlacement).toBe('below');expect(menu.style.top).toBe('52px');
 act(()=>{top=20;window.dispatchEvent(new Event('scroll'));});dom.frame();expect(details.open).toBe(false);
});
