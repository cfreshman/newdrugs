// @vitest-environment jsdom
import {act,createElement,useState} from 'react';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {CallProvider,CallStatusControl,useCall} from '../src/CallProvider';
import type {CallRecord} from '../shared/calling';
import {setupDOM} from './dom';

const requests=vi.hoisted(()=>({api:vi.fn(),post:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),api:requests.api,post:requests.post}));
vi.mock('../src/CallStage',()=>({CallStage:()=>createElement('div',{'data-call-stage':''},'Video stage')}));
let dom:ReturnType<typeof setupDOM>;
const waiting:CallRecord={id:'call-1',connectionId:'connection-1',callerId:'me',calleeId:'friend',status:'waiting',createdAt:'2026-10-01T00:00:00Z'};
let current:CallRecord|null;
function Controls(){const state=useCall(),[showDm,setShowDm]=useState(true);return createElement('div',null,
 showDm&&createElement('button',{onClick:()=>void state?.start('connection-1','@friend')},'Video call'),
 state?.call?.status==='waiting'&&state.call.calleeId===state.userId&&createElement('button',{onClick:()=>void state.answer(state.call!)},'Answer'),
 createElement('button',{onClick:()=>setShowDm(false)},'Leave DM'),
 createElement(CallStatusControl,{fallback:createElement('span',null,'Settings')}));}
beforeEach(()=>{dom=setupDOM();current=null;requests.api.mockReset().mockImplementation(async()=>({call:current,otherName:'@friend'}));requests.post.mockReset().mockImplementation(async(path:string)=>path==='/calls/connection-1'?(current=waiting,{call:waiting}):{url:'wss://media.invalid',token:'token',call:current});});
afterEach(()=>dom.cleanup());
it('keeps a started call in the app shell and opens video only after the other person answers',async()=>{
 await act(async()=>dom.root.render(createElement(CallProvider,{userId:'me',children:createElement(Controls)})));
 await act(async()=>[...dom.container.querySelectorAll('button')].find(button=>button.textContent==='Video call')!.click());
 expect(dom.container.querySelector('[data-call-stage]')).toBeNull();
 expect(dom.container.querySelector('.call-status-name')?.textContent).toBe('@friend');
 expect(dom.container.querySelector('.call-status-kind')?.textContent).toBe('Video call');
 await act(async()=>[...dom.container.querySelectorAll('button')].find(button=>button.textContent==='Leave DM')!.click());
 expect([...dom.container.querySelectorAll('button')].some(button=>button.textContent==='Video call')).toBe(false);
 expect(dom.container.querySelector('.call-status-name')?.textContent).toBe('@friend');
 current={...waiting,status:'connected',joinedAt:'2026-10-01T00:00:05Z'};
 await act(async()=>{window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:['calls']}));await new Promise(resolve=>setTimeout(resolve,100));});
 expect(dom.container.querySelector('[data-call-stage]')).not.toBeNull();
});
it('leaves Talk before answering or entering a connected video call',async()=>{
 const steps:string[]=[],original=requests.post.getMockImplementation()!;
 requests.post.mockImplementation(async(path:string)=>{if(path.endsWith('/join')){steps.push('join video');current={...waiting,callerId:'friend',calleeId:'me',status:'connected'};return {call:current};}if(path.endsWith('/token'))steps.push('video token');return original(path);});
 const beforeEnter=vi.fn(async()=>{steps.push('leave Talk');});
 current={...waiting,callerId:'friend',calleeId:'me'};
 await act(async()=>dom.root.render(createElement(CallProvider,{userId:'me',beforeEnter,children:createElement(Controls)})));
 await act(async()=>[...dom.container.querySelectorAll('button')].find(button=>button.textContent==='Answer')!.click());
 expect(steps).toEqual(['leave Talk','join video','video token']);
 expect(dom.container.querySelector('[data-call-stage]')).not.toBeNull();
});
