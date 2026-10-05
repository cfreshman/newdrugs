// @vitest-environment jsdom
import {IDBFactory} from 'fake-indexeddb';
import {act,createElement} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {setupDOM} from './dom';
const api=vi.hoisted(()=>({operation:vi.fn()}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:api.operation}));
import {LogEditor} from '../src/LogPanel';
import {bindOfflineLog,clearOfflineLog,pendingOfflineLogs} from '../src/offlineLog';

let dom:ReturnType<typeof setupDOM>|undefined;
afterEach(async()=>{dom?.cleanup();await clearOfflineLog();vi.unstubAllGlobals();api.operation.mockReset();});
it('keeps the Log draft locally when there is no signal and closes only after storage succeeds',async()=>{
 vi.stubGlobal('indexedDB',new IDBFactory());Object.defineProperty(navigator,'onLine',{configurable:true,value:false});
 await bindOfflineLog('me');dom=setupDOM();api.operation.mockResolvedValue({items:[],nextCursor:null});
 const onQueued=vi.fn(),onSaved=vi.fn();
 await act(async()=>dom!.root.render(createElement(LogEditor,{user:{id:'me',name:'Me',city:'',bio:'',interests:[],discoverable:false},date:'2026-10-04',cancel:vi.fn(),onQueued,onSaved})));
 const title=dom.container.querySelector<HTMLInputElement>('.log-title-input')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(title,'At the beach');title.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>dom!.container.querySelector<HTMLFormElement>('.log-editor')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 await vi.waitFor(()=>expect(onQueued).toHaveBeenCalledOnce());expect(onSaved).not.toHaveBeenCalled();
 expect((await pendingOfflineLogs())[0]).toMatchObject({entry:{title:'At the beach',date:'2026-10-04'}});
 expect(api.operation.mock.calls.some(([name])=>name==='log.create')).toBe(false);
});
