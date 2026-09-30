// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {useHorizontalSwipe} from '../src/useHorizontalSwipe';
import {setupDOM} from './dom';
let dom:ReturnType<typeof setupDOM>;
const swipe=vi.fn(),capture=vi.fn();
beforeEach(()=>{dom=setupDOM();vi.clearAllMocks();});
afterEach(()=>dom.cleanup());
function pointer(node:HTMLElement,type:string,x:number,id=1){
 const event=new MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:100});
 Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:'touch'}});
 act(()=>node.dispatchEvent(event));return event;
}
async function mount(){
 function Surface(){return createElement('div',{...useHorizontalSwipe({swipe}),className:'surface'},createElement('span',{},'A selectable note'));}
 await act(async()=>dom.root.render(createElement(Surface)));
 const owner=dom.container.querySelector<HTMLElement>('.surface')!,leaf=owner.querySelector<HTMLElement>('span')!;
 owner.setPointerCapture=capture;return {owner,leaf};
}
it('retains native touch capture on the original child while recognizing its swipe',async()=>{
 const {leaf}=await mount();pointer(leaf,'pointerdown',200);pointer(leaf,'pointermove',130);pointer(leaf,'pointerup',100);
 expect(capture).not.toHaveBeenCalled();expect(swipe).toHaveBeenCalledWith(1,-100,0);
});
it('does not cancel on a descendant capture-loss event bubbling to the navigation surface',async()=>{
 const {leaf}=await mount();pointer(leaf,'pointerdown',200);pointer(leaf,'pointermove',130);pointer(leaf,'lostpointercapture',130);pointer(leaf,'pointerup',100);
 expect(swipe).toHaveBeenCalledOnce();
});
it('cancels when the navigation surface itself loses capture',async()=>{
 const {owner,leaf}=await mount();pointer(leaf,'pointerdown',200);pointer(leaf,'pointermove',130);pointer(owner,'lostpointercapture',130);pointer(leaf,'pointerup',100);
 expect(swipe).not.toHaveBeenCalled();
});
it('allows a normal touch release after 500ms but rejects a prolonged gesture',async()=>{
 const {leaf}=await mount();pointer(leaf,'pointerdown',200);pointer(leaf,'pointermove',130);dom.frame(500);pointer(leaf,'pointerup',100);expect(swipe).toHaveBeenCalledOnce();
 swipe.mockClear();pointer(leaf,'pointerdown',200);pointer(leaf,'pointermove',130);dom.frame(800);pointer(leaf,'pointerup',100);expect(swipe).not.toHaveBeenCalled();
});
it('keeps native cancellation and a second touch from navigating',async()=>{
 const {leaf}=await mount();pointer(leaf,'pointerdown',200);pointer(leaf,'pointercancel',130);pointer(leaf,'pointerup',100);expect(swipe).not.toHaveBeenCalled();
 pointer(leaf,'pointerdown',200);pointer(leaf,'pointerdown',220,2);pointer(leaf,'pointerup',100);pointer(leaf,'pointerup',300,2);expect(swipe).not.toHaveBeenCalled();
});
