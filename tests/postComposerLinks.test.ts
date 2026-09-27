import {NavigationContext} from '../src/NavigationContext';
// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {PostComposer} from '../src/PostPanels';
import {LinkPreviews} from '../src/LinkPreview';
import {PanelVisibilityContext} from '../src/PanelReadiness';
import {setupDOM} from './dom';
const transport=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:transport.operation}));
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();transport.operation.mockReset().mockResolvedValue({id:'post',text:'',links:['https://freshman.dev/']});});afterEach(()=>dom.cleanup());
it('adds a URL beside photos and publishes a link-only post without consuming caption characters',async()=>{
 const submitted=vi.fn();await act(async()=>dom.root.render(createElement(PostComposer,{user:{id:'me',handle:'me',name:'Me',bio:'',city:'',interests:[],discoverable:false},navigate:vi.fn(),submitted})));
 expect(dom.container.querySelector('.composer-author')?.textContent).toContain('@me');
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('[aria-label="Add URL"]')!.click());
 const input=dom.container.querySelector<HTMLInputElement>('input[inputmode="url"]')!;
 act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'freshman.dev');input.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>dom.container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(transport.operation).toHaveBeenCalledWith('posts.create',{text:'',fileIds:[],links:['https://freshman.dev/']},expect.objectContaining({confirmed:true}));expect(submitted).toHaveBeenCalled();expect(dom.container.querySelector('input[inputmode="url"]')).toBeNull();
});
it('keeps recognized players dormant when their tab is hidden and avoids duplicate attachments',async()=>{
 const url='https://open.spotify.com/track/0Lr4kGOYn9l83EjuK6cZFQ';
 const render=(visible:boolean)=>act(async()=>dom.root.render(createElement(PanelVisibilityContext.Provider,{value:visible},createElement(LinkPreviews,{text:url,links:[url]}))));
 await render(true);expect(dom.container.querySelectorAll('iframe')).toHaveLength(1);expect(dom.container.querySelector('iframe')?.getAttribute('src')).toBe('https://open.spotify.com/embed/track/0Lr4kGOYn9l83EjuK6cZFQ');
 await render(false);expect(dom.container.querySelector('iframe')).toBeNull();expect(dom.container.querySelector('.provider-embed')).not.toBeNull();
});

it('does not expose raw MUSE or CIF links before their manifests load',async()=>{
 transport.operation.mockImplementation(()=>new Promise(()=>{}));
 const urls=['https://example.com/source.muse','https://example.com/source.cif'];
 await act(async()=>dom.root.render(createElement(LinkPreviews,{text:'',links:urls})));
 expect(dom.container.querySelector('.muse-pending')).not.toBeNull();expect(dom.container.querySelector('.cif-pending')).not.toBeNull();
 for(const url of urls)expect(dom.container.querySelector(`a[href="${url}"]`)).toBeNull();
});


it('adds links with an explicit Add action, clears the field, deduplicates and removes their cards',async()=>{
 await act(async()=>dom.root.render(createElement(PostComposer,{user:{id:'me',handle:'me',name:'Me',bio:'',city:'',interests:[],discoverable:false},navigate:vi.fn(),submitted:vi.fn()})));
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('[aria-label="Add URL"]')!.click());const input=dom.container.querySelector<HTMLInputElement>('input[inputmode="url"]')!;
 const type=(text:string)=>act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));});
 type('freshman.dev');await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));expect(input.value).toBe('');expect(dom.container.querySelectorAll('.log-link-card')).toHaveLength(1);expect(transport.operation.mock.calls.some(call=>call[0]==='posts.create')).toBe(false);
 type('https://freshman.dev/');await act(async()=>dom.container.querySelector<HTMLButtonElement>('.log-link-add button')!.click());expect(dom.container.querySelectorAll('.log-link-card')).toHaveLength(1);
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('.log-link-card-actions button')!.click());expect(dom.container.querySelectorAll('.log-link-card')).toHaveLength(0);
});
it('renders native invite previews as cards and opens their exact route inside the app',async()=>{
 const code='b'.repeat(32),url=`https://dev.druggie.org/log/join/${code}`,navigate=vi.fn();transport.operation.mockResolvedValue({url,hostname:'dev.druggie.org',title:'A shared hangout',description:'Made in New England',imageUrl:`/api/share-images/log-invite/${code}`});
 await act(async()=>dom.root.render(createElement(NavigationContext.Provider,{value:navigate},createElement(LinkPreviews,{text:url,links:[url]}))));
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
 const card=dom.container.querySelector<HTMLAnchorElement>('.website-card')!;expect(card).not.toBeNull();expect(dom.container.querySelectorAll('.website-card')).toHaveLength(1);expect(card.textContent).toContain('A shared hangout');expect(card.querySelector('img')?.getAttribute('src')).toContain('/api/share-images/log-invite/');expect(card.hasAttribute('target')).toBe(false);
 const click=new MouseEvent('click',{bubbles:true,cancelable:true});await act(async()=>card.dispatchEvent(click));expect(click.defaultPrevented).toBe(true);expect(navigate).toHaveBeenCalledWith({view:'log_join',resourceId:code});
});
