import {expect,it} from 'vitest';
import {newerAppRelease,observeAppRelease,type AppReleaseState} from '../src/appRelease';

it('compares release versions without treating rollbacks or malformed values as updates',()=>{
 expect(newerAppRelease('0.31.2','0.31.1')).toBe(true);expect(newerAppRelease('0.32.0','0.31.9')).toBe(true);
 expect(newerAppRelease('0.31.1','0.31.1')).toBe(false);expect(newerAppRelease('0.30.9','0.31.1')).toBe(false);expect(newerAppRelease('latest','0.31.1')).toBe(false);
});

it('stays quiet on initial load and signals only a later newer server release',()=>{
 let state:AppReleaseState={observed:null,available:null};
 state=observeAppRelease(state,'9.0.0','0.31.1');expect(state).toEqual({observed:'9.0.0',available:null});
 expect(observeAppRelease(state,'9.0.0','0.31.1')).toBe(state);
 state=observeAppRelease(state,'9.0.1','0.31.1');expect(state.available).toBe('9.0.1');
 state=observeAppRelease(state,'0.30.0','0.31.1');expect(state.available).toBeNull();
});
