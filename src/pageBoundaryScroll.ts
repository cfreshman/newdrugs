import {useEffect,type RefObject} from 'react';
const panels='.direct-messages,.log-detail-body,.log-editor-body,.log-settings-body,.log-directory-body,.log-day-choices,.log-task-content,.composer-surface-content,.conversation';
function visible(node:HTMLElement){return !node.closest('[hidden],[inert]')&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden';}
function scroller(root:HTMLElement|null):HTMLElement|null{
 if(!root)return null;
 const candidates=[...panels.split(',').flatMap(selector=>[...root.querySelectorAll<HTMLElement>(selector)]),root,...root.querySelectorAll<HTMLElement>('*')];
 return candidates.find(node=>visible(node)&&!node.matches('input,textarea,select,[contenteditable]:not([contenteditable="false"])')&&node.scrollHeight>node.clientHeight&&(node===root||node.matches(panels)||/auto|scroll/.test(getComputedStyle(node).overflowY)))||candidates.find(node=>visible(node)&&node.matches(`${panels},dialog,.log-modal,.composer-view,.composer-surface,.composer-menu-layer`))||null;
}
/** Command boundaries belong to the containing panel, never to an input's caret. */
export function pageBoundaryTarget(page:HTMLElement){
 const dialogs=[...document.querySelectorAll<HTMLElement>('dialog[open],[aria-modal="true"]')].filter(visible);
 if(dialogs.length)return scroller(dialogs.at(-1)!);
 const modal=[...page.querySelectorAll<HTMLElement>('.log-modal[data-open="true"]')].find(visible);if(modal)return scroller(modal);
 if(document.querySelector('[data-page-scroll-lock]'))return null;
 const focused=document.activeElement instanceof HTMLElement?document.activeElement:null;
 const workspace=page.querySelector<HTMLElement>('.workspace:not([hidden])');
 const inWorkspace=workspace&&focused&&workspace.contains(focused);
 if(inWorkspace){const panel=focused.closest<HTMLElement>('.composer-surface');return scroller(panel||workspace.querySelector<HTMLElement>('.conversation')||workspace);}
 if(page.dataset.mode==='agent'||!page.dataset.mode){
  const inline=page.querySelector<HTMLElement>('.composer-input-layer[inert]')&&page.querySelector<HTMLElement>('.composer-menu-layer:not([inert])');
  return scroller(inline||workspace?.querySelector<HTMLElement>('.conversation')||workspace||page);
 }
 const main=page.querySelector<HTMLElement>('.social-experience:not([hidden]) .mode-main');
 if(main&&visible(main)){const current=main.querySelector<HTMLElement>('.mode-pages > .composer-view:not([hidden]):not(.composer-underlay)');return scroller(current||main);}
 return scroller(workspace?.querySelector<HTMLElement>('.conversation')||workspace);
}
export function bindPageBoundaryScroll(page:HTMLElement){
 const keydown=(event:KeyboardEvent)=>{
  if(!event.metaKey||event.shiftKey||event.altKey||event.ctrlKey||event.defaultPrevented||!['ArrowUp','ArrowDown'].includes(event.key))return;
  const target=pageBoundaryTarget(page);if(!target)return;
  event.preventDefault();target.scrollTop=event.key==='ArrowDown'?Math.max(0,target.scrollHeight-target.clientHeight):0;
  target.dispatchEvent(new Event('scroll'));
 };
 window.addEventListener('keydown',keydown,true);return()=>window.removeEventListener('keydown',keydown,true);
}
export function usePageBoundaryScroll(page:RefObject<HTMLElement|null>,ready:boolean){useEffect(()=>{if(ready&&page.current)return bindPageBoundaryScroll(page.current);},[page,ready]);}
