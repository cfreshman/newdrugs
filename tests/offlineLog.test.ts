// @vitest-environment jsdom
import {IDBFactory} from 'fake-indexeddb';
import {afterEach,expect,it,vi} from 'vitest';
import {logFields} from '../shared/log';
const calls=vi.hoisted(()=>({operation:vi.fn(),upload:vi.fn()}));
vi.mock('../src/api',()=>({operation:calls.operation}));
vi.mock('../src/uploads',()=>({uploadFile:calls.upload}));
import {bindOfflineLog,clearOfflineLog,offlineBootstrap,pendingOfflineLogs,queueOfflineLog,replayOfflineLogs,saveOfflineBootstrap} from '../src/offlineLog';

afterEach(async()=>{await clearOfflineLog();vi.unstubAllGlobals();calls.operation.mockReset();calls.upload.mockReset();});
it('keeps an offline Log entry through storage and replays it once with its original key',async()=>{
 vi.stubGlobal('indexedDB',new IDBFactory());
 await bindOfflineLog('me');
 await saveOfflineBootstrap({user:{id:'me',handle:'me',name:'Me',city:'',bio:'',interests:[],discoverable:false},wallet:{balanceNanos:0,reservedNanos:0,availableNanos:0,entries:[]},messages:[],config:{aiEnabled:true,paymentsEnabled:false,development:false,model:'test'}});
 const draft=logFields.parse({date:'2026-10-04',title:'Outside',place:'Park'});
 const queued=await queueOfflineLog({userName:'Me',entry:draft,note:'A good day',files:[],people:[]});
 expect((await pendingOfflineLogs()).map(row=>row.id)).toEqual([queued.id]);
 expect((await offlineBootstrap())?.user.id).toBe('me');
 calls.operation.mockResolvedValue({id:'saved',...draft,revision:1,ownerId:'me',createdAt:'2026-10-04T12:00:00Z',updatedAt:'2026-10-04T12:00:00Z',membership:'member',contributors:[{userId:'me',name:'Me',note:'A good day',files:[]}],invitations:[]});
 await replayOfflineLogs();await replayOfflineLogs();
 expect(calls.operation).toHaveBeenCalledTimes(1);
 expect(calls.operation).toHaveBeenCalledWith('log.create',expect.objectContaining({entry:draft,contribution:{note:'A good day',fileIds:[]}}),{key:queued.key});
 expect(await pendingOfflineLogs()).toEqual([]);
 await clearOfflineLog();expect(await offlineBootstrap()).toBeNull();
});
it('replaces an expired prepared upload before replaying a queued photo',async()=>{
 vi.stubGlobal('indexedDB',new IDBFactory());
 await bindOfflineLog('me');
 const draft=logFields.parse({date:'2026-10-04',title:'Outside',place:'Park'});
 await queueOfflineLog({userName:'Me',entry:draft,note:'',files:[{name:'photo.jpg',mime:'image/jpeg',blob:new Blob(['photo'],{type:'image/jpeg'}),prepareKey:'expired-key'}],coverIndex:0,people:[]});
 calls.upload.mockRejectedValueOnce(Object.assign(new Error('Upload expired.'),{code:'upload_expired'})).mockResolvedValueOnce({id:'fresh-photo'});
 calls.operation.mockResolvedValue({id:'saved',...draft,revision:1,contributors:[{userId:'me',files:[{id:'fresh-photo'}]}]});
 await replayOfflineLogs();
 expect(calls.upload).toHaveBeenCalledTimes(2);
 expect(calls.upload.mock.calls[0][4]).toBe('expired-key');
 expect(calls.upload.mock.calls[1][4]).not.toBe('expired-key');
 expect(calls.operation).toHaveBeenCalledWith('log.create',expect.objectContaining({entry:expect.objectContaining({coverFileId:'fresh-photo'}),contribution:{note:'',fileIds:['fresh-photo']}}),expect.any(Object));
 expect(await pendingOfflineLogs()).toEqual([]);
});
