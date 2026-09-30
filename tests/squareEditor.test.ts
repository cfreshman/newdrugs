// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {SquareEditor} from '../src/SquareEditor';
import {setupDOM,rect} from './dom';

const mock=vi.hoisted(()=>({prepare:vi.fn(),paint:vi.fn(),image:vi.fn(),made:vi.fn(),squareImage:vi.fn()}));
vi.mock('../src/squareFonts',()=>({ensureSquareFonts:vi.fn().mockResolvedValue(undefined),ensureSquareFontPreviews:vi.fn().mockResolvedValue(undefined)}));
vi.mock('../src/squareRenderer',()=>({
 SquarePainter:class{prepare=mock.prepare;paint=mock.paint;image=mock.image;layoutText=vi.fn(()=>({size:80,lines:['A walk']}));dispose=vi.fn();},
 squareImage:mock.squareImage,madeSquare:mock.made,
}));

let dom:ReturnType<typeof setupDOM>;
const button=(name:string)=>dom.container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
const pointer=async(target:Element,type:string,id:number,x:number,y:number)=>act(async()=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:id,pointerType:'touch',button:0,clientX:x,clientY:y});target.dispatchEvent(event);});
const stage=()=>dom.container.querySelector<HTMLDivElement>('.square-stage')!;
const artwork=()=>mock.made.mock.lastCall?.[0] as import('../src/squareModel').SquareProject;

beforeEach(()=>{
 dom=setupDOM();mock.prepare.mockReset().mockResolvedValue(new Map());mock.paint.mockReset();mock.image.mockReset().mockResolvedValue({naturalWidth:800,naturalHeight:400});mock.squareImage.mockReset();mock.made.mockReset().mockResolvedValue(new File(['image'],'Made image.png',{type:'image/png'}));
 vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(320);vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(600);
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this.classList.contains('square-stage')?rect(0,0,320,320):rect(0,0,320,600);});
 HTMLElement.prototype.setPointerCapture=vi.fn();
});
afterEach(()=>dom.cleanup());

it('places text at the tapped point and keeps the top and bottom controls mounted through editing',async()=>{
 const useImage=vi.fn();await act(async()=>dom.root.render(createElement(SquareEditor,{active:true,cancel:vi.fn(),useImage})));
 const header=dom.container.querySelector('.square-toolbar'),footer=dom.container.querySelector('.square-footer');await act(async()=>button('Add text').click());expect(dom.container.querySelector('[aria-label="Image text"]')).toBeNull();expect(button('Add text').getAttribute('aria-pressed')).toBe('true');
 await pointer(stage(),'pointerdown',1,260,80);const input=dom.container.querySelector<HTMLTextAreaElement>('[aria-label="Image text"]')!,selection=dom.container.querySelector<HTMLElement>('.square-selection')!;expect(selection.style.left).toBe('56.25%');expect(selection.style.top).toBe('15%');expect(input.closest('.square-stage')).toBe(stage());expect(dom.container.querySelector('.square-toolbar')).toBe(header);expect(dom.container.querySelector('.square-footer')).toBe(footer);expect(footer?.textContent).toContain('Add to Log entry');
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'A walk');input.dispatchEvent(new Event('input',{bubbles:true}));});dom.frame();const whileEditing=mock.paint.mock.lastCall?.[1].layers[0];expect(whileEditing.text).toBe('A walk');
 await pointer(stage(),'pointerdown',2,10,300);expect(dom.container.querySelector('[aria-label="Image text"]')).toBeNull();expect(dom.container.querySelector('.square-selection')).toBeNull();dom.frame();expect(mock.paint.mock.lastCall?.[1].layers[0]).toEqual(whileEditing);
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('.square-footer .solid')!.click());
 expect(artwork().layers).toHaveLength(1);expect(artwork().layers[0]).toMatchObject({type:'text',x:.5625,y:.15,align:'center'});expect(useImage).toHaveBeenCalledOnce();
});

it('prepares assets only when resources change and undoes a two-finger transform in one step',async()=>{
 await act(async()=>dom.root.render(createElement(SquareEditor,{active:true,cancel:vi.fn(),useImage:vi.fn()})));
 await act(async()=>button('Add shape').click());const before=mock.prepare.mock.calls.length;
 await pointer(stage(),'pointerdown',1,120,160);await pointer(stage(),'pointerdown',2,200,160);await pointer(stage(),'pointermove',2,240,180);await pointer(stage(),'pointerup',2,240,180);await pointer(stage(),'pointerup',1,120,160);
 expect(mock.prepare).toHaveBeenCalledTimes(before);await act(async()=>dom.container.querySelector<HTMLButtonElement>('.square-footer .solid')!.click());const transformed=artwork().layers[0];expect(transformed.w).toBeGreaterThan(.5);expect(transformed.angle).not.toBe(0);
 await act(async()=>button('Undo').click());await act(async()=>dom.container.querySelector<HTMLButtonElement>('.square-footer .solid')!.click());expect(artwork().layers[0].w).toBe(.5);expect(artwork().layers[0].angle).toBe(0);
});

it('ends text editing without losing selection so the text can be dragged',async()=>{
 await act(async()=>dom.root.render(createElement(SquareEditor,{active:true,cancel:vi.fn(),useImage:vi.fn()})));
 await act(async()=>button('Add text').click());await pointer(stage(),'pointerdown',1,160,160);
 const input=dom.container.querySelector<HTMLTextAreaElement>('[aria-label="Image text"]')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(input,'Hi');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>button('End edit').click());expect(dom.container.querySelector('[aria-label="Image text"]')).toBeNull();expect(dom.container.querySelector('.square-selection')).not.toBeNull();
 await pointer(stage(),'pointerdown',2,160,160);await pointer(stage(),'pointermove',2,192,192);await pointer(stage(),'pointerup',2,192,192);await act(async()=>dom.container.querySelector<HTMLButtonElement>('.square-footer .solid')!.click());
 expect(artwork().layers[0].x).toBeGreaterThan(.25);expect(artwork().layers[0].y).toBeGreaterThan(.4);
});

it('places the resize handle on the rotated corner and cancels a drawing stroke when a second touch begins',async()=>{
 await act(async()=>dom.root.render(createElement(SquareEditor,{active:true,cancel:vi.fn(),useImage:vi.fn()})));
 await act(async()=>button('Add shape').click());const handle=button('Resize selected layer');expect(handle.style.left).toBe('75%');expect(handle.style.top).toBe('25%');
 await act(async()=>button('Draw').click());expect(button('Draw').getAttribute('aria-pressed')).toBe('true');await act(async()=>button('Send to back').click());await act(async()=>dom.container.querySelector<HTMLButtonElement>('.square-footer .solid')!.click());expect(artwork().layers.map(layer=>layer.type)).toEqual(['draw','shape']);
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),stroke:vi.fn()} as any);
 await pointer(stage(),'pointerdown',1,60,60);await pointer(stage(),'pointermove',1,100,100);await pointer(stage(),'pointerdown',2,180,180);
 expect(dom.container.querySelector('.square-context')).toBeNull();
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('.square-footer .solid')!.click());expect(artwork().layers.find(layer=>layer.type==='draw')?.src).toBeUndefined();
});

it('fits an imported image to the full square rather than leaving an inset',async()=>{
 mock.squareImage.mockResolvedValue({src:'data:image/png;base64,AA==',aspect:2});
 await act(async()=>dom.root.render(createElement(SquareEditor,{active:true,cancel:vi.fn(),useImage:vi.fn()})));
 const input=dom.container.querySelector<HTMLInputElement>('.square-editor input[type=file]')!;Object.defineProperty(input,'files',{configurable:true,value:[new File(['photo'],'photo.png',{type:'image/png'})]});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
 await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('.square-context button')].find(button=>button.textContent==='Fill frame')!.click());await act(async()=>dom.container.querySelector<HTMLButtonElement>('.square-footer .solid')!.click());
 expect(artwork().layers[0]).toMatchObject({x:0,y:0,w:1,h:1,angle:0});
});

it('keeps the custom color after a preset and requires confirmation to clear all layers',async()=>{
 await act(async()=>dom.root.render(createElement(SquareEditor,{active:true,cancel:vi.fn(),useImage:vi.fn()})));
 const custom=dom.container.querySelector<HTMLInputElement>('[aria-label="Custom color"]')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(custom,'#123456');custom.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>button('Color #ec4d3e').click());expect(custom.value).toBe('#123456');
 await act(async()=>button('Add shape').click());await act(async()=>button('Deselect layer').click());const clear=[...dom.container.querySelectorAll<HTMLButtonElement>('button')].find(value=>value.textContent==='Clear all')!;await act(async()=>clear.click());
 expect(dom.container.textContent).toContain('Confirm clear');await act(async()=>dom.container.querySelector<HTMLButtonElement>('.square-footer .solid')!.click());expect(artwork().layers).toHaveLength(1);
 await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('button')].find(value=>value.textContent==='Confirm clear')!.click());await act(async()=>dom.container.querySelector<HTMLButtonElement>('.square-footer .solid')!.click());expect(artwork().layers).toHaveLength(0);
});

it('retains the top toolbar and final footer while cropping',async()=>{
 mock.squareImage.mockResolvedValue({src:'data:image/png;base64,AA==',aspect:2});await act(async()=>dom.root.render(createElement(SquareEditor,{active:true,cancel:vi.fn(),useImage:vi.fn()})));
 const input=dom.container.querySelector<HTMLInputElement>('.square-editor input[type=file]')!;Object.defineProperty(input,'files',{configurable:true,value:[new File(['photo'],'photo.png',{type:'image/png'})]});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));
 const header=dom.container.querySelector('.square-toolbar'),footer=dom.container.querySelector('.square-footer');await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('.square-context button')].find(value=>value.textContent==='Crop')!.click());
 expect(dom.container.querySelector('.square-toolbar')).toBe(header);expect(dom.container.querySelector('.square-footer')).toBe(footer);expect(footer?.textContent).toContain('Add to Log entry');expect(dom.container.querySelector('.square-crop')).not.toBeNull();
});
