// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {LinkPreviews} from '../src/LinkPreview';
import {setupDOM} from './dom';

vi.mock('../src/linkPreviewCache',()=>({
 cachedLinkPreview:()=>({url:'https://example.com/watch',hostname:'example.com',title:'A linked page',description:'Preview',embed:{provider:'YouTube',src:'https://www.youtube.com/embed/video',height:315}}),
 loadLinkPreview:vi.fn(async()=>({url:'https://example.com/watch',hostname:'example.com',title:'A linked page',description:'Preview'})),
}));
const dom=setupDOM();afterEach(()=>dom.cleanup());
it('renders a plain link preview for a DM without an embedded player or Markdown link parsing',async()=>{
 await act(async()=>dom.root.render(createElement(LinkPreviews,{text:'See https://example.com/watch',simple:true})));
 expect(dom.container.querySelector('.website-card')?.textContent).toContain('A linked page');
 expect(dom.container.querySelector('.provider-embed')).toBeNull();
 expect(dom.container.querySelector('iframe')).toBeNull();
});
