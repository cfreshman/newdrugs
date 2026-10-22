// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {App} from '../src/App';
import type {Bootstrap,RunView} from '../shared/types';
import type {ArtifactDetail} from '../shared/artifacts';
import {rect,setupDOM} from './dom';

const transport=vi.hoisted(()=>({api:vi.fn(),post:vi.fn(),operation:vi.fn(),upload:vi.fn()}));
const viewer=vi.hoisted(()=>({current:null as any,record:null as any}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),...transport}));
vi.mock('../src/uploads',()=>({uploadFile:transport.upload}));
// Exercise App's real route/task handoff independently of iframe rendering.
vi.mock('../src/ArtifactExperience',async()=>{
 const {createElement,Fragment}=await import('react');
 return {
  ArtifactExperience:(props:any)=>{viewer.current=props;return createElement(Fragment,null,props.children,props.opened&&createElement('section',{'data-artifact-view':props.opened.id},createElement('button',{'aria-label':'Close artifact',onClick:props.close},'Close'),createElement('button',{'aria-label':'Refresh artifact',disabled:props.refreshDisabled,onClick:()=>props.refresh(viewer.record)},'Refresh')));},
  ArtifactAttachment:({reference}:{reference:{artifactId:string;title:string}})=>createElement('button',{'aria-label':'Open saved artifact',onClick:()=>viewer.current.open(reference.artifactId)},reference.title),
 };
});

const id='f626adab-6f2b-45f2-9cef-765d25b0203d';
const record:ArtifactDetail={id,title:'A useful graph',revision:7,contentRevision:4,ephemeral:true,bodyHtml:'<p>Private source marker</p>',data:{value:3},refreshInstruction:'Private refresh instruction marker',assets:[],hasRefreshInstruction:true,createdAt:'2026-10-22T00:00:00.000Z',updatedAt:'2026-10-22T01:00:00.000Z',contentUpdatedAt:'2026-10-22T01:00:00.000Z',dataUpdatedAt:'2026-10-22T01:00:00.000Z',producer:{kind:'hosted',name:'Agent'}};
const initial:Bootstrap={user:{id:'user',handle:'test',name:'Me',city:'',bio:'',interests:[],discoverable:false},wallet:{balanceNanos:1e9,reservedNanos:0,availableNanos:1e9,entries:[]},messages:[{id:'artifact-answer',role:'assistant',text:'',source:'app',createdAt:'2026-10-22T00:00:00.000Z',artifacts:[{artifactId:id,title:record.title,presentation:'link',presentedRevision:1}]}],config:{aiEnabled:true,paymentsEnabled:false,development:true,model:'test'}};
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{
 dom=setupDOM();history.replaceState({},'','/');localStorage.clear();sessionStorage.clear();sessionStorage.setItem('nd-client','browser');
 vi.stubGlobal('innerWidth',390);vi.stubGlobal('innerHeight',844);
 vi.stubGlobal('EventSource',class extends EventTarget{close(){}});
 transport.api.mockReset().mockResolvedValue(initial);transport.post.mockReset().mockImplementation(async(path:string)=>path==='/chat'?{run:{id:'task',status:'queued',draft:'',progress:[],approvals:[],clientId:'browser',revision:1}}:{ok:true});
 transport.operation.mockReset().mockImplementation(async(name:string)=>name==='log.preferences'?{arrangement:'calendar',views:[]}:name==='log.birthday_get'?{birthday:null}:{items:[],nextCursor:null,people:[]});
 transport.upload.mockReset().mockResolvedValue({id:'kept-photo',name:'kept-photo.webp',originalName:'Keep this photo',mime:'image/webp',bytes:100,ready:true,url:'/api/files/kept-photo'});
 viewer.current=null;viewer.record=record;
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue(rect(12,350,366,200));
 vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(200);vi.spyOn(HTMLElement.prototype,'scrollHeight','get').mockReturnValue(1000);
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value(){this.setAttribute('open','');}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value(){this.removeAttribute('open');}});
 Object.defineProperty(HTMLElement.prototype,'animate',{configurable:true,value:()=>({finished:Promise.resolve(),cancel(){}})});
});
afterEach(()=>dom.cleanup());
const mount=()=>act(async()=>dom.root.render(createElement(App)));

it('shows a direct artifact before creating a session and starts ordinary bootstrap only after Close',async()=>{
 history.replaceState({},'',`/artifacts/${id}`);await mount();
 expect(dom.container.querySelector('[data-artifact-view]')).not.toBeNull();
 expect(transport.post.mock.calls.some(([path])=>path==='/session')).toBe(false);
 expect(transport.api.mock.calls.some(([path])=>path==='/bootstrap')).toBe(false);
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('[aria-label="Close artifact"]')!.click());
 expect(transport.post).toHaveBeenCalledWith('/session');expect(transport.api).toHaveBeenCalledWith('/bootstrap');
 expect(dom.container.querySelector('[data-artifact-view]')).toBeNull();expect(location.pathname).toBe('/');
});

it('refreshes the exact ID and opened revision while preserving the unsent draft and uploaded attachment',async()=>{
 localStorage.setItem('nd-draft:user','Keep this unsent draft');await mount();dom.frame();
 const picker=dom.container.querySelector<HTMLInputElement>('.launcher-controls input[type="file"]')!;
 Object.defineProperty(picker,'files',{configurable:true,value:[new File(['photo'],'kept-photo.jpg',{type:'image/jpeg'})]});
 await act(async()=>picker.dispatchEvent(new Event('change',{bubbles:true})));
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('[aria-label="Open saved artifact"]')!.click());
 await act(async()=>{const popped=new Promise<void>(resolve=>window.addEventListener('popstate',()=>resolve(),{once:true}));dom.container.querySelector<HTMLButtonElement>('[aria-label="Refresh artifact"]')!.click();await popped;});
 const calls=transport.post.mock.calls.filter(([path])=>path==='/chat');expect(calls).toHaveLength(1);
 expect(calls[0][1]).toMatchObject({fileIds:[],recordRefs:[{kind:'artifact',id,revision:7}],text:expect.stringContaining('saved refresh instructions')});
 expect(JSON.stringify(calls[0][1])).not.toContain('Private refresh instruction marker');expect(JSON.stringify(calls[0][1])).not.toContain('Private source marker');
 expect(dom.container.querySelector<HTMLTextAreaElement>('#thought')!.value).toBe('Keep this unsent draft');
 expect(dom.container.querySelector('.composer-files')?.textContent).toContain('Keep this photo');
});

it('keeps refresh disabled during exact-action review without sending a replacement reply',async()=>{
 const run:RunView={id:'review',status:'waiting_for_approval',draft:'',progress:[],clientId:'browser',revision:2,approvals:[{id:'write',operation:'posts.create',input:{text:'Review me'},version:'one',digest:'digest',title:'Publish',detail:'Review',expiresAt:Date.now()+60000,status:'pending',human:true,kind:'write'}]};
 transport.api.mockResolvedValue({...initial,run});await mount();dom.frame();
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('[aria-label="Open saved artifact"]')!.click());
 const refresh=dom.container.querySelector<HTMLButtonElement>('[aria-label="Refresh artifact"]')!;expect(refresh.disabled).toBe(true);
 await act(async()=>refresh.click());expect(transport.post.mock.calls.some(([path])=>path==='/chat')).toBe(false);
 expect(viewer.current.opened).toMatchObject({id});
});
