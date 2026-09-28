// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {PostList,type Post} from '../src/PostPanels';
import {destinationPath} from '../shared/navigation';
import {setupDOM} from './dom';
const transport=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:transport.operation}));
const user={id:'me',handle:'me',name:'Me',city:'',bio:'',interests:[],discoverable:true};
const post:Post={id:'post',userId:'friend',text:'A post',createdAt:'2026-09-28T12:00:00.000Z',city:'',likeCount:0,liked:false,replyCount:0,author:{name:'Friend',handle:'friend'}};
let dom:ReturnType<typeof setupDOM>;
const render=(value:Post=post)=>act(async()=>dom.root.render(createElement(PostList,{posts:[value],user,navigate:vi.fn(),changed(){},deleted(){}})));
beforeEach(()=>{dom=setupDOM();transport.operation.mockReset();});
afterEach(()=>{vi.useRealTimers();dom.cleanup();});

it('places Share immediately after Save and opens the native share sheet when available',async()=>{
 const share=vi.fn().mockResolvedValue(undefined),copy=vi.fn();vi.stubGlobal('navigator',{share,clipboard:{writeText:copy}});
 await render();const actions=[...dom.container.querySelectorAll<HTMLButtonElement>('.post-actions>button')],save=actions.findIndex(button=>button.getAttribute('aria-label')==='Save post'),shareButton=actions.findIndex(button=>button.getAttribute('aria-label')==='Share post');
 expect(shareButton).toBe(save+1);await act(async()=>actions[shareButton].click());
 expect(share).toHaveBeenCalledWith({title:'New Drugs post',url:new URL(destinationPath({view:'post',resourceId:post.id}),location.origin).href});expect(copy).not.toHaveBeenCalled();expect(actions[shareButton].getAttribute('aria-label')).toBe('Share post');
});

it('copies a reply link when native sharing is unavailable and briefly shows a check state',async()=>{
 vi.useFakeTimers();const copy=vi.fn().mockResolvedValue(undefined);vi.stubGlobal('navigator',{clipboard:{writeText:copy}});const reply={...post,id:'reply',parentId:'post'};
 await render(reply);const button=dom.container.querySelector<HTMLButtonElement>('[aria-label="Share reply"]')!;await act(async()=>button.click());
 expect(copy).toHaveBeenCalledWith(new URL(destinationPath({view:'post',resourceId:reply.id}),location.origin).href);expect(button.getAttribute('aria-label')).toBe('Link copied');
 act(()=>vi.advanceTimersByTime(1500));expect(button.getAttribute('aria-label')).toBe('Share reply');
});
