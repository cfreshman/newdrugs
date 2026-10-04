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
beforeEach(()=>{dom=setupDOM();api.operation.mockReset();});afterEach(()=>{vi.restoreAllMocks();dom.cleanup();});

it('shows the parent chain above a selected reply while leaving its other replies below',async()=>{
 const root=post('root'),parent=post('parent','root'),selected={...post('selected','parent'),parent:{id:'parent',text:'parent',deleted:false,author:{name:'Friend',handle:'friend'}}},other=post('other','selected');
 api.operation.mockImplementation(async(name)=>name==='posts.get'?selected:name==='posts.ancestors'?{items:[root,parent],earlierId:null,unavailable:false}:name==='posts.replies'?{items:[other],nextCursor:null}:null);
 const rect=(top:number)=>({top,left:0,right:500,bottom:top+100,width:500,height:100,x:0,y:top,toJSON(){}});
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return rect(this.classList.contains('post-current')?420-(dom.container.querySelector<HTMLElement>('.composer-view')?.scrollTop||0):this.classList.contains('composer-view')?80:0);});
 const navigate=vi.fn(),view=createElement('div',{className:'composer-view',ref:(node:HTMLElement|null)=>{if(!node||node.dataset.mockScroll)return;node.dataset.mockScroll='true';let offset=0;Object.defineProperties(node,{clientHeight:{value:500},scrollHeight:{get:()=>600+(parseFloat(node.querySelector<HTMLElement>('.post-scroll-clearance')?.style.height||'0')||0)},scrollTop:{get:()=>offset,set:(value:number)=>{offset=Math.max(0,Math.min(value,node.scrollHeight-node.clientHeight));}}});}},createElement(PostPanel,{postId:selected.id,user,navigate}));
 await act(async()=>dom.root.render(view));
 expect([...dom.container.querySelectorAll('.post-card')].map(card=>card.getAttribute('data-post-id'))).toEqual(['root','parent','selected','other']);
 expect(dom.container.querySelector('.post-ancestor-chain')?.getAttribute('aria-label')).toBe('Earlier in this conversation');
 expect(dom.container.querySelector('[data-post-id="selected"] .reply-context')?.textContent).toContain('Reply to @friend');
 await act(async()=>dom.container.querySelector<HTMLElement>('[data-post-id="selected"] .reply-context')!.click());expect(navigate).not.toHaveBeenCalled();
 expect(api.operation).toHaveBeenCalledWith('posts.ancestors',{postId:'selected'});
 const scroller=dom.container.querySelector<HTMLElement>('.composer-view')!;expect(scroller.scrollTop).toBe(340);
 expect(parseFloat(dom.container.querySelector<HTMLElement>('.post-scroll-clearance')!.style.height)).toBe(240);
 scroller.scrollTop=0;act(()=>window.dispatchEvent(new Event('pageshow')));dom.frame();expect(scroller.scrollTop).toBe(340);
 act(()=>scroller.dispatchEvent(new WheelEvent('wheel')));scroller.scrollTop=25;dom.frame();await act(async()=>dom.root.render(view));expect(scroller.scrollTop).toBe(25);
});

it('opens each deeper reply at the top of the Agent scrollport and holds it there as ancestors grow',async()=>{
 const root=post('root'),second=post('second','root'),third=post('third','second');
 api.operation.mockImplementation(async(name,data:{postId:string})=>name==='posts.get'?({root,second,third} as Record<string,Post>)[data.postId]:name==='posts.ancestors'?{items:data.postId==='second'?[root]:[root,second],earlierId:null,unavailable:false}:name==='posts.replies'?{items:[],nextCursor:null}:null);
 let ancestorHeight=220;
 const rect=(top:number)=>({top,left:0,right:500,bottom:top+100,width:500,height:100,x:0,y:top,toJSON(){}});
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){
  const scroller=dom.container.querySelector<HTMLElement>('.composer-surface-content'),count=dom.container.querySelectorAll('.post-ancestor-chain .post-card').length;
  return rect(this.classList.contains('post-current')?80+count*ancestorHeight-(scroller?.scrollTop||0):this.classList.contains('composer-surface-content')?80:0);
 });
 const navigate=vi.fn();
 const render=(id:string)=>createElement('div',{className:'composer-view'},createElement('div',{className:'composer-surface-content',ref:(node:HTMLElement|null)=>{
  if(!node||node.dataset.mockScroll)return;node.dataset.mockScroll='true';let offset=0;
  Object.defineProperties(node,{clientHeight:{value:500},scrollHeight:{get:()=>300+node.querySelectorAll('.post-ancestor-chain .post-card').length*ancestorHeight+(parseFloat(node.querySelector<HTMLElement>('.post-scroll-clearance')?.style.height||'0')||0)},scrollTop:{get:()=>offset,set:(value:number)=>{offset=Math.max(0,Math.min(value,node.scrollHeight-node.clientHeight));}}});
 }},createElement(PostPanel,{postId:id,user,navigate})));
 await act(async()=>dom.root.render(render('root')));
 const scroller=dom.container.querySelector<HTMLElement>('.composer-surface-content')!;
 expect(scroller.scrollTop).toBe(0);
 await act(async()=>dom.root.render(render('second')));
 expect(scroller.scrollTop).toBe(220);
 await act(async()=>dom.root.render(render('third')));
 expect(scroller.scrollTop).toBe(440);
 ancestorHeight=400;
 dom.resize(dom.container.querySelector('.post-ancestor-chain')!);dom.frame();
 expect(scroller.scrollTop).toBe(800);
});
