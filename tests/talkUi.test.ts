// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {SpacesPanel} from '../src/SpacesPanel';
import {TalkContext} from '../src/TalkSession';
import {TalkComposeProvider,useTalkCompose} from '../src/TalkCompose';
import {outputs} from '../shared/contracts';
import {setupDOM} from './dom';

const api=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:api.operation}));
let dom:ReturnType<typeof setupDOM>;
function Harness(){const compose=useTalkCompose()!;return createElement('div',null,createElement('button',{onClick:()=>compose.setComposing(!compose.composing)},compose.composing?'Cancel':'Open a talk space'),createElement(SpacesPanel,{navigate:vi.fn()}));}
beforeEach(()=>{dom=setupDOM();api.operation.mockReset().mockImplementation(async(name:string)=>name==='spaces.list'?{items:[],nextCursor:null}:name==='search.query'?{matches:[{record:{id:'talk-1',title:'Night walks',description:'',hostName:'Friend',speakerIds:[],speakers:[]}}],nextCursor:null,retrieval:{notices:[]}}:null);});
afterEach(()=>dom.cleanup());
it('replaces Talk search with a title-required creation form from the header action',async()=>{
 await act(async()=>dom.root.render(createElement(TalkContext.Provider,{value:{room:null,create:vi.fn()} as any,children:createElement(TalkComposeProvider,{children:createElement(Harness)})})));
 const browser=dom.container.querySelector('.spaces-browser')!;
 expect(browser.firstElementChild?.classList.contains('discovery-search')).toBe(true);
 const button=(label:string)=>[...dom.container.querySelectorAll<HTMLButtonElement>('button')].find(item=>item.textContent===label)!;
 await act(async()=>button('Open a talk space').click());
 expect(browser.querySelector('.discovery-search')).toBeNull();expect(browser.querySelector<HTMLButtonElement>('.spaces-compose>button')!.disabled).toBe(true);
 const title=browser.querySelector<HTMLInputElement>('#space-title')!;
 act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(title,'Night walks');title.dispatchEvent(new Event('input',{bubbles:true}));});
 expect(browser.querySelector<HTMLButtonElement>('.spaces-compose>button')!.disabled).toBe(false);
 await act(async()=>button('Cancel').click());expect(browser.querySelector('.discovery-search')).not.toBeNull();
 const query=browser.querySelector<HTMLInputElement>('.discovery-search input')!;
 act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(query,'night');query.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>browser.querySelector<HTMLFormElement>('.discovery-search')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(browser.textContent).toContain('Night walks');expect(button('Open a talk space')).toBeTruthy();
});
it('shows connected speakers to someone outside the room, not everyone with speaking permission',async()=>{
 api.operation.mockImplementation(async(name:string)=>name==='spaces.list'?{items:[{id:'talk-1',title:'Night walks',description:'',hostName:'@me',speakerIds:['me','other'],speakers:[{id:'me',name:'@me'},{id:'other',name:'@other'}],speakingCount:1,presentSpeakers:[{id:'me',name:'@me'}]}],nextCursor:null}:null);
 await act(async()=>dom.root.render(createElement(TalkContext.Provider,{value:{room:null} as any,children:createElement(TalkComposeProvider,{children:createElement(Harness)})})));
 expect(dom.container.querySelector('.space-list-card')?.textContent).toContain('1 speaking');
 expect(dom.container.querySelectorAll('.space-speaker-peek>span')).toHaveLength(1);
 expect(dom.container.querySelector('.space-speaker-peek>span')?.getAttribute('title')).toBe('@me');
});
it('joins a Talk space directly from its list card',async()=>{
 api.operation.mockImplementation(async(name:string)=>name==='spaces.list'?{items:[{id:'talk-1',title:'Night walks',description:'',hostName:'@me',speakerIds:['me'],speakers:[{id:'me',name:'@me'}],speakingCount:1,presentSpeakers:[{id:'me',name:'@me'}]}],nextCursor:null}:null);
 const join=vi.fn().mockResolvedValue(undefined);
 await act(async()=>dom.root.render(createElement(TalkContext.Provider,{value:{room:null,join} as any,children:createElement(TalkComposeProvider,{children:createElement(Harness)})})));
 expect(dom.container.querySelector('.space-list-card .space-list-open')).not.toBeNull();
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('.space-list-actions button')!.click());
 expect(join).toHaveBeenCalledWith('talk-1');
});
it('accepts a Talk room in shared search response contracts',()=>{
 const id='9e6839fc-79c7-4fb1-a574-58adb74cdb63',record={id,title:'Night walks',description:'',hostId:'me',hostName:'@me',status:'live',revision:1,createdAt:'2026-10-03T00:00:00Z',speakerIds:['me'],speakers:[{id:'me',name:'@me'}]};
 const match={id:`spaces:${id}`,dataset:'spaces',entityType:'space',entityId:id,ownerId:'me',score:.9,evidence:[{field:'title',text:'Night walks',entityId:id,entityType:'space'}],signals:{semantic:.9},sourceHash:'hash',sourceRevision:'revision',record};
 const retrieval={id:'search',mode:'hybrid',model:'test',dimensions:512,indexVersion:'1',constraints:{},candidates:1,incomplete:false,notices:[],approximate:false};
 for(const name of ['search.query','posts.search','search.similar','search.refine'])expect(outputs[name].safeParse({matches:[match],retrieval,nextCursor:null}).success).toBe(true);
 expect(outputs['search.explain'].safeParse({match,retrieval}).success).toBe(true);
});
it('shows an ended shared Talk immediately without a Join action',async()=>{
 const id='9e6839fc-79c7-4fb1-a574-58adb74cdb63',ended={id,title:'Night walks',description:'The room is over.',hostId:'me',hostName:'@me',status:'ended',revision:2,createdAt:'2026-10-03T00:00:00Z',endedAt:'2026-10-03T01:00:00Z',speakerIds:['me'],speakers:[{id:'me',name:'@me'}]};
 api.operation.mockImplementation(async(name:string)=>name==='spaces.get'?ended:name==='spaces.list'?{items:[],nextCursor:null}:null);
 await act(async()=>dom.root.render(createElement(TalkContext.Provider,{value:{room:null,join:vi.fn()} as any,children:createElement(TalkComposeProvider,{children:createElement(SpacesPanel,{spaceId:id,navigate:vi.fn()})})})));
 const preview=dom.container.querySelector('.talk-preview')!;
 expect(preview.querySelector('.space-ended')?.textContent).toBe('ENDED');
 expect(preview.textContent).not.toContain('LIVE');
 expect(preview.textContent).toContain('@me hosted this talk');
 expect(preview.querySelector('button.solid')).toBeNull();
 expect(preview.querySelector('button[aria-expanded]')?.textContent).toBe('About');
});
