// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {useLogNeighbors} from '../src/useLogNeighbors';
import {LogDates} from '../src/LogDirectory';
import {useOpenLogList} from '../src/logSequence';
import {ExperienceContext} from '../src/ExperienceContext';
import {destinationPath,type LogSequence} from '../shared/navigation';
import {ApiError} from '../src/api';
import {clearLogEntries} from '../src/logEntryCache';
import {setupDOM} from './dom';
const api=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:api.operation}));
const entry=(id:string,date='2026-09-27')=>({id,ownerId:'me',date,title:id,place:'',links:[],recurrence:'none',coverFileId:null,revision:1,createdAt:'2026-09-27T00:00:00Z',updatedAt:'2026-09-27T00:00:00Z',membership:'member',contributors:[],invitations:[]} as const);
let dom:ReturnType<typeof setupDOM>,value:ReturnType<typeof useLogNeighbors>;
function Harness({id,context,visible=true}:{id:string;context?:LogSequence;visible?:boolean}){value=useLogNeighbors({entryId:id,userId:'me',visible,context});return null;}
beforeEach(()=>{dom=setupDOM();clearLogEntries();api.operation.mockReset().mockImplementation(async(name,input)=>name==='log.get'?entry(input.entryId):name==='log.neighbors'?{previous:entry('older'),next:entry('newer')}:{items:[],nextCursor:null});});
afterEach(()=>dom.cleanup());
it('follows arbitrary displayed order with no wraparound or global neighbor request',async()=>{
 const context={key:'source',ids:['z','a','m']};
 await act(async()=>dom.root.render(createElement(Harness,{id:'a',context})));
 expect(value.neighbors.previous?.id).toBe('z');expect(value.neighbors.next?.id).toBe('m');
 await act(async()=>dom.root.render(createElement(Harness,{id:'z',context})));
 expect(value.neighbors.previous).toBeNull();expect(value.neighbors.next?.id).toBe('a');
 await act(async()=>dom.root.render(createElement(Harness,{id:'m',context})));
 expect(value.neighbors.next).toBeNull();expect(api.operation.mock.calls.some(call=>call[0]==='log.neighbors')).toBe(false);
});
it('continues the same paginated source and carries loaded IDs into subsequent navigation',async()=>{
 const original=api.operation.getMockImplementation()!;
 api.operation.mockImplementation((name,input,...args)=>name==='log.list'?Promise.resolve({items:[entry('b'),entry('c')],nextCursor:null}):original(name,input,...args));
 await act(async()=>dom.root.render(createElement(Harness,{id:'a',context:{key:'profile',ids:['a'],query:{personId:'friend',scope:'shared'},nextCursor:'page2'}})));
 expect(api.operation).toHaveBeenCalledWith('log.list',{personId:'friend',scope:'shared',recurring:false,includeAnniversaries:false,before:'page2',limit:30},{signal:expect.anything()});
 expect(value.neighbors.next?.id).toBe('b');const context=value.sequence();expect(context?.ids).toEqual(['a','b','c']);
 await act(async()=>dom.root.render(createElement(Harness,{id:'b',context})));
 expect(value.neighbors.previous?.id).toBe('a');expect(value.neighbors.next?.id).toBe('c');expect(api.operation.mock.calls.filter(call=>call[0]==='log.list')).toHaveLength(1);
});
it('skips revoked records within the source instead of switching to the whole calendar',async()=>{
 const original=api.operation.getMockImplementation()!;
 api.operation.mockImplementation((name,input,...args)=>name==='log.get'&&input.entryId==='gone'?Promise.reject(new ApiError('Unavailable','not_found',404)):original(name,input,...args));
 await act(async()=>dom.root.render(createElement(Harness,{id:'a',context:{key:'source',ids:['a','gone','b']}})));
 expect(value.neighbors.next?.id).toBe('b');expect(value.sequence()?.ids).toEqual(['a','b']);
});
it('ignores an old list response after a different list opens',async()=>{
 let finish!:(value:unknown)=>void;const original=api.operation.getMockImplementation()!;
 api.operation.mockImplementation((name,input,...args)=>name==='log.get'&&input.entryId==='old-next'?new Promise(resolve=>{finish=resolve;}):original(name,input,...args));
 await act(async()=>dom.root.render(createElement(Harness,{id:'a',context:{key:'old',ids:['a','old-next']}})));
 await act(async()=>dom.root.render(createElement(Harness,{id:'b',context:{key:'new',ids:['b','new-next']}})));
 await act(async()=>finish(entry('old-next')));
 expect(value.neighbors.next?.id).toBe('new-next');expect(value.sequence()?.key).toBe('new');
});
it('retains chronological neighbors for direct calendar and deep-link opens',async()=>{
 await act(async()=>dom.root.render(createElement(Harness,{id:'a'})));
 expect(value.list).toBe(false);expect(value.neighbors.previous?.id).toBe('older');expect(value.neighbors.next?.id).toBe('newer');
});
it('keeps list context out of share URLs and stays in the Agent workspace when opening its profile list',async()=>{
 const navigate=vi.fn();function Open(){const open=useOpenLogList(navigate);return createElement('button',{onClick:()=>open(entry('a') as any,[entry('a'),entry('b')] as any)},'Open');}
 await act(async()=>dom.root.render(createElement(ExperienceContext.Provider,{value:{mode:'agent'} as any},createElement(Open))));
 await act(async()=>dom.container.querySelector('button')!.click());const target=navigate.mock.lastCall![0];expect(target).toMatchObject({view:'log',resourceId:'a',mode:'agent',logSequence:{ids:['a','b']}});expect(destinationPath(target)).toBe('/agent/log/a');
});
it('uses the displayed next-anniversary order instead of original hangout dates',async()=>{
 const rows=[{...entry('winter','2024-12-10'),recurrence:'anniversary'},{...entry('autumn','2020-10-10'),recurrence:'anniversary'}];
 api.operation.mockResolvedValue({items:rows,nextCursor:null});const navigate=vi.fn();
 await act(async()=>dom.root.render(createElement(LogDates,{kind:'anniversaries',navigate,close:vi.fn()})));
 const buttons=[...dom.container.querySelectorAll<HTMLButtonElement>('.log-date-row')];const visibleOrder=buttons.map(button=>button.querySelector('span')!.textContent);
 await act(async()=>buttons[0].click());expect(navigate.mock.lastCall![0].logSequence.ids).toEqual(visibleOrder);expect(navigate.mock.lastCall![0].logSequence.query).toBeUndefined();
});
