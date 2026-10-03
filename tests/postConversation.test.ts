// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {PostPanel,type Post} from '../src/PostPanels';
import {setupDOM} from './dom';

const api=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:api.operation}));
const user={id:'me',handle:'me',name:'Me',city:'',bio:'',interests:[],discoverable:true};
const post=(id:string,parentId?:string):Post=>({id,userId:'friend',text:id,createdAt:'2026-10-03T12:00:00.000Z',city:'',likeCount:0,liked:false,replyCount:0,author:{name:'Friend',handle:'friend'},...(parentId?{parentId}:{})});
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();api.operation.mockReset();});afterEach(()=>dom.cleanup());

it('shows the parent chain above a selected reply while leaving its other replies below',async()=>{
 const root=post('root'),parent=post('parent','root'),selected=post('selected','parent'),other=post('other','selected');
 api.operation.mockImplementation(async(name)=>name==='posts.get'?selected:name==='posts.ancestors'?{items:[root,parent],earlierId:null,unavailable:false}:name==='posts.replies'?{items:[other],nextCursor:null}:null);
 await act(async()=>dom.root.render(createElement(PostPanel,{postId:selected.id,user,navigate:vi.fn()})));
 expect([...dom.container.querySelectorAll('.post-card')].map(card=>card.getAttribute('data-post-id'))).toEqual(['root','parent','selected','other']);
 expect(dom.container.querySelector('.post-ancestor-chain')?.getAttribute('aria-label')).toBe('Earlier in this conversation');
 expect(dom.container.querySelector('[data-post-id="selected"] .reply-context')).toBeNull();
 expect(api.operation).toHaveBeenCalledWith('posts.ancestors',{postId:'selected'});
});
