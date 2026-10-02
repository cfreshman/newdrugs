// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {NotificationSettingsPanel} from '../src/NotificationSettingsPanel';
import {setupDOM} from './dom';

const api=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:api.operation}));
let dom:ReturnType<typeof setupDOM>;
beforeEach(()=>{dom=setupDOM();api.operation.mockReset().mockImplementation(async(name:string,input:any)=>name==='notifications.preferences'?{items:[{type:'message',enabled:true},{type:'talk_first_live',enabled:false}]}:name==='notifications.rules'?{items:[],nextCursor:null}:name==='notifications.preference_set'?input:null);});
afterEach(()=>dom.cleanup());
it('uses one enabled switch per type with no separate push switch',async()=>{
 await act(async()=>dom.root.render(createElement(NotificationSettingsPanel)));
 const labels=[...dom.container.querySelectorAll('.notification-preference')];
 expect(labels.map(label=>label.textContent)).toEqual(['Messages','First live Talk']);
 expect(dom.container.querySelectorAll('.notification-preference input')).toHaveLength(2);
 await act(async()=>labels[1].querySelector<HTMLInputElement>('input')!.click());
 expect(api.operation).toHaveBeenCalledWith('notifications.preference_set',{type:'talk_first_live',enabled:true});
});
