// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {StoragePanel} from '../src/StoragePanel';
import {setupDOM} from './dom';
const mocks=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:mocks.operation}));
let dom:ReturnType<typeof setupDOM>;
const file={id:'photo',name:'Photo.webp',mime:'image/webp',bytes:123,ready:true,attached:true,attachments:[{label:'Walk',url:'/log/hangout',destination:{view:'log',resourceId:'hangout'}}]};
const page={usedBytes:123,limitBytes:1000,items:[file],nextCursor:null};
beforeEach(()=>{dom=setupDOM();mocks.operation.mockReset().mockResolvedValue(page);});afterEach(()=>dom.cleanup());
it('opens the attachment location separately from the raw file and deletion controls',async()=>{
 const navigate=vi.fn();await act(async()=>dom.root.render(createElement(StoragePanel,{navigate})));
 expect(dom.container.querySelector<HTMLAnchorElement>('.storage-file>a')!.getAttribute('href')).toBe('/api/files/photo');
 const location=dom.container.querySelector<HTMLAnchorElement>('.storage-attachments a')!;await act(async()=>location.click());expect(navigate).toHaveBeenCalledWith({view:'log',resourceId:'hangout'});expect(mocks.operation).toHaveBeenCalledTimes(1);
 navigate.mockClear();await act(async()=>location.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true})));expect(navigate).not.toHaveBeenCalled();
});
it('requests each selected file type and rejects stale pages from the prior filter',async()=>{
 let finish!:(value:unknown)=>void;mocks.operation.mockImplementation((_name,input)=>input.type==='all'?new Promise(resolve=>{finish=resolve;}):Promise.resolve({...page,items:[]}));
 await act(async()=>dom.root.render(createElement(StoragePanel,{navigate:vi.fn()})));
 await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('[aria-label="File types"] button')].find(button=>button.textContent==='Audio')!.click());
 await act(async()=>finish(page));expect(mocks.operation).toHaveBeenLastCalledWith('storage.list',{type:'audio',attachedTo:'all'});expect(dom.container.querySelector('.storage-list')?.children).toHaveLength(0);expect(dom.container.textContent).toContain('No matching files.');
});

it('combines location and media filters',async()=>{
 await act(async()=>dom.root.render(createElement(StoragePanel,{navigate:vi.fn()})));
 await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('[aria-label="Attachment locations"] button')].find(button=>button.textContent==='Hangouts')!.click());
 expect(mocks.operation).toHaveBeenLastCalledWith('storage.list',{type:'all',attachedTo:'hangouts'});
 await act(async()=>[...dom.container.querySelectorAll<HTMLButtonElement>('[aria-label="File types"] button')].find(button=>button.textContent==='Audio')!.click());
 expect(mocks.operation).toHaveBeenLastCalledWith('storage.list',{type:'audio',attachedTo:'hangouts'});
});

it('opens a single location directly and expands a chooser for multiple attachments',async()=>{
 const navigate=vi.fn();mocks.operation.mockResolvedValue({...page,items:[{...file,attachments:[...file.attachments,{label:'Post: a walk',url:'/posts/post',destination:{view:'post',resourceId:'post'}}]}]});
 await act(async()=>dom.root.render(createElement(StoragePanel,{navigate})));
 expect(dom.container.querySelector('.storage-attachments a')).toBeNull();
 const chooser=dom.container.querySelector<HTMLButtonElement>('.storage-attachments>button')!;expect(chooser.textContent).toBe('2 attachments');
 await act(async()=>chooser.click());expect(chooser.getAttribute('aria-expanded')).toBe('true');expect(dom.container.querySelectorAll('.storage-places a')).toHaveLength(2);
 await act(async()=>dom.container.querySelectorAll<HTMLAnchorElement>('.storage-places a')[1].click());expect(navigate).toHaveBeenCalledExactlyOnceWith({view:'post',resourceId:'post'});
 await act(async()=>chooser.click());expect(dom.container.querySelector('.storage-places')).toBeNull();
});

it('keeps the quota and both filters visible while only the file results wait',async()=>{
 let finish!:(value:unknown)=>void;mocks.operation.mockImplementation((_name,input)=>input.type==='all'?Promise.resolve(page):new Promise(resolve=>{finish=resolve;}));
 await act(async()=>dom.root.render(createElement(StoragePanel,{navigate:vi.fn()})));
 const summary=dom.container.querySelector('.storage-summary')!,filters=dom.container.querySelector('.storage-filters')!,list=dom.container.querySelector('.storage-list');
 await act(async()=>[...filters.querySelectorAll<HTMLButtonElement>('[aria-label="File types"] button')].find(button=>button.textContent==='Audio')!.click());
 expect(dom.container.querySelector('.storage-summary')).toBe(summary);expect(dom.container.querySelector('.storage-filters')).toBe(filters);expect(dom.container.querySelector<HTMLProgressElement>('progress')!.value).toBe(123);
 expect(dom.container.querySelector('.storage-list')).toBe(list);expect(list?.parentElement?.style.visibility).toBe('hidden');expect(dom.container.querySelector('[aria-label="Loading files"]')).not.toBeNull();
 expect(summary.compareDocumentPosition(filters)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
 await act(async()=>finish({...page,items:[]}));expect(dom.container.querySelector('[aria-label="Loading files"]')).toBeNull();expect(dom.container.querySelector('.storage-results [inert]')).toBeNull();expect(summary.textContent).toContain('1 KB');
});
