// @vitest-environment jsdom
import {act,createElement,createRef} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {ArtifactExperience} from '../src/ArtifactExperience';
import type {ArtifactDetail,PublicArtifactDetail} from '../shared/artifacts';
import {setupDOM,rect} from './dom';
const transport=vi.hoisted(()=>({api:vi.fn(),operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),...transport}));
vi.mock('../src/ArtifactFrame',()=>({ArtifactFrame:()=>null}));
const id='8ad51b32-4b71-4775-b992-4d5ac37d1825',now='2026-10-22T00:00:00.000Z';
const publicDoc:PublicArtifactDetail={id,title:'Graph',bodyHtml:'<p>Graph</p>',data:{},assets:[],revision:1,contentRevision:1,updatedAt:now,contentUpdatedAt:now};
const owner:ArtifactDetail={...publicDoc,assets:[],ephemeral:false,hasRefreshInstruction:true,refreshInstruction:'Original instructions',createdAt:now,dataUpdatedAt:now,producer:{kind:'hosted',name:'Agent'}};
let dom:ReturnType<typeof setupDOM>|undefined;
afterEach(()=>{dom?.cleanup();dom=undefined;});
it('keeps the instruction editor and human draft mounted while newer owner metadata loads',async()=>{
 dom=setupDOM();Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value(){this.setAttribute('open','');}});Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value(){this.removeAttribute('open');}});
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue(rect(0,0,390,844));
 transport.api.mockResolvedValue(publicDoc);transport.operation.mockResolvedValue(owner);
 await act(async()=>dom!.root.render(createElement(ArtifactExperience,{accountId:'owner',opened:{id},visible:true,scrollRef:createRef<HTMLDivElement>(),refreshDisabled:false,open:vi.fn(),close:vi.fn(),refresh:vi.fn(),discuss:vi.fn(),children:null})));
 const edit=[...dom.container.querySelectorAll('button')].find(button=>button.textContent==='Refresh instructions')!;
 await act(async()=>edit.click());const field=dom.container.querySelector<HTMLTextAreaElement>('.artifact-editor textarea')!;expect(field).toBeTruthy();
 act(()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(field,'Keep this human draft');field.dispatchEvent(new Event('input',{bubbles:true}));});
 let complete!:(value:ArtifactDetail)=>void;transport.operation.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
 await act(async()=>window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:{keys:['artifacts'],artifacts:[{id}]}})));
 expect(dom.container.querySelector('.artifact-editor textarea')).toBe(field);expect(field.value).toBe('Keep this human draft');
 await act(async()=>complete({...owner,revision:2,title:'Changed elsewhere'}));
 expect(dom.container.querySelector('.artifact-editor textarea')).toBe(field);expect(field.value).toBe('Keep this human draft');
});
