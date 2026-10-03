// @vitest-environment jsdom
import {act,createElement,useState} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {TalkDock} from '../src/TalkDock';
import {TalkContext} from '../src/TalkSession';
import {NavigationContext} from '../src/NavigationContext';
import {setupDOM} from './dom';

let dom:ReturnType<typeof setupDOM>;
const on={identity:'host',name:'@host',metadata:'{}',audioTrackPublications:new Map([['mic',{track:{},isMuted:false}]])};
const muted={identity:'friend',name:'@friend',metadata:'{}',audioTrackPublications:new Map()};
function Harness({mic=true,role='host',profileIds=[]}:{mic?:boolean;role?:'host'|'listener';profileIds?:string[]}){const [expanded,setExpanded]=useState(false);const talk={space:{id:'space',title:'Night walks',description:'Outside',createdAt:new Date(Date.now()-90000).toISOString(),hostId:'host',speakerIds:['host','friend'],profileIds,myRole:role},room:{localParticipant:on},members:[on,muted],speaking:new Set(),requests:[{personId:'guest',name:'@guest'}],mic,audioBlocked:false,expanded,busy:false,error:'',copied:false,setExpanded,share:vi.fn(),end:vi.fn(),toggleMic:vi.fn(),respond:vi.fn()} as any;return createElement(TalkContext.Provider,{value:talk,children:createElement(TalkDock)});}
beforeEach(()=>{dom=setupDOM();});afterEach(()=>dom.cleanup());
it('keeps counts compact and puts requests, muted status, elapsed time and Share in the expanded panel',async()=>{
 await act(async()=>dom.root.render(createElement(Harness)));
 expect(dom.container.querySelector('.talk-compact-presence')?.textContent).toContain('2 speaking');
 expect(dom.container.querySelector('.talk-compact-presence')?.textContent).not.toContain('listening');
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('.talk-dock-title')!.click());
 expect(dom.container.querySelector('.talk-compact-presence')).toBeNull();
 const headings=[...dom.container.querySelectorAll('.talk-dock-people h3')].map(node=>node.textContent);
 expect(headings).toEqual(['Speakers','Requests to speak','Listeners']);
 expect([...dom.container.querySelectorAll('.talk-person-mic')].map(node=>node.getAttribute('aria-label'))).toEqual(['@friend muted']);
 expect(dom.container.querySelector('.talk-dock-footer .talk-live-time')?.textContent).toMatch(/^Live \d+:\d\d$/);
 expect(dom.container.querySelector('.talk-dock-footer button[aria-label="Share talk space"]')).not.toBeNull();
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('button[aria-label="Manage @friend"]')!.click());
 expect(dom.container.querySelector('.talk-dock-people>.space-avatar-grid + .space-person-menu')?.textContent).toContain('Offer host');
 expect(dom.container.querySelector('.space-person-menu .space-person-actions')?.children).toHaveLength(4);
 expect([...dom.container.querySelectorAll('.talk-dock-bar>button')].map(button=>button.getAttribute('aria-label'))).toEqual([null,'End talk space','Mic on. Mute microphone','Collapse talk space']);
});
it('uses a slashed microphone icon while muted',async()=>{
 await act(async()=>dom.root.render(createElement(Harness,{mic:true})));
 const liveIcon=dom.container.querySelector('.talk-mic svg')?.innerHTML;
 await act(async()=>dom.root.render(createElement(Harness,{mic:false})));
 expect(dom.container.querySelector('.talk-mic')?.getAttribute('aria-label')).toBe('Mic off. Unmute microphone');
 expect(dom.container.querySelector('.talk-mic svg')?.innerHTML).not.toBe(liveIcon);
});
it('opens discoverable profiles while keeping host controls and Talk connected',async()=>{
 const navigate=vi.fn();
 await act(async()=>dom.root.render(createElement(NavigationContext.Provider,{value:navigate,children:createElement(Harness,{profileIds:['host','friend']})})));
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('.talk-dock-title')!.click());
 const name=dom.container.querySelector<HTMLAnchorElement>('.space-person-name[href="/people/friend"]')!;expect(name?.textContent).toBe('@friend');
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('button[aria-label="Manage @friend"]')!.click());
 const menu=dom.container.querySelector('.space-person-menu')!;
 expect(menu.querySelector<HTMLAnchorElement>('a[href="/people/friend"]')?.textContent).toBe('View profile');
 expect(menu.textContent).toContain('Remove mic');
 await act(async()=>menu.querySelector<HTMLAnchorElement>('a[href="/people/friend"]')!.click());
 expect(navigate).toHaveBeenCalledWith({view:'person',resourceId:'friend'});
 expect(dom.container.querySelector('.talk-dock')).not.toBeNull();
 expect(dom.container.querySelector('.talk-dock')?.hasAttribute('data-expanded')).toBe(false);
});
it('links a discoverable avatar for listeners and leaves private participants unlinked',async()=>{
 const navigate=vi.fn();
 await act(async()=>dom.root.render(createElement(NavigationContext.Provider,{value:navigate,children:createElement(Harness,{role:'listener',profileIds:['friend']})})));
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('.talk-dock-title')!.click());
 const friend=dom.container.querySelector<HTMLAnchorElement>('a[aria-label="Open @friend profile"]')!;
 expect(friend?.getAttribute('href')).toBe('/people/friend');
 expect(dom.container.querySelector('.space-person-name[href="/people/host"]')).toBeNull();
 await act(async()=>friend.click());
 expect(navigate).toHaveBeenCalledWith({view:'person',resourceId:'friend'});
});
