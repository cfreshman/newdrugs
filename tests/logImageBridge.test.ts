// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it('does not wipe persisted photos during startup before identity is known',async()=>{
 vi.resetModules();const postMessage=vi.fn(),worker={postMessage},registration={active:worker},listeners:any={};vi.stubGlobal('navigator',{serviceWorker:{controller:worker,register:vi.fn(async()=>registration),ready:Promise.resolve(registration),addEventListener:(name:string,fn:any)=>{listeners[name]=fn;}}});
 const bridge=await import('../src/logImageCache');bridge.startLogImageCache();await new Promise(resolve=>setTimeout(resolve,0));expect(postMessage).not.toHaveBeenCalled();
 bridge.bindLogImageCache('account');await Promise.resolve();expect(postMessage).toHaveBeenCalledWith({type:'log-images:account',account:'account'});
 listeners.controllerchange();await Promise.resolve();expect(postMessage).toHaveBeenLastCalledWith({type:'log-images:account',account:'account'});
 expect(bridge.logImageUrl('/api/files/photo')).toBe('/api/files/photo?log-image=1');expect(bridge.logImageUrl('blob:photo')).toBe('blob:photo');expect(bridge.avatarImageUrl('avatar')).toBe('/api/files/avatar?avatar=1');
});
