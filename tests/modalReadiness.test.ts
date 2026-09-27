// @vitest-environment jsdom
import {act,createElement as h,useEffect,useState} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {Dialog} from '../src/Dialog';
import {LogModal} from '../src/LogModal';
import {usePanelLoading} from '../src/PanelReadiness';
import {setupDOM,rect} from './dom';
let dom:ReturnType<typeof setupDOM>,finish:()=>void;
function Pending(){const [ready,setReady]=useState(false);usePanelLoading(!ready);useEffect(()=>{finish=()=>setReady(true);},[]);return h('p',{},ready?'Loaded entry':'Loading content');}
beforeEach(()=>{dom=setupDOM();HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.setAttribute('open','');});HTMLDialogElement.prototype.close=vi.fn();});
afterEach(()=>dom.cleanup());
it('opens Settings before data arrives and reveals the mounted body when ready',async()=>{
 const close=vi.fn();await act(async()=>dom.root.render(h(Dialog,{title:'Storage',close,children:h(Pending)})));
 expect(dom.container.querySelector('dialog')?.hasAttribute('open')).toBe(true);
 expect(dom.container.querySelector('.sheet-body')?.getAttribute('data-loading')).toBe('true');
 expect(dom.container.querySelector('[aria-label="Close"]')).toBeTruthy();
 await act(async()=>finish());expect(dom.container.querySelector('.sheet-body')?.hasAttribute('data-loading')).toBe(false);
 expect(dom.container.textContent).toContain('Loaded entry');
});
it('opens an empty Log shell immediately with Back available, then reveals content without remounting',async()=>{
 const close=vi.fn(),anchor=document.createElement('div');document.body.append(anchor);vi.spyOn(anchor,'getBoundingClientRect').mockReturnValue(rect(12,12,600,696));
 await act(async()=>dom.root.render(h(LogModal,{active:true,close,closeLabel:'Back',anchor:{current:anchor},children:h('div',{className:'composer-view'},h(Pending))})));
 const shell=dom.container.querySelector('.log-modal')!;expect(shell.getAttribute('data-open')).toBe('true');expect(shell.getAttribute('data-loading')).toBe('true');
 const back=dom.container.querySelector<HTMLButtonElement>('.log-loading-footer button')!;expect(back.textContent).toBe('Back');act(()=>back.click());expect(close).toHaveBeenCalledOnce();
 await act(async()=>finish());expect(shell.hasAttribute('data-loading')).toBe(false);expect(shell.textContent).toContain('Loaded entry');expect(shell.querySelector('.log-loading-footer')).toBeNull();
});

it('keeps the top controls accessible in mobile standalone by using the content panel bounds',async()=>{
 dom.desktop(true);const app=document.createElement('div');app.className='app';app.dataset.standalone='true';const outer=document.createElement('section');outer.className='social-experience';const panel=document.createElement('div');outer.append(panel);app.append(outer);document.body.append(app);vi.spyOn(outer,'getBoundingClientRect').mockReturnValue(rect(0,6,390,838));vi.spyOn(panel,'getBoundingClientRect').mockReturnValue(rect(0,53,390,791));
 await act(async()=>dom.root.render(h(LogModal,{active:true,close:vi.fn(),anchor:{current:panel},children:h('div',{},'Entry')})));
 const modal=dom.container.querySelector<HTMLElement>('.log-modal')!;expect(modal.style.top).toBe('53px');expect(modal.style.height).toBe('791px');
});
