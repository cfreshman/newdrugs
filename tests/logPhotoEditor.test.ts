// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {setupDOM} from './dom';
import {LogEditor} from '../src/LogPanel';
import {LogPhotoEditor} from '../src/LogPhotoEditor';
import {croppedPhoto} from '../src/photoCrop';
const mocks=vi.hoisted(()=>({upload:vi.fn(),operation:vi.fn()}));
vi.mock('../src/uploads',()=>({uploadFile:mocks.upload}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:mocks.operation}));
const user={id:'me',name:'Me',bio:'',city:'',interests:[],discoverable:false,handle:'me'};
const file=new File(['source'],'Camera.jpg',{type:'image/jpeg'});
let dom:ReturnType<typeof setupDOM>,draw:ReturnType<typeof vi.fn>;
beforeEach(()=>{
 dom=setupDOM();mocks.operation.mockReset().mockResolvedValue({items:[],nextCursor:null});mocks.upload.mockReset().mockResolvedValue({id:'saved-photo',name:'Camera.webp',mime:'image/webp',url:'/photo'});
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:crop');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(300);
 draw=vi.fn();vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:draw} as any);
 vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(callback=>callback(new Blob(['crop'],{type:'image/webp'})));
});
afterEach(()=>dom.cleanup());
const choose=async()=>{const input=dom.container.querySelector<HTMLInputElement>('input[type=file]')!;Object.defineProperty(input,'files',{configurable:true,value:[file]});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));};
const loaded=async()=>{const img=dom.container.querySelector<HTMLImageElement>('.log-crop-frame img')!;Object.defineProperty(img,'naturalWidth',{value:4000});Object.defineProperty(img,'naturalHeight',{value:3000});await act(async()=>img.dispatchEvent(new Event('load')));return img;};
it('opens crop before upload and cancel preserves the mounted editor, draft and scroll',async()=>{
 await act(async()=>dom.root.render(createElement(LogEditor,{user,cancel:vi.fn(),onSaved:vi.fn()})));
 const note=dom.container.querySelector<HTMLTextAreaElement>('[aria-label="Your note"]')!,body=dom.container.querySelector<HTMLElement>('.log-editor-body')!;body.scrollTop=75;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(note,'Keep my note');note.dispatchEvent(new Event('input',{bubbles:true}));});
 await choose();expect(mocks.upload).not.toHaveBeenCalled();expect(dom.container.querySelector('.log-editor')?.hasAttribute('hidden')).toBe(true);expect(dom.container.querySelector('[aria-label="Crop photo"]')).not.toBeNull();
 await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('.log-crop-actions button')].find(button=>button.textContent==='Cancel')!.click());
 expect(dom.container.querySelector('[aria-label="Your note"]')).toBe(note);expect(note.value).toBe('Keep my note');expect(body.scrollTop).toBe(75);expect(mocks.upload).not.toHaveBeenCalled();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:crop');
});
it('uploads only the approved square and returns to the same draft',async()=>{
 await act(async()=>dom.root.render(createElement(LogEditor,{user,cancel:vi.fn(),onSaved:vi.fn()})));await choose();await loaded();
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('.log-crop-actions .solid')!.click());
 expect(draw).toHaveBeenCalledWith(expect.anything(),500,0,3000,3000,0,0,512,512);expect(mocks.upload).toHaveBeenCalledOnce();const uploaded=mocks.upload.mock.calls[0][0] as File;expect(uploaded.name).toBe('Camera.webp');expect(uploaded.type).toBe('image/webp');expect(uploaded).not.toBe(file);expect(dom.container.querySelector('[aria-label="Crop photo"]')).toBeNull();
});
it('zooms and resets without letting Escape close the surrounding Log modal',async()=>{
 const cancel=vi.fn(),outer=vi.fn();await act(async()=>dom.root.render(createElement('div',{onKeyDown:outer},createElement(LogPhotoEditor,{file,cancel,save:vi.fn()}))));await loaded();
 const range=dom.container.querySelector<HTMLInputElement>('[aria-label="Photo zoom"]')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(range,'2');range.dispatchEvent(new Event('input',{bubbles:true}));});expect(dom.container.querySelector('output')?.textContent).toBe('2.0×');
 await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('.log-crop-zoom button')].find(button=>button.textContent==='Reset')!.click());expect(range.value).toBe('1');
 await act(async()=>range.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));expect(cancel).toHaveBeenCalledOnce();expect(outer).not.toHaveBeenCalled();
});
it('does not upscale small crops',async()=>{await croppedPhoto(document.createElement('img'),{x:0,y:0,size:120},'small.png');expect(draw).toHaveBeenCalledWith(expect.anything(),0,0,120,120,0,0,120,120);});
it('combines pinch zoom and pan, then continues one-finger dragging without a zoom jump',async()=>{
 await act(async()=>dom.root.render(createElement(LogPhotoEditor,{file,cancel:vi.fn(),save:vi.fn()})));await loaded();
 const frame=dom.container.querySelector<HTMLDivElement>('.log-crop-frame')!;frame.setPointerCapture=vi.fn();vi.spyOn(frame,'getBoundingClientRect').mockReturnValue({left:0,top:0,right:300,bottom:300,width:300,height:300,x:0,y:0,toJSON:()=>{}});
 const pointer=async(type:string,id:number,x:number,y:number)=>act(async()=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:id,pointerType:'touch',button:0,clientX:x,clientY:y});frame.dispatchEvent(event);});
 await pointer('pointerdown',1,100,150);await pointer('pointerdown',2,200,150);await pointer('pointermove',2,250,150);expect(dom.container.querySelector('output')?.textContent).toBe('1.5×');
 await pointer('pointerup',2,250,150);const image=frame.querySelector('img')!,before=image.style.left;await pointer('pointermove',1,120,150);expect(image.style.left).not.toBe(before);expect(dom.container.querySelector('output')?.textContent).toBe('1.5×');
 await pointer('pointercancel',1,120,150);const cancelled=image.style.left;await pointer('pointermove',1,180,150);expect(image.style.left).toBe(cancelled);
});
it('does not upload a crop that finishes exporting after the editor is closed',async()=>{
 let finish!:BlobCallback;vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation(callback=>{finish=callback;});const save=vi.fn();
 await act(async()=>dom.root.render(createElement(LogPhotoEditor,{file,cancel:vi.fn(),save})));await loaded();await act(async()=>dom.container.querySelector<HTMLButtonElement>('.log-crop-actions .solid')!.click());
 await act(async()=>dom.root.render(null));await act(async()=>finish(new Blob(['crop'],{type:'image/webp'})));expect(save).not.toHaveBeenCalled();
});
