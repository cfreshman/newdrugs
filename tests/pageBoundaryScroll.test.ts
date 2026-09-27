// @vitest-environment jsdom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {bindPageBoundaryScroll} from '../src/pageBoundaryScroll';
import {bindPageChatScroll} from '../src/usePageChatScroll';
import {setupDOM} from './dom';
let dom:ReturnType<typeof setupDOM>,page:HTMLDivElement,cleanup:()=>void;
const scrollable=(node:HTMLElement)=>{Object.defineProperties(node,{clientHeight:{value:200},scrollHeight:{value:2000}});node.scrollTop=500;return node;};
const press=(key='ArrowDown',modifiers:KeyboardEventInit={})=>{const event=new KeyboardEvent('keydown',{key,metaKey:true,bubbles:true,cancelable:true,...modifiers});(document.activeElement||window).dispatchEvent(event);return event;};
beforeEach(()=>{dom=setupDOM();page=document.createElement('div');page.className='app';document.body.append(page);cleanup=bindPageBoundaryScroll(page);});afterEach(()=>{cleanup();dom.cleanup();});
it('jumps chat boundaries from focused inputs/buttons and prevents a second background handler',()=>{
 page.dataset.mode='agent';const workspace=document.createElement('div');workspace.className='workspace';const chat=scrollable(document.createElement('div'));chat.className='conversation';const input=document.createElement('textarea'),button=document.createElement('button');workspace.append(chat,input,button);page.append(workspace);const background=bindPageChatScroll(page,chat,{blocked:()=>false,onScroll:vi.fn()});const scroll=vi.fn();chat.addEventListener('scroll',scroll);
 for(const control of [input,button]){control.focus();expect(press().defaultPrevented).toBe(true);expect(chat.scrollTop).toBe(1800);expect(press('ArrowUp').defaultPrevented).toBe(true);expect(chat.scrollTop).toBe(0);}expect(scroll).toHaveBeenCalledTimes(4);expect(press('ArrowUp',{shiftKey:true}).defaultPrevented).toBe(false);background();
});
it('scrolls the DM transcript from its focused composer, keeping plain arrows native',()=>{
 page.dataset.mode='posts';page.innerHTML='<section class="social-experience"><div class="mode-main"><div class="mode-pages"><div class="composer-view"><div class="direct-messages"></div><textarea></textarea></div></div></div></section>';const transcript=scrollable(page.querySelector<HTMLElement>('.direct-messages')!);page.querySelector('textarea')!.focus();expect(press().defaultPrevented).toBe(true);expect(transcript.scrollTop).toBe(1800);expect(press('ArrowUp',{metaKey:false}).defaultPrevented).toBe(false);
});
it('routes to an open Log modal or Settings instead of moving the page underneath',()=>{
 page.dataset.mode='agent';const chat=scrollable(document.createElement('div'));chat.className='conversation';page.append(chat);const log=document.createElement('div');log.className='log-modal';log.dataset.open='true';const body=scrollable(document.createElement('div'));body.className='log-editor-body';const input=document.createElement('input');body.append(input);log.append(body);page.append(log);input.focus();expect(press().defaultPrevented).toBe(true);expect(body.scrollTop).toBe(1800);expect(chat.scrollTop).toBe(500);
 const dialog=scrollable(document.createElement('dialog'));dialog.setAttribute('open','');const field=document.createElement('input');dialog.append(field);page.append(dialog);field.focus();expect(press().defaultPrevented).toBe(true);expect(dialog.scrollTop).toBe(1800);expect(chat.scrollTop).toBe(500);
});
it('routes a focused secondary-agent input to its transcript, and background focus to the main panel',()=>{
 page.dataset.mode='posts';page.innerHTML='<section class="social-experience"><div class="mode-main"><div class="mode-pages"><div class="composer-view"><input></div></div></div></section><div class="workspace"><div class="conversation"></div><textarea></textarea></div>';const main=scrollable(page.querySelector<HTMLElement>('.composer-view')!),chat=scrollable(page.querySelector<HTMLElement>('.conversation')!);page.querySelector('textarea')!.focus();press();expect(chat.scrollTop).toBe(1800);expect(main.scrollTop).toBe(500);page.querySelector('input')!.focus();press();expect(main.scrollTop).toBe(1800);
});
it('does not escape an unscrollable lightbox or a page scroll lock',()=>{
 const chat=scrollable(document.createElement('div'));chat.className='conversation';page.append(chat);const modal=document.createElement('div');modal.setAttribute('aria-modal','true');document.body.append(modal);expect(press().defaultPrevented).toBe(false);expect(chat.scrollTop).toBe(500);modal.remove();page.dataset.pageScrollLock='';expect(press().defaultPrevented).toBe(false);
});

it('claims the shortcut even when the containing panel fits, rather than changing an input',()=>{
 page.dataset.mode='posts';page.innerHTML='<section class="social-experience"><div class="mode-main"><div class="mode-pages"><div class="composer-view"><input type="number" value="1996"></div></div></div></section>';const input=page.querySelector('input')!;input.focus();expect(press('ArrowUp').defaultPrevented).toBe(true);expect(input.value).toBe('1996');
});
