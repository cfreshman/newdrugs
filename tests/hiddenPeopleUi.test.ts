// @vitest-environment jsdom
import {act,createElement} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {HiddenPeoplePanel} from '../src/PeopleSafety';
import {setupDOM} from './dom';
import {destinationPath,parseDestination} from '../shared/navigation';

const api=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:api.operation}));
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();api.operation.mockReset().mockImplementation(async(name:string)=>name==='people.search'?{items:[{id:'person',handle:'person',name:'Person',city:'',bio:'',interests:[],discoverable:true,hidden:true}],nextCursor:null}:{personId:'person',hidden:false});});
afterEach(()=>dom.cleanup());
it('places Hidden people in Settings and unhides from its own list',async()=>{
 expect(destinationPath({view:'hidden_people'})).toBe('/settings/hidden');
 expect(parseDestination('/settings/hidden','https://druggie.org')?.view).toBe('hidden_people');
 await act(async()=>dom.root.render(createElement(HiddenPeoplePanel,{navigate:vi.fn()})));
 expect(dom.container.querySelector('.hidden-people-list')?.textContent).toContain('@person');
 await act(async()=>dom.container.querySelector<HTMLButtonElement>('.hidden-people-list button')!.click());
 expect(api.operation).toHaveBeenCalledWith('people.hide',{personId:'person',hidden:false});
});
