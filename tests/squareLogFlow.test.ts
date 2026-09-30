// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {LogEditor} from '../src/LogPanel';
import {setupDOM} from './dom';

const mock=vi.hoisted(()=>({upload:vi.fn(),operation:vi.fn(),made:0}));
vi.mock('../src/uploads',()=>({uploadFile:mock.upload}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:mock.operation}));
vi.mock('../src/SquareEditor',async()=>{const {createElement}=await import('react');return {SquareEditor:({active,cancel,useImage}:{active:boolean;cancel():void;useImage(file:File):void})=>createElement('section',{'data-square-editor':'',hidden:!active},createElement('button',{type:'button',onClick:()=>useImage(new File([`image ${++mock.made}`],'Made image.png',{type:'image/png'}))},'Use fake image'),createElement('button',{type:'button',onClick:cancel},'Cancel making'))};});

const user={id:'me',name:'Me',handle:'me',bio:'',city:'',interests:[],discoverable:false};
let dom:ReturnType<typeof setupDOM>;
const button=(text:string)=>[...dom.container.querySelectorAll<HTMLButtonElement>('button')].find(value=>value.textContent===text&&!value.closest('[hidden]'))!;
const save=async()=>act(async()=>dom.container.querySelector<HTMLFormElement>('form.log-editor')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
const made=async()=>{await act(async()=>button('make').click());await act(async()=>button('Use fake image').click());};

beforeEach(()=>{
 dom=setupDOM();mock.made=0;mock.upload.mockReset().mockResolvedValue({id:'saved-image',name:'Made image.png',mime:'image/png',bytes:7,url:'/api/files/saved-image'});mock.operation.mockReset().mockImplementation(async(name,input)=>{
  if(name==='log.create')return {id:'entry',revision:1,contributors:[{userId:'me',name:'Me',files:input.contribution.fileIds.map((id:string)=>({id}))}]};
  return {items:[],nextCursor:null};
 });
 let count=0;vi.spyOn(URL,'createObjectURL').mockImplementation(()=>`blob:made-${++count}`);vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
});
afterEach(()=>dom.cleanup());

it('keeps the mounted entry draft and raw maker local through re-edit, then uploads the final image once',async()=>{
 const onSaved=vi.fn();await act(async()=>dom.root.render(createElement(LogEditor,{user,onSaved,cancel:vi.fn()})));
 const title=dom.container.querySelector<HTMLInputElement>('[aria-label="Title"]')!,body=dom.container.querySelector<HTMLElement>('.log-editor-body')!;body.scrollTop=77;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(title,'Our square');title.dispatchEvent(new Event('input',{bubbles:true}));});
 await made();expect(mock.upload).not.toHaveBeenCalled();expect(button('make')).toBeUndefined();expect(button('remake')).toBeTruthy();
 await act(async()=>button('remake').click());await act(async()=>button('Use fake image').click());
 expect(mock.upload).not.toHaveBeenCalled();expect(title.isConnected).toBe(true);expect(title.value).toBe('Our square');expect(body.scrollTop).toBe(77);expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:made-1');
 await act(async()=>button('set cover').click());await save();
 expect(mock.upload).toHaveBeenCalledExactlyOnceWith(expect.any(File),'log_media');expect(mock.upload.mock.calls[0][0]).toBeInstanceOf(File);
 const create=mock.operation.mock.calls.find(call=>call[0]==='log.create');expect(create?.[1].contribution.fileIds).toEqual(['saved-image']);expect(create?.[1].entry.coverFileId).toBe('saved-image');expect(JSON.stringify(create?.[1])).not.toContain('made:');expect(onSaved).toHaveBeenCalledOnce();
});

it('retains an uploaded result after a failed save and reuses it on retry',async()=>{
 const onSaved=vi.fn();let creates=0;mock.operation.mockImplementation(async(name,input)=>{if(name==='log.create'){if(++creates===1)throw Error('Save interrupted');return {id:'entry',revision:1,contributors:[{userId:'me',files:input.contribution.fileIds.map((id:string)=>({id}))}]};}return {items:[],nextCursor:null};});
 await act(async()=>dom.root.render(createElement(LogEditor,{user,onSaved,cancel:vi.fn()})));await made();await save();expect(mock.upload).toHaveBeenCalledOnce();expect(dom.container.textContent).toContain('Save interrupted');expect(button('remake')).toBeTruthy();
 await save();expect(mock.upload).toHaveBeenCalledOnce();expect(creates).toBe(2);expect(onSaved).toHaveBeenCalledOnce();
});

it('discards a staged upload on dismissal after a failed save',async()=>{
 mock.operation.mockImplementation(async(name)=>{if(name==='log.create')throw Error('Save interrupted');return {items:[],nextCursor:null};});
 await act(async()=>dom.root.render(createElement(LogEditor,{user,onSaved:vi.fn(),cancel:vi.fn()})));await made();await save();await act(async()=>dom.root.render(null));
 expect(mock.operation).toHaveBeenCalledWith('files.discard',{fileId:'saved-image'});expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:made-1');
});
