// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {PostList,type Post} from '../src/PostPanels';
import {DeleteConfirmation} from '../src/DeleteConfirmation';
import {setupDOM} from './dom';
const transport=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:transport.operation}));
const user={id:'me',handle:'me',name:'Me',city:'',bio:'',interests:[],discoverable:true};
const post:Post={id:'post',userId:'me',text:'My post',createdAt:new Date().toISOString(),city:'',likeCount:0,liked:false,replyCount:0,author:{name:'Me',handle:'me'}};
let dom:ReturnType<typeof setupDOM>;const navigate=vi.fn(),deleted=vi.fn();
beforeEach(()=>{dom=setupDOM();navigate.mockClear();deleted.mockClear();transport.operation.mockReset();transport.operation.mockResolvedValue({ok:true});});afterEach(()=>dom.cleanup());
it('keeps review clicks in the post and cancels without deleting or navigating',async()=>{
 await act(async()=>dom.root.render(createElement(PostList,{posts:[post],user,navigate,changed(){},deleted})));
 const trigger=dom.container.querySelector<HTMLButtonElement>('.delete-post')!;
 await act(async()=>{trigger.focus();trigger.click();});
 expect(transport.operation).not.toHaveBeenCalled();
 const review=dom.container.querySelector<HTMLElement>('.delete-confirmation')!;
 expect(review.textContent).toContain('Delete this post?');expect(document.activeElement?.textContent).toBe('Cancel');
 act(()=>review.querySelector('strong')!.click());expect(navigate).not.toHaveBeenCalled();
 act(()=>review.querySelector('button')!.click());expect(dom.container.querySelector('.delete-confirmation')).toBeNull();expect(transport.operation).not.toHaveBeenCalled();expect(document.activeElement).toBe(trigger);
});
it('deletes only the reviewed post once and disables both controls while pending',async()=>{
 let resolve!:(value:unknown)=>void;transport.operation.mockReturnValue(new Promise(done=>{resolve=done;}));
 await act(async()=>dom.root.render(createElement(PostList,{posts:[post],user,navigate,changed(){},deleted})));
 act(()=>dom.container.querySelector<HTMLButtonElement>('.delete-post')!.click());
 const confirm=dom.container.querySelector<HTMLButtonElement>('.delete-confirmation-submit')!;
 act(()=>{confirm.click();confirm.click();});
 expect(transport.operation).toHaveBeenCalledTimes(1);expect(transport.operation).toHaveBeenCalledWith('posts.delete',{postId:'post'},{confirmed:true,key:expect.any(String)});
 expect([...dom.container.querySelectorAll<HTMLButtonElement>('.delete-confirmation button')].every(button=>button.disabled)).toBe(true);
 expect(confirm.textContent).toBe('Deleting…');expect(navigate).not.toHaveBeenCalled();
 await act(async()=>resolve({ok:true}));expect(deleted).toHaveBeenCalledWith('post');expect(dom.container.querySelector('.delete-confirmation')).toBeNull();
});
it('Escape cancels the inline review without reaching the surrounding panel',async()=>{
 const cancel=vi.fn(),outer=vi.fn(),confirm=vi.fn();
 await act(async()=>dom.root.render(createElement('div',{onKeyDown:outer},createElement(DeleteConfirmation,{title:'Delete file?',onCancel:cancel,onConfirm:confirm}))));
 act(()=>document.activeElement!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
 expect(cancel).toHaveBeenCalledOnce();expect(outer).not.toHaveBeenCalled();expect(confirm).not.toHaveBeenCalled();
});
