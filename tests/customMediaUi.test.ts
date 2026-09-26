// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {CustomMedia} from '../src/CustomMedia';
import {setupDOM} from './dom';
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});});afterEach(()=>dom.cleanup());
it('renders MUSE audio and pauses it when its surface is hidden',async()=>{
 const render=(active:boolean)=>act(async()=>dom.root.render(createElement(CustomMedia,{document:{spec:'MUSE',title:'Song',audio:'https://example.com/song.mp3'},url:'https://example.com/song.muse',active,renderLink:()=>null})));
 await render(true);expect(dom.container.querySelector('audio')?.src).toBe('https://example.com/song.mp3');await render(false);expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
});
it('navigates CIF cards and reveals its image tag links',async()=>{
 await act(async()=>dom.root.render(createElement(CustomMedia,{document:{spec:'CIF',version:1,cards:[{image:'https://example.com/a.png',caption:'One',tags:[{rx:.5,ry:.5,label:'More',url:'https://example.com/more'}]},{image:'https://example.com/b.png',caption:'Two'}]},url:'https://example.com/file.cif',active:true,renderLink:()=>null})));
 act(()=>dom.container.querySelector<HTMLButtonElement>('.cif-tag button')!.click());expect(dom.container.querySelector('.cif-tag-label a')?.getAttribute('href')).toBe('https://example.com/more');
 act(()=>dom.container.querySelector<HTMLButtonElement>('[aria-label="Next card"]')!.click());expect(dom.container.textContent).toContain('Two');expect(dom.container.querySelector('.cif-tag')).toBeNull();
});
it('expands a POPS article and treats text as text',async()=>{
 await act(async()=>dom.root.render(createElement(CustomMedia,{document:{spec:'POPS',title:'Article',blocks:[{text:'<script>no execution</script>'},{text:'Two'},{text:'Three'},{text:'Four'}]},url:'https://example.com/file.pops',active:true,renderLink:()=>null})));
 expect(dom.container.querySelector('script')).toBeNull();expect(dom.container.textContent).not.toContain('Four');act(()=>dom.container.querySelector<HTMLButtonElement>('.custom-expand')!.click());expect(dom.container.textContent).toContain('Four');
});
it('reserves the CIF media frame before load and keeps tags aligned to the contained image',async()=>{
 await act(async()=>dom.root.render(createElement(CustomMedia,{document:{spec:'CIF',version:1,cards:[{image:'https://example.com/portrait.png',tags:[{rx:.5,ry:.5,label:'Center'}]},{video:'https://example.com/video.mp4'}]},url:'https://example.com/file.cif',active:true,renderLink:()=>null})));
 const frame=dom.container.querySelector('.cif-media-frame')!;expect(frame).not.toBeNull();
 const image=dom.container.querySelector('img')!;Object.defineProperties(image,{naturalWidth:{value:512},naturalHeight:{value:1024}});act(()=>image.dispatchEvent(new Event('load')));
 expect(dom.container.querySelector('.cif-media-frame')).toBe(frame);expect(dom.container.querySelector<HTMLElement>('.cif-picture')?.style.width).toBe('50%');expect(dom.container.querySelector<HTMLElement>('.cif-picture')?.style.height).toBe('100%');
 act(()=>dom.container.querySelector<HTMLButtonElement>('[aria-label="Next card"]')!.click());expect(dom.container.querySelector('.cif-media-frame>video')).not.toBeNull();
});
it('hides raw MUSE and CIF sources while retaining the declared track destination',async()=>{
 const raw='https://example.com/song.muse',track='https://open.spotify.com/track/3rqyWkpY4Qx3HVsryAOcFu';
 await act(async()=>dom.root.render(createElement(CustomMedia,{document:{spec:'MUSE',title:'FILLE',artist:'Cannelle',audio:'https://example.com/fille.mp3',distributable:false,url:{audio:track}},url:raw,active:true,renderLink:()=>null})));
 expect(dom.container.querySelector(`a[href="${raw}"]`)).toBeNull();expect(dom.container.querySelector(`a[href="${track}"]`)).not.toBeNull();expect(dom.container.querySelector('a[href="https://example.com/fille.mp3"]')).toBeNull();
 await act(async()=>dom.root.render(createElement(CustomMedia,{document:{spec:'CIF',version:1,card:{image:'https://example.com/image.jpg'}},url:'https://example.com/file.cif',active:true,renderLink:()=>null})));
 expect(dom.container.querySelector('a[href="https://example.com/file.cif"]')).toBeNull();
});
