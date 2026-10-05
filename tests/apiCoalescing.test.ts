// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {operation} from '../src/api';

afterEach(()=>vi.unstubAllGlobals());

it('shares identical Log reads while keeping each caller abortable',async()=>{
 let finish!:(response:Response)=>void;
 const fetch=vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve;}));
 vi.stubGlobal('fetch',fetch);
 const one=new AbortController(),two=new AbortController();
 const first=operation('log.birthdays',{}, {dedupe:true,signal:one.signal});
 const second=operation('log.birthdays',{}, {dedupe:true,signal:two.signal});
 expect(fetch).toHaveBeenCalledTimes(1);
 one.abort();
 await expect(first).rejects.toMatchObject({name:'AbortError'});
 finish(new Response(JSON.stringify({data:{items:[{personId:'friend'}]}}),{status:200,headers:{'Content-Type':'application/json'}}));
 await expect(second).resolves.toEqual({items:[{personId:'friend'}]});
});
