// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {AgentMemoryPanel} from '../src/AgentMemoryPanel';
import {setupDOM} from './dom';
const mocks=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:mocks.operation}));
let dom:ReturnType<typeof setupDOM>;
const pressure={coreUsed:100,coreLimit:4000,coreRemaining:3900,coreSlots:1,coreSlotLimit:32,noncoreUsed:0,noncoreLimit:32000,slots:1,slotLimit:128,utilization:.025,status:'comfortable',estimator:'utf8-third-v1'};
const note={key:'voice',title:'Voice',content:'Keep it short',core:true,sources:[{kind:'chat',id:'message',date:'2026-09-27'}],revision:1,estimatedTokens:100,updatedAt:'2026-09-27'};
beforeEach(()=>{dom=setupDOM();mocks.operation.mockReset().mockImplementation(async(name)=>name==='agent.instructions.get'?{text:'Be direct',revision:1}:name==='agent.memory.list'?{items:[note],pressure,nextCursor:null}:name==='agent.memory.get'?{slot:note,pressure}:{saved:false,pressure,reason:'Core memory is full. Shorten a note.'});});afterEach(()=>dom.cleanup());
it('keeps the note editor open when a memory save is rejected for pressure',async()=>{
 await act(async()=>dom.root.render(createElement(AgentMemoryPanel)));
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('.agent-memory-list button')!.click());
 expect(dom.container.querySelector('textarea')?.value).toBe('Keep it short');
 expect(dom.container.querySelector<HTMLInputElement>('input[type=checkbox]')?.closest('label')?.classList.contains('check-label')).toBe(true);
 expect(dom.container.querySelector('.memory-source-chips')?.textContent).toContain('2026-09-27');
 await act(async()=>dom.container.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(mocks.operation).toHaveBeenCalledWith('agent.memory.save',expect.objectContaining({key:'voice',revision:1,core:true}));
 expect(dom.container.querySelector('textarea')?.value).toBe('Keep it short');expect(dom.container.querySelector('[role=alert]')?.textContent).toContain('Core memory is full');
});
it('keeps guidance and agent memory as separate screens',async()=>{
 await act(async()=>dom.root.render(createElement(AgentMemoryPanel,{section:'instructions'})));
 expect(dom.container.querySelector('textarea[aria-label="Guidance"]')).not.toBeNull();expect(dom.container.textContent).not.toContain('Guidance');expect(dom.container.textContent).not.toContain('Add memory');
 expect(mocks.operation).toHaveBeenCalledWith('agent.instructions.get');expect(mocks.operation).not.toHaveBeenCalledWith('agent.memory.list',expect.anything());
});
