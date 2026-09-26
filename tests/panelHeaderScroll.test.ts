// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {scrollFromPanelHeader} from '../src/panelHeaderScroll';
import {setupDOM} from './dom';
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();});afterEach(()=>dom.cleanup());
it('scrolls the panel from its title or header space, without triggering on controls',()=>{
 const content=document.createElement('div'),scroll=vi.fn();content.scrollTo=scroll;
 const back=vi.fn();act(()=>dom.root.render(createElement('header',{onClick:event=>scrollFromPanelHeader(event,content)},createElement('h1',null,'Posts'),createElement('button',{onClick:back},createElement('span',null,'Back')))));
 act(()=>dom.container.querySelector('h1')!.click());expect(scroll).toHaveBeenCalledWith({top:0,behavior:'smooth'});
 act(()=>dom.container.querySelector('header')!.click());expect(scroll).toHaveBeenCalledTimes(2);
 act(()=>dom.container.querySelector('button span')!.dispatchEvent(new MouseEvent('click',{bubbles:true})));expect(back).toHaveBeenCalledTimes(1);expect(scroll).toHaveBeenCalledTimes(2);
});
it('targets the DM transcript and ignores modified clicks and selected text',()=>{
 const content=document.createElement('div'),transcript=document.createElement('div');transcript.className='direct-messages';content.append(transcript);
 const outer=vi.fn(),inner=vi.fn();content.scrollTo=outer;transcript.scrollTo=inner;
 act(()=>dom.root.render(createElement('header',{onClick:event=>scrollFromPanelHeader(event,content)},'Messages')));
 const header=dom.container.querySelector('header')!;act(()=>header.click());expect(inner).toHaveBeenCalledOnce();expect(outer).not.toHaveBeenCalled();
 act(()=>header.dispatchEvent(new MouseEvent('click',{bubbles:true,metaKey:true})));expect(inner).toHaveBeenCalledOnce();
 vi.spyOn(window,'getSelection').mockReturnValue({toString:()=> 'selected title'} as Selection);
 act(()=>header.click());expect(inner).toHaveBeenCalledOnce();
});
