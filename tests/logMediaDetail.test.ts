// @vitest-environment jsdom
import {act,createElement,useRef} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {LogDetail} from '../src/LogPanel';
import {LogJoinPanel} from '../src/LogJoining';
import {LogModal} from '../src/LogModal';
import {PanelVisibilityContext} from '../src/PanelReadiness';
import {ExperienceContext} from '../src/ExperienceContext';
import {ApiError} from '../src/api';
import {clearLogEntries} from '../src/logEntryCache';
import {logMediaEntries,boundLogImage,pinchLogImage,logImageBase} from '../src/logMediaDetailModel';
import {pageBoundaryTarget} from '../src/pageBoundaryScroll';
import {setupDOM,rect} from './dom';

const mocks=vi.hoisted(()=>({operation:vi.fn(),api:vi.fn(),genericMedia:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:mocks.operation,api:mocks.api}));
const photo=(id:string)=>({id,name:`${id}.webp`,mime:'image/webp',bytes:10,url:`/api/files/${id}`});
const user={id:'me',name:'Me',handle:'me',bio:'',city:'',interests:[],discoverable:false};
const entry={id:'entry',ownerId:'me',title:'At the park',date:'2026-09-29',place:'',links:[],recurrence:'none' as const,coverFileId:null,cover:photo('earliest'),revision:1,createdAt:'2026-09-29T00:00:00Z',updatedAt:'2026-09-29T00:00:00Z',membership:'member' as const,invitations:[],contributors:[
 {userId:'me',name:'Me',handle:'me',note:'My note with [a link](https://example.com).',files:[photo('newer')]},
 {userId:'friend',name:'Sam',handle:'sam',note:'Sam remembered the birds.',files:[photo('earliest'),{id:'voice',name:'Voice note.weba',mime:'audio/webm',bytes:10,url:'/api/files/voice'}]},
 {userId:'quiet',name:'Laura',handle:'laura',note:'Just a note.',files:[]},
]};
const source={id:entry.id,title:entry.title,contributors:entry.contributors,coverId:entry.cover.id};
let dom:ReturnType<typeof setupDOM>,show:ReturnType<typeof vi.fn>,hide:ReturnType<typeof vi.fn>,paused:HTMLMediaElement[];
beforeEach(()=>{
 dom=setupDOM();clearLogEntries();vi.clearAllMocks();paused=[];
 show=vi.fn(function(this:HTMLElement){this.setAttribute('data-test-top-layer','true');});hide=vi.fn(function(this:HTMLElement){this.removeAttribute('data-test-top-layer');});
 Object.defineProperties(HTMLElement.prototype,{showPopover:{configurable:true,value:show},hidePopover:{configurable:true,value:hide}});
 vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(function(this:HTMLMediaElement){paused.push(this);});
 mocks.operation.mockImplementation(async(name)=>name==='log.get'?entry:name==='log.neighbors'?{previous:null,next:null}:{items:[],nextCursor:null});
 mocks.api.mockResolvedValue({entryId:entry.id,title:entry.title,date:entry.date,place:'',joined:false,links:[],recurrence:'none',people:entry.contributors.map(person=>({id:person.userId,name:person.name,handle:person.handle})),photos:[{...photo('earliest'),url:'/api/log-invites/code/photos/earliest'},{...photo('newer'),url:'/api/log-invites/code/photos/newer'}],contributors:entry.contributors.map(person=>({...person,files:person.files.map(file=>({...file,url:`/api/log-invites/code/${file.mime.startsWith('image/')?'photos':'media'}/${file.id}`}))}))});
});
afterEach(()=>{dom.cleanup();vi.useRealTimers();delete (HTMLElement.prototype as any).showPopover;delete (HTMLElement.prototype as any).hidePopover;});
const detail=()=>dom.container.querySelector<HTMLDialogElement>('dialog.log-media-detail')!;
const control=(label:string)=>detail().querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
const nextMedia=async()=>act(async()=>detail().dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true})));
const pressPhoto=async(id='earliest')=>act(async()=>dom.container.querySelector<HTMLAnchorElement>(`.log-photo-strip a[data-photo-id="${id}"]`)!.click());
function Shell({active=true,navigate=vi.fn(),onClose=vi.fn(),onAdjacent=vi.fn()}:{active?:boolean;navigate?:(...args:any[])=>void;onClose?():void;onAdjacent?:(...args:any[])=>void}){
 const anchor=useRef<HTMLDivElement>(null);
 return createElement('div',{className:'app'},createElement('section',{className:'social-experience'},createElement('div',{className:'mode-main',ref:anchor},createElement(LogModal,{active,anchor,close:onClose,children:createElement(PanelVisibilityContext.Provider,{value:active},createElement(ExperienceContext.Provider,{value:{mode:'log',changeMode:vi.fn(),ask:vi.fn(),media:mocks.genericMedia,navigate}},createElement(LogDetail,{entryId:entry.id,user,navigate,onClose,onAdjacent})))}))));
}

it('opens a separate native top layer immediately and preserves the source hangout, photos and scroll',async()=>{
 const onClose=vi.fn();await act(async()=>dom.root.render(createElement(Shell,{onClose})));
 const original=dom.container.querySelector<HTMLElement>('.log-modal')!,article=original.querySelector('.log-detail')!,body=article.querySelector<HTMLElement>('.log-detail-body')!,image=body.querySelector('img');body.scrollTop=193;
 expect(body.querySelector<HTMLAnchorElement>('.log-photo-strip a')!.dataset.photoId).toBe('earliest');
 await pressPhoto();const layer=detail();expect(layer.tagName).toBe('DIALOG');expect(layer.open).toBe(true);expect(layer.getAttribute('popover')).toBe('manual');expect(layer.hasAttribute('aria-modal')).toBe(false);expect(layer.dataset.testTopLayer).toBe('true');
 expect(original.dataset.testTopLayer).toBe('true');expect(hide.mock.contexts).not.toContain(original);expect(body.scrollTop).toBe(193);expect(body.querySelector('img')).toBe(image);expect(article.hasAttribute('hidden')).toBe(false);expect(article.hasAttribute('inert')).toBe(false);
 expect(layer.querySelector('h2')?.textContent).toBe('At the park');expect(layer.querySelector('.log-note-content')?.textContent).toBe('Sam remembered the birds.');expect(layer.querySelector<HTMLAnchorElement>('.log-media-detail-author>a')?.getAttribute('href')).toBe('/people/friend');expect(layer.querySelector('audio')?.getAttribute('src')).toBe('/api/files/voice');
 expect(layer.querySelector<HTMLAnchorElement>('[download]')?.getAttribute('href')).toBe('/api/files/earliest');expect(control('Back to hangout')).toBeTruthy();expect(control('Close hangout')).toBeTruthy();expect(mocks.genericMedia).not.toHaveBeenCalled();
 await act(async()=>control('Back to hangout').click());dom.frame();expect(detail()).toBeNull();expect(original.querySelector('.log-detail')).toBe(article);expect(body.scrollTop).toBe(193);expect(body.querySelector('img')).toBe(image);expect(onClose).not.toHaveBeenCalled();
});

it('keeps decoded opening pixels while the real image loads without postponing controls',async()=>{
 await act(async()=>dom.root.render(createElement(Shell)));
 const thumbnail=dom.container.querySelector<HTMLImageElement>('a[data-photo-id="earliest"] img')!;Object.defineProperties(thumbnail,{complete:{configurable:true,value:true},naturalWidth:{value:512},naturalHeight:{value:768}});
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn()} as any);vi.spyOn(HTMLCanvasElement.prototype,'toDataURL').mockReturnValue('data:image/webp;base64,decoded');
 await pressPhoto();const layer=detail(),preview=layer.querySelector('.log-media-detail-preview');expect(preview?.getAttribute('src')).toBe('data:image/webp;base64,decoded');expect(control('Back to hangout')).toBeTruthy();expect(layer.querySelector('[download]')).toBeTruthy();
 const image=layer.querySelector<HTMLImageElement>('.log-media-detail-image>img:not(.log-media-detail-preview)')!;Object.defineProperties(image,{naturalWidth:{value:512},naturalHeight:{value:768}});await act(async()=>image.dispatchEvent(new Event('load')));
 expect(detail()).toBe(layer);expect(layer.querySelector('.log-media-detail-preview')).toBeNull();expect(image.style.visibility).toBe('visible');expect(layer.querySelector('[aria-label="Loading photo"]')).toBeNull();
});

it('navigates media and notes without navigating the underlying hangout or duplicating its images',async()=>{
 const onClose=vi.fn(),onAdjacent=vi.fn();await act(async()=>dom.root.render(createElement(Shell,{onClose,onAdjacent})));await pressPhoto();const layer=detail();
 await nextMedia();expect(detail()).toBe(layer);expect(layer.querySelector('.log-note-content')?.textContent).toContain('My note');expect(layer.querySelector('[download]')?.getAttribute('href')).toBe('/api/files/newer');
 await nextMedia();expect(layer.querySelector('.log-note-content')?.textContent).toBe('Just a note.');expect(layer.querySelector('.log-media-detail-empty')?.textContent).toBe('(no visual)');expect(layer.querySelector('[download]')).toBeNull();await nextMedia();expect(layer.querySelector('.log-note-content')?.textContent).toBe('Just a note.');
 await act(async()=>layer.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})));expect(layer.querySelector('.log-note-content')?.textContent).toContain('My note');
 await act(async()=>layer.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));expect(detail()).toBeNull();expect(onAdjacent).not.toHaveBeenCalled();expect(onClose).not.toHaveBeenCalled();expect(dom.container.querySelectorAll('.log-photo-strip img')).toHaveLength(2);
});

it('opens a contributor note with their photo and keeps Markdown links independent',async()=>{
 await act(async()=>dom.root.render(createElement(Shell)));const note=dom.container.querySelector<HTMLElement>('[aria-label="Open me\'s note"]')!;
 const link=note.querySelector('a')!,event=new MouseEvent('click',{bubbles:true,cancelable:true});await act(async()=>link.dispatchEvent(event));expect(event.defaultPrevented).toBe(false);expect(detail()).toBeNull();
 await act(async()=>note.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));expect(detail().querySelector('[download]')?.getAttribute('href')).toBe('/api/files/newer');expect(detail().querySelector('.log-note-content')?.textContent).toContain('My note');
});

it('restores an open media detail when returning from its contributor profile',async()=>{
 const navigate=vi.fn();await act(async()=>dom.root.render(createElement(Shell,{navigate})));await pressPhoto();const layer=detail();await act(async()=>layer.querySelector<HTMLAnchorElement>('.log-media-detail-author>a')!.click());expect(navigate).toHaveBeenLastCalledWith({view:'person',resourceId:'friend'});
 await act(async()=>dom.root.render(createElement(Shell,{navigate,active:false})));expect(detail()).toBe(layer);expect(layer.open).toBe(false);
 await act(async()=>dom.root.render(createElement(Shell,{navigate,active:true})));expect(detail()).toBe(layer);expect(layer.dataset.testTopLayer).toBe('true');expect(layer.querySelector('.log-note-content')?.textContent).toBe('Sam remembered the birds.');
});

it('tracks the retained panel as chat moves it and routes Command boundaries into the media detail',async()=>{
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this.matches('.mode-main,.log-modal')?rect(this.closest('.app')?.hasAttribute('data-agent-dock')?320:500,12,680,800):rect(0,12,1500,800);});
 await act(async()=>dom.root.render(createElement(Shell)));await pressPhoto();const layer=detail(),app=dom.container.querySelector<HTMLElement>('.app')!,body=layer.querySelector<HTMLElement>('.log-detail-body')!;expect(layer.style.left).toBe('500px');
 await act(async()=>app.setAttribute('data-agent-dock','true'));expect(layer.style.left).toBe('320px');expect(layer.style.height).toBe('800px');expect(pageBoundaryTarget(app)).toBe(body);
});

it('does not turn a pinch or a zoomed pan into media navigation',async()=>{
 await act(async()=>dom.root.render(createElement(Shell)));await pressPhoto();const layer=detail(),frame=layer.querySelector<HTMLElement>('.log-media-detail-image')!,image=frame.querySelector<HTMLImageElement>('img')!;
 Object.defineProperties(image,{naturalWidth:{value:512},naturalHeight:{value:512}});vi.spyOn(frame,'getBoundingClientRect').mockReturnValue(rect(0,0,400,400));await act(async()=>image.dispatchEvent(new Event('load')));
 const pointer=(type:string,id:number,x:number,y:number)=>{const event=new MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y});Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:'touch'}});act(()=>frame.dispatchEvent(event));};
 pointer('pointerdown',1,150,200);pointer('pointerdown',2,250,200);pointer('pointermove',1,100,200);pointer('pointermove',2,300,200);expect(Number(frame.dataset.scale)).toBeCloseTo(2);
 pointer('pointerup',1,40,200);pointer('pointerup',2,320,200);expect(layer.querySelector('[download]')?.getAttribute('href')).toBe('/api/files/earliest');
 pointer('pointerdown',3,300,200);pointer('pointermove',3,100,200);pointer('pointerup',3,50,200);expect(layer.querySelector('[download]')?.getAttribute('href')).toBe('/api/files/earliest');expect(Number(frame.dataset.scale)).toBeCloseTo(2);
});

it('swipes between media only when unzoomed and keeps the same top layer',async()=>{
 await act(async()=>dom.root.render(createElement(Shell)));await pressPhoto();const layer=detail(),frame=layer.querySelector<HTMLElement>('.log-media-detail-image')!;
 const pointer=(type:string,x:number)=>{const event=new MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:100});Object.defineProperties(event,{pointerId:{value:1},pointerType:{value:'touch'}});act(()=>frame.dispatchEvent(event));};pointer('pointerdown',200);pointer('pointerup',100);
 expect(detail()).toBe(layer);expect(layer.querySelector('[download]')?.getAttribute('href')).toBe('/api/files/newer');
});

it('swipes from a note-only detail back to its adjacent media',async()=>{
 await act(async()=>dom.root.render(createElement(Shell)));await act(async()=>dom.container.querySelector<HTMLElement>('[aria-label="Open laura\'s note"]')!.click());const layer=detail(),frame=layer.querySelector<HTMLElement>('.log-media-detail-empty')!;
 const pointer=(type:string,x:number)=>{const event=new MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:100});Object.defineProperties(event,{pointerId:{value:1},pointerType:{value:'touch'}});act(()=>frame.dispatchEvent(event));};pointer('pointerdown',100);pointer('pointerup',200);
 expect(detail()).toBe(layer);expect(layer.querySelector('[download]')?.getAttribute('href')).toBe('/api/files/newer');
});

it('pauses source voice playback while showing the associated voice note above it',async()=>{
 await act(async()=>dom.root.render(createElement(Shell)));const sourceAudio=dom.container.querySelector<HTMLAudioElement>('.log-contributions audio')!;paused=[];await pressPhoto();expect(paused).toContain(sourceAudio);expect(detail().querySelector('audio')).not.toBe(sourceAudio);
 const detailAudio=detail().querySelector<HTMLAudioElement>('audio')!;await nextMedia();expect(paused).toContain(detailAudio);expect(detail().querySelector('audio')).toBeNull();
});

it('evicts an open detail when the canonical hangout read revokes access',async()=>{
 await act(async()=>dom.root.render(createElement(Shell)));await pressPhoto();vi.useFakeTimers();mocks.operation.mockImplementation(async(name)=>{if(name==='log.get')throw new ApiError('Unavailable','not_found',404);return {previous:null,next:null};});await act(async()=>{window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:['log']}));await vi.advanceTimersByTimeAsync(75);});expect(detail()).toBeNull();expect(dom.container.textContent).toContain('Unavailable');
});

it('uses live code-authorized URLs for anonymous invite media and keeps joining explicit',async()=>{
 const onAccount=vi.fn();await act(async()=>dom.root.render(createElement(LogJoinPanel,{code:'code',registered:false,navigate:vi.fn(),close:vi.fn(),onAccount})));const original=dom.container.querySelector<HTMLElement>('.log-join')!,body=original.querySelector<HTMLElement>('.log-detail-body')!;body.scrollTop=126;await pressPhoto();
 expect(detail().querySelector('[download]')?.getAttribute('href')).toBe('/api/log-invites/code/photos/earliest');expect(detail().querySelector('audio')?.getAttribute('src')).toBe('/api/log-invites/code/media/voice');expect(body.scrollTop).toBe(126);expect(onAccount).not.toHaveBeenCalled();expect(mocks.operation.mock.calls.some(call=>call[0]==='log.join')).toBe(false);
 vi.useFakeTimers();mocks.api.mockRejectedValue(new ApiError('Code unavailable','not_found',404));await act(async()=>{window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:['log']}));await vi.advanceTimersByTimeAsync(75);});expect(detail()).toBeNull();expect(dom.container.textContent).toContain('Code unavailable');
});

it('uses Logcal\'s text-only download row above Back and Close, with separate return behavior',async()=>{
 const onClose=vi.fn();await act(async()=>dom.root.render(createElement(Shell,{onClose})));await pressPhoto();const layer=detail(),footer=layer.querySelector('.log-media-detail-footer')!;
 expect([...footer.children].map(row=>row.textContent)).toEqual(['Download','BackClose']);expect(footer.querySelector('svg')).toBeNull();expect(footer.querySelector('.log-adjacent')).toBeNull();expect(control('Back to hangout').classList.contains('log-media-back')).toBe(true);
 await act(async()=>control('Close hangout').click());expect(detail()).toBeNull();expect(onClose).toHaveBeenCalledOnce();
});

it('includes note-only people and associated video without duplicating contributions',()=>{
 const items=logMediaEntries(source);expect(items.map(item=>item.key)).toEqual(['earliest','newer','note:quiet']);expect(items[0].contributor.files.some(file=>file.id==='voice')).toBe(true);
 const video={id:'video',name:'Clip.mp4',url:'/clip',mime:'video/mp4',bytes:10};expect(logMediaEntries({...source,contributors:[{...source.contributors[2],files:[video]}]})).toMatchObject([{key:'video',file:video,contributor:{note:'Just a note.'}}]);
});

it('clamps pan to the contained image instead of inventing a square image shape',()=>{
 const image={width:400,height:800},frame={width:400,height:400};expect(boundLogImage({scale:2,x:100,y:300},image,frame)).toEqual({scale:2,x:0,y:200});expect(boundLogImage({scale:1,x:200,y:300},image,frame)).toEqual(logImageBase);
 expect(pinchLogImage(logImageBase,2,{x:0,y:40},{x:0,y:40},image,frame)).toEqual({scale:2,x:0,y:-40});expect(boundLogImage({scale:10,x:1e6,y:-1e6},image,frame)).toEqual({scale:4,x:200,y:-600});
});
