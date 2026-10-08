// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {AgentModel} from '../admin/AgentModel';
import {setupDOM} from './dom';
const api=vi.hoisted(()=>({adminRequest:vi.fn()}));vi.mock('../admin/api',()=>api);
let dom:ReturnType<typeof setupDOM>;
const settings={model:'~anthropic/claude-haiku-latest',revision:3,keyConfigured:true};
beforeEach(()=>{dom=setupDOM();api.adminRequest.mockReset();api.adminRequest.mockResolvedValue(settings);});afterEach(()=>dom.cleanup());
it('accepts a model ID string and submits it for server validation against the displayed revision',async()=>{
 await act(async()=>dom.root.render(createElement(AgentModel)));const input=dom.container.querySelector('input')!;expect(input.value).toBe(settings.model);expect(dom.container.querySelector('select')).toBeNull();expect(dom.container.querySelector('button')?.disabled).toBe(true);
 act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,' provider/new-compatible-model ');input.dispatchEvent(new Event('input',{bubbles:true}));});api.adminRequest.mockResolvedValueOnce({model:'provider/new-compatible-model',revision:4});
 await act(async()=>dom.container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(api.adminRequest).toHaveBeenLastCalledWith('/agent-model',{model:'provider/new-compatible-model',revision:3});expect(input.value).toBe('provider/new-compatible-model');expect(dom.container.textContent).toContain('Saved.');expect(dom.container.querySelector('button')?.disabled).toBe(true);
});
it('keeps unavailable keys or models disabled and surfaces stale-save failures',async()=>{
 api.adminRequest.mockResolvedValueOnce({...settings,keyConfigured:false});await act(async()=>dom.root.render(createElement(AgentModel)));expect(dom.container.textContent).toContain('key is not configured');expect(dom.container.querySelector('button')?.disabled).toBe(true);
 await act(async()=>dom.root.render(createElement(AgentModel,{key:'next'})));const input=dom.container.querySelector('input')!;act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'provider/invalid-model');input.dispatchEvent(new Event('input',{bubbles:true}));});api.adminRequest.mockRejectedValueOnce(Error('Enter an OpenRouter model that supports text, images and tool calls.'));
 await act(async()=>dom.container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(dom.container.querySelector('[role=alert]')?.textContent).toContain('supports text, images and tool calls');expect(input.value).toBe('provider/invalid-model');
});
