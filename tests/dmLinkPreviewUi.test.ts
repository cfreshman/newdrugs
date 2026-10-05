// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {LinkPreviews} from '../src/LinkPreview';
import {setupDOM} from './dom';
const preview=vi.hoisted(()=>({video:false,icon:false}));

vi.mock('../src/linkPreviewCache',()=>({
 cachedLinkPreview:()=>preview.video?{url:'https://p057.co/:clip.mp4',hostname:'p057.co',title:'clip.mp4',description:'',kind:'video'}:preview.icon?{url:'https://example.com/watch',hostname:'example.com',title:'A linked page',description:'Preview',iconUrl:'/api/link-previews/example/icon'}:{url:'https://example.com/watch',hostname:'example.com',title:'A linked page',description:'Preview',embed:{provider:'YouTube',src:'https://www.youtube.com/embed/video',height:315}},
 loadLinkPreview:vi.fn(async()=>preview.video?{url:'https://p057.co/:clip.mp4',hostname:'p057.co',title:'clip.mp4',description:'',kind:'video'}:{url:'https://example.com/watch',hostname:'example.com',title:'A linked page',description:'Preview',...(preview.icon?{iconUrl:'/api/link-previews/example/icon'}:{})}),
}));
let dom:ReturnType<typeof setupDOM>;beforeEach(()=>{dom=setupDOM();preview.video=false;preview.icon=false;vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});});afterEach(()=>dom.cleanup());
it('renders a plain link preview for a DM without an embedded player or Markdown link parsing',async()=>{
 await act(async()=>dom.root.render(createElement(LinkPreviews,{text:'See https://example.com/watch',simple:true})));
 expect(dom.container.querySelector('.website-card')?.textContent).toContain('A linked page');
 expect(dom.container.querySelector('.provider-embed')).toBeNull();
 expect(dom.container.querySelector('iframe')).toBeNull();
});
it('uses a site icon when a page has no summary image',async()=>{
 preview.icon=true;
 await act(async()=>dom.root.render(createElement(LinkPreviews,{text:'https://example.com/watch',simple:true})));
 expect(dom.container.querySelector<HTMLImageElement>('.website-icon')?.getAttribute('src')).toBe('/api/link-previews/example/icon');
});
it('plays a direct linked video inside a DM and retains its source link',async()=>{
 preview.video=true;
 await act(async()=>dom.root.render(createElement(LinkPreviews,{text:'https://p057.co/:clip.mp4',simple:true})));
 expect(dom.container.querySelector<HTMLVideoElement>('video')?.src).toBe('https://p057.co/:clip.mp4');
 expect(dom.container.querySelector('.linked-video.provider-video')).toBeNull();
 expect(dom.container.querySelector('video')?.autoplay).toBe(false);
 expect(dom.container.querySelector<HTMLAnchorElement>('.attachment-source')?.href).toBe('https://p057.co/:clip.mp4');
 await act(async()=>dom.root.render(createElement('div')));
 expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
});
