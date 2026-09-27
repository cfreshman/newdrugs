// @vitest-environment jsdom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {bindHorizontalMediaScroll,horizontalWheelDelta,remainingVerticalWheel} from '../src/horizontalMediaScroll';
import {setupDOM} from './dom';
let dom:ReturnType<typeof setupDOM>,row:HTMLDivElement,page:HTMLDivElement,cleanup:()=>void;
beforeEach(()=>{dom=setupDOM();page=document.createElement('div');page.style.overflowY='auto';row=document.createElement('div');page.append(row);document.body.append(page);Object.defineProperties(page,{clientHeight:{value:200},scrollHeight:{value:2000}});Object.defineProperties(row,{clientWidth:{value:300},scrollWidth:{value:900,configurable:true}});page.scrollTop=100;row.scrollLeft=200;cleanup=bindHorizontalMediaScroll(row);});afterEach(()=>{cleanup();dom.cleanup();});
const wheel=(x:number,y:number,extra:WheelEventInit={})=>{const event=new WheelEvent('wheel',{deltaX:x,deltaY:y,bubbles:true,cancelable:true,...extra});row.dispatchEvent(event);return event;};
const pointer=(target:EventTarget,type:string,x:number,extra:Record<string,unknown>={})=>{const event=new Event(type,{bubbles:true,cancelable:true});for(const [key,value]of Object.entries({pointerType:'mouse',pointerId:1,button:0,clientX:x,...extra}))Object.defineProperty(event,key,{value});target.dispatchEvent(event);return event;};
it('blends wheel axes continuously around the full circle, including opposing diagonals',()=>{
 expect(horizontalWheelDelta(40,0)).toBe(40);expect(horizontalWheelDelta(0,40)).toBe(40);expect(horizontalWheelDelta(40,-40)).toBe(0);
 for(let angle=0;angle<Math.PI*2;angle+=.01){const before=horizontalWheelDelta(Math.cos(angle)*100,Math.sin(angle)*100),after=horizontalWheelDelta(Math.cos(angle+.00001)*100,Math.sin(angle+.00001)*100);expect(Math.abs(after-before)).toBeLessThan(.002);}
 expect(wheel(20,30).defaultPrevented).toBe(true);expect(row.scrollLeft).toBe(250);expect(page.scrollTop).toBe(100);
});
it('passes only the unconsumed vertical motion to the page at a strip edge',()=>{
 row.scrollLeft=590;wheel(0,40);expect(row.scrollLeft).toBe(600);expect(page.scrollTop).toBe(130);wheel(0,40);expect(page.scrollTop).toBe(170);expect(remainingVerticalWheel(20,-20,0)).toBe(0);
});
it('does not capture a fitting row, pinch zoom or modifier gestures',()=>{
 expect(wheel(0,40,{ctrlKey:true}).defaultPrevented).toBe(false);expect(row.scrollLeft).toBe(200);Object.defineProperty(row,'scrollWidth',{value:300});expect(wheel(0,40).defaultPrevented).toBe(false);
});
it('grabs with a mouse, suppresses the resulting click, and preserves a normal photo click',()=>{
 const anchor=document.createElement('a');row.append(anchor);const open=vi.fn();anchor.addEventListener('click',open);
 pointer(anchor,'pointerdown',200);pointer(window,'pointermove',100);expect(row.scrollLeft).toBe(300);expect(row.dataset.dragging).toBe('true');pointer(window,'pointerup',100);anchor.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));expect(open).not.toHaveBeenCalled();
 pointer(anchor,'pointerdown',100);pointer(window,'pointerup',100);anchor.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));expect(open).toHaveBeenCalledOnce();
});
it('leaves touch panning native and prevents mouse momentum from leaving a modal',()=>{
 pointer(row,'pointerdown',200,{pointerType:'touch'});pointer(window,'pointermove',100,{pointerType:'touch'});expect(row.scrollLeft).toBe(200);
 const modal=document.createElement('div');modal.setAttribute('role','dialog');page.replaceChildren(modal);modal.append(row);row.scrollLeft=600;wheel(0,40);expect(page.scrollTop).toBe(100);
});
