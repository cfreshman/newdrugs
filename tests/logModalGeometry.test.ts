// @vitest-environment jsdom
import {act,createElement,useRef} from 'react';
import {it,expect,vi} from 'vitest';
import {LogModal} from '../src/LogModal';
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
