// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {setupDOM} from './dom';
import {TransientError} from '../src/TransientError';

let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();vi.useFakeTimers();});
afterEach(()=>{dom.cleanup();vi.useRealTimers();});
it('dismisses an error and shows changed error text for a fresh interval',()=>{
 act(()=>dom.root.render(createElement(TransientError,{className:'error',role:'alert'},'First error')));
 expect(dom.container.querySelector('.error')?.hasAttribute('hidden')).toBe(false);
 act(()=>vi.advanceTimersByTime(6000));
 expect(dom.container.querySelector('.error')?.hasAttribute('hidden')).toBe(true);
 act(()=>dom.root.render(createElement(TransientError,{className:'error',role:'alert'},'Second error')));
 expect(dom.container.querySelector('.error')?.textContent).toBe('Second error');
 expect(dom.container.querySelector('.error')?.hasAttribute('hidden')).toBe(false);
});
