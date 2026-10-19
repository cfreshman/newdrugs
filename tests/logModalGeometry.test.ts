// @vitest-environment jsdom
import {act,createElement,useRef} from 'react';
import {it,expect,vi} from 'vitest';
import {LogModal,observeLogLayerGeometry} from '../src/LogModal';
import {setupDOM,rect} from './dom';

it('keeps an open hangout on its anchor when chat moves the panel without resizing it',async()=>{
 const dom=setupDOM();
 try{
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
   if(this.classList.contains('mode-main'))return rect(this.closest('.app')?.hasAttribute('data-agent-dock')?532:620,12,680,800);
   return rect(20,12,1880,800);
  });
  function Shell({active}:{active:boolean}){const anchor=useRef<HTMLDivElement>(null);return createElement('div',{className:'app'},createElement('section',{className:'social-experience'},createElement('div',{className:'mode-main',ref:anchor},createElement(LogModal,{active,anchor,close:()=>{},children:createElement('input',{defaultValue:'Retained draft'})}))));}
  await act(async()=>dom.root.render(createElement(Shell,{active:true})));
  const dialog=dom.container.querySelector<HTMLElement>('.log-modal')!,input=dialog.querySelector('input'),app=dom.container.querySelector('.app')!;
  expect(dialog.style.left).toBe('620px');expect(dialog.style.width).toBe('680px');
  await act(async()=>{app.setAttribute('data-agent-dock','true');});
  expect(dialog.style.left).toBe('532px');expect(dialog.style.width).toBe('680px');expect(dialog.querySelector('input')).toBe(input);
  await act(async()=>{app.removeAttribute('data-agent-dock');});
  expect(dialog.style.left).toBe('620px');expect(input?.value).toBe('Retained draft');
 }finally{dom.cleanup();}
});
it('does not close from Escape while an editable field owns the key',async()=>{
 const dom=setupDOM(),close=vi.fn();
 try{
  function Shell(){const anchor=useRef<HTMLDivElement>(null);return createElement('div',{className:'app'},createElement('div',{className:'mode-main',ref:anchor},createElement(LogModal,{active:true,anchor,close,children:createElement('input',{defaultValue:'Draft'})})));}
  await act(async()=>dom.root.render(createElement(Shell)));const dialog=dom.container.querySelector<HTMLElement>('.log-modal')!,input=dialog.querySelector<HTMLInputElement>('input')!;
  await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));expect(close).not.toHaveBeenCalled();
  await act(async()=>dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));expect(close).toHaveBeenCalledOnce();
 }finally{dom.cleanup();}
});
it('fits the day scrim to the main panel below the mode controls',()=>{
 const dom=setupDOM();
 try{
  dom.container.innerHTML='<div class="app"><section class="social-experience"><div class="mode-main"></div></section><dialog></dialog></div>';
  const panel=dom.container.querySelector<HTMLElement>('.mode-main')!,dialog=dom.container.querySelector('dialog')!;
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this===panel?rect(6,66,381,668):rect(6,6,381,728);});
  const stop=observeLogLayerGeometry(dialog,panel,true);
  expect(dialog.style.top).toBe('66px');expect(dialog.style.height).toBe('668px');expect(dialog.style.left).toBe('6px');
  stop();
 }finally{dom.cleanup();}
});
it('keeps the top layer aligned when native keyboard focus scrolls the document',()=>{
 const dom=setupDOM();let y=271;
 try{
  vi.stubGlobal('scrollY',y);vi.stubGlobal('scrollX',0);
  dom.container.innerHTML='<div class="app"><section class="social-experience"><div class="mode-main"></div></section><div></div></div>';
  const panel=dom.container.querySelector<HTMLElement>('.mode-main')!,dialog=dom.container.querySelector<HTMLElement>('.app > div')!;
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(()=>rect(6,277-y,381,376));
  const stop=observeLogLayerGeometry(dialog,panel);
  expect(dialog.style.position).toBe('absolute');expect(parseFloat(dialog.style.top)-scrollY).toBe(panel.getBoundingClientRect().top);
  y=141;vi.stubGlobal('scrollY',y);window.dispatchEvent(new Event('scroll'));
  expect(parseFloat(dialog.style.top)-scrollY).toBe(panel.getBoundingClientRect().top);expect(dialog.style.height).toBe('376px');stop();
 }finally{dom.cleanup();}
});

it.each([
 {name:'desktop below the top controls',mobile:false,standalone:false,top:66,height:668},
 {name:'mobile browser',mobile:true,standalone:false,top:6,height:728},
 {name:'installed mobile',mobile:true,standalone:true,top:6,height:728},
])('uses the intended entry bounds on $name',({mobile,standalone,top,height})=>{
 const dom=setupDOM();
 try{
  dom.desktop(mobile);
  dom.container.innerHTML=`<div class="app" data-standalone="${standalone}"><section class="social-experience"><div class="mode-main"></div></section><div class="entry"></div></div>`;
  const panel=dom.container.querySelector<HTMLElement>('.mode-main')!,dialog=dom.container.querySelector<HTMLElement>('.entry')!;
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this===panel?rect(190,66,540,668):rect(6,6,918,728);});
  const stop=observeLogLayerGeometry(dialog,panel);
  expect(dialog.style.left).toBe('190px');expect(dialog.style.width).toBe('540px');expect(dialog.style.top).toBe(`${top}px`);expect(dialog.style.height).toBe(`${height}px`);
  stop();
 }finally{dom.cleanup();}
});

it('follows the desktop frame when its top moves without a resize',async()=>{
 const dom=setupDOM();
 try{
  dom.container.innerHTML='<div class="app"><section class="social-experience"><div class="mode-main"><div class="mode-primary-panel"></div></div></section><div class="entry"></div></div>';
  const frame=dom.container.querySelector<HTMLElement>('.mode-main')!,panel=frame.querySelector<HTMLElement>('.mode-primary-panel')!,dialog=dom.container.querySelector<HTMLElement>('.entry')!;
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this===panel?rect(204,frame.style.marginTop?70:64,684,762):rect(6,6,888,832);});
  const stop=observeLogLayerGeometry(dialog,panel);expect(dialog.style.top).toBe('64px');
  await act(async()=>{frame.style.marginTop='58px';});
  expect(dialog.style.top).toBe('70px');expect(dialog.style.height).toBe('762px');stop();
 }finally{dom.cleanup();}
});
