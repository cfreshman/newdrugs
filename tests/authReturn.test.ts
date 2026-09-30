// @vitest-environment jsdom
import {beforeEach,it,expect} from 'vitest';import {rememberAuthReturn,readAuthReturn,clearAuthReturn} from '../src/authReturn';
beforeEach(()=>sessionStorage.clear());
it('preserves a device approval code across sign-in and reload in the current mode',()=>{const destination={view:'agents' as const,resourceId:'device',query:'BCDF-GHJK',mode:'log' as const};rememberAuthReturn(destination);expect(readAuthReturn()).toEqual(destination);});
it('keeps a validated invitation return route across authentication reloads',()=>{const destination={view:'log_join' as const,resourceId:'a'.repeat(32),mode:'posts' as const};rememberAuthReturn(destination);expect(readAuthReturn()).toMatchObject(destination);clearAuthReturn();expect(readAuthReturn()).toBeNull();});
it('rejects expired, malformed and external return destinations',()=>{for(const entry of [{path:'https://evil.test',expires:Date.now()+1000},{path:'//evil.test',expires:Date.now()+1000},{path:'/log/join/'+ 'a'.repeat(32),expires:1},{path:'/not-a-real-view',expires:Date.now()+1000}]){sessionStorage.setItem('nd-auth-return',JSON.stringify(entry));expect(readAuthReturn()).toBeNull();}});
