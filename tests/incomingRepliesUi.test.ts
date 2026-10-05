// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {ProfilePosts} from '../src/PostPanels';
import {setupDOM} from './dom';
const transport=vi.hoisted(()=>({operation:vi.fn()}));vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:transport.operation}));
const user={id:'me',handle:'me',name:'Me',city:'',bio:'',interests:[],discoverable:true};let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();transport.operation.mockReset();transport.operation.mockResolvedValue({items:[],nextCursor:null});});afterEach(()=>dom.cleanup());
it('provides incoming replies only on the current user profile and uses the shared utility',async()=>{
 await act(async()=>dom.root.render(createElement(ProfilePosts,{personId:'me',user,navigate(){}})));
 const button=[...dom.container.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Incoming')!;expect(button).toBeDefined();await act(async()=>button.click());
 expect(transport.operation).toHaveBeenLastCalledWith('posts.incoming_replies',{});expect(dom.container.textContent).toContain('No replies to you yet.');
 await act(async()=>dom.root.render(createElement(ProfilePosts,{key:'other',personId:'other',user,navigate(){}})));expect(dom.container.textContent).not.toContain('Incoming');
});
