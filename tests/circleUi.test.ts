// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {setupDOM} from './dom';
import {PeoplePanel} from '../src/NativePanels';

const api=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:api.operation}));
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();api.operation.mockReset().mockResolvedValue({items:[{id:'person',handle:'person',name:'Person',city:'',bio:'',interests:[],discoverable:true,mutualCount:2,mutualFriends:[{id:'one',name:'@one',photoId:'photo-one'},{id:'two',name:'@two'}]}],nextCursor:null});});
afterEach(()=>dom.cleanup());
it('shows mutual friends and their photos on the person card in every Explore scope',async()=>{
 const user={id:'viewer',handle:'viewer',name:'Viewer',city:'',bio:'',interests:[],discoverable:true};
 await act(async()=>dom.root.render(createElement(PeoplePanel,{user,initialScope:'all',navigate:vi.fn()})));
 const card=dom.container.querySelector('.people-list>a')!;
 expect(card.textContent).toContain('2 mutual friends: @one, @two');
 expect(card.querySelector<HTMLImageElement>('.person-mutual-avatars img')?.getAttribute('src')).toBe('/api/files/photo-one');
 expect(card.querySelectorAll('.person-mutual-avatars>span')).toHaveLength(2);
 expect([...dom.container.querySelectorAll('.view-tabs button')].map(button=>button.textContent)).toEqual(['Nearby','All people','Circle']);
});
