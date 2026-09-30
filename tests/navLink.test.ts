// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {NavLink} from '../src/NavLink';
import {setupDOM} from './dom';

let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();});
afterEach(()=>dom.cleanup());

it('keeps ordinary navigation in-app while leaving native new-tab gestures alone',async()=>{
 const navigate=vi.fn(),destination={view:'post' as const,resourceId:'post'};
 await act(async()=>dom.root.render(createElement(NavLink,{to:destination,navigate,className:'post-action'},'Open post')));
 const link=dom.container.querySelector<HTMLAnchorElement>('a')!;expect(link.getAttribute('href')).toBe('/posts/post');expect(link.className).toBe('post-action');
 const ordinary=new MouseEvent('click',{bubbles:true,cancelable:true,button:0});link.dispatchEvent(ordinary);expect(ordinary.defaultPrevented).toBe(true);expect(navigate).toHaveBeenCalledWith(destination);
 navigate.mockClear();const modified=new MouseEvent('click',{bubbles:true,cancelable:true,button:0,metaKey:true});link.dispatchEvent(modified);expect(modified.defaultPrevented).toBe(false);expect(navigate).not.toHaveBeenCalled();
 const middle=new MouseEvent('click',{bubbles:true,cancelable:true,button:1});link.dispatchEvent(middle);expect(middle.defaultPrevented).toBe(false);expect(navigate).not.toHaveBeenCalled();
});
