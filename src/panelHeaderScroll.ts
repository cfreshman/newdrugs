import type {MouseEvent} from 'react';

/** Header controls retain their actions; only the title and empty header space scroll. */
export function scrollFromPanelHeader(event:MouseEvent<HTMLElement>, content:HTMLElement|null) {
  if(!content || event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
  if(event.target instanceof Element && event.target.closest('button,a,input,textarea,select,[role="button"],summary,[contenteditable="true"]'))return;
  if(window.getSelection()?.toString())return;
  // In a DM the transcript owns scrolling, rather than the surrounding panel.
  const scroller=content.querySelector<HTMLElement>('.direct-messages')||content;
  scroller.scrollTo({top:0,behavior:'smooth'});
}
