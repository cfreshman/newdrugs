// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {ImageViewer,imageDimensions,fittedImageZoom} from '../src/ImageViewer';
import {PostPhotos} from '../src/PostPhotos';
import {ExperienceContext} from '../src/ExperienceContext';
import {setupDOM} from './dom';
const library=vi.hoisted(()=>({options:null as any,instance:null as any}));
vi.mock('photoswipe',()=>({default:class{
 element=document.createElement('div');events=new Map<string,()=>void>();
 constructor(options:unknown){library.options=options;library.instance=this;}
 on(name:string,fn:()=>void){this.events.set(name,fn);}
 init(){this.events.get('afterInit')?.();}
 destroy(){this.events.get('destroy')?.();}
 updateSize(){}
 refreshSlideContent(){}
}}));
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();library.options=null;library.instance=null;});afterEach(()=>dom.cleanup());
it('opens the selected post photo with actual dimensions and retains the source anchor',()=>{
 const media=vi.fn();const photos=[{id:'a',url:'/a.webp',name:'Plant'},{id:'b',url:'/b.webp',name:'Second photo'}];
 act(()=>dom.root.render(createElement(ExperienceContext.Provider,{value:{mode:'posts',changeMode:vi.fn(),ask:vi.fn(),navigate:vi.fn(),media}},createElement(PostPhotos,{photos}))));
 const images=dom.container.querySelectorAll('img');images.forEach(img=>Object.defineProperties(img,{naturalWidth:{value:512},naturalHeight:{value:768}}));
 const anchors=dom.container.querySelectorAll('a');const click=new MouseEvent('click',{bubbles:true,cancelable:true});act(()=>anchors[1].dispatchEvent(click));
 expect(click.defaultPrevented).toBe(true);expect(media).toHaveBeenCalledWith([expect.objectContaining({id:'a',width:512,height:768,element:anchors[0]}),expect.objectContaining({id:'b',width:512,height:768,element:anchors[1]})],1);
});
it('delegates focal zoom and pan to PhotoSwipe without closing or switching photos mid-pinch',async()=>{
 const close=vi.fn();await act(async()=>dom.root.render(createElement(ImageViewer,{items:[{id:'a',url:'/a.webp',name:'Plant',width:512,height:768}],index:0,close})));
 expect(library.options).toMatchObject({allowPanToNext:false,pinchToClose:false,closeOnVerticalDrag:false,bgClickAction:'close',trapFocus:true});
 expect(library.options.dataSource[0]).toMatchObject({width:512,height:768});expect(library.options.secondaryZoomLevel({panAreaSize:{x:256,y:512},elementSize:{x:512,y:768}})).toBe(1.25);
 expect(library.instance.element.getAttribute('aria-modal')).toBe('true');
 act(()=>library.instance.events.get('destroy')());expect(close).toHaveBeenCalledOnce();
});
it('cancels dimension loading without opening a late viewer',async()=>{
 const controller=new AbortController();const dimensions=imageDimensions({id:'a',url:'/never.webp',name:'Photo'},controller.signal);controller.abort();expect(await dimensions).toBeNull();
});

it('opens a ready photo without waiting for another gallery image',async()=>{
 await act(async()=>dom.root.render(createElement(ImageViewer,{items:[{id:'ready',url:'/ready.webp',name:'Ready',width:512,height:512},{id:'slow',url:'/slow.webp',name:'Loading'}],index:0,close:vi.fn()})));
 expect(library.options.dataSource[0].src).toBe('/ready.webp');expect(library.options.dataSource[1].html).toContain('Loading photo');
});

it('fits even our downscaled images to the full viewport without cropping',()=>{
 expect(fittedImageZoom({panAreaSize:{x:1440,y:900},elementSize:{x:512,y:512}})).toBe(900/512);
 expect(fittedImageZoom({panAreaSize:{x:390,y:844},elementSize:{x:512,y:768}})).toBe(390/512);
});
