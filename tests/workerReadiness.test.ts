import {hostname} from 'node:os';
import {it,expect,vi,afterEach} from 'vitest';
const state=vi.hoisted(()=>({workers:[] as any[],connect:vi.fn(async()=>{})}));
vi.mock('../server/db',()=>({connectDatabase:state.connect,mongo:{close:async()=>{}},rows:()=>({find:()=>({limit:()=>({toArray:async()=>state.workers})}),countDocuments:async()=>0,findOne:async()=>null})}));
const original=process.argv,oldExit=process.exitCode;
afterEach(()=>{process.argv=original;process.exitCode=oldExit;vi.restoreAllMocks();});
async function check(pid:string){vi.resetModules();state.connect.mockClear();process.argv=['node','workerStatus','--require-worker',pid];process.exitCode=undefined;vi.spyOn(console,'log').mockImplementation(()=>{});await import('../server/workerStatus');}
it.each(['0','-1','invalid',''])('rejects invalid worker PID %s before connecting',async pid=>{await expect(check(pid)).rejects.toThrow('positive worker PID');expect(state.connect).not.toHaveBeenCalled();});
it('requires the exact live host and process, without rebuilding indexes',async()=>{
 state.workers=[{role:'worker',pid:123,host:'another-host',heartbeatAt:new Date()}];await check('123');expect(process.exitCode).toBe(1);
 state.workers=[{role:'worker',pid:124,host:hostname(),heartbeatAt:new Date()}];await check('123');expect(process.exitCode).toBe(1);
 state.workers=[{role:'worker',pid:123,host:hostname(),heartbeatAt:new Date()}];await check('123');expect(process.exitCode).toBeUndefined();expect(state.connect).toHaveBeenCalledWith(undefined,{indexes:false});
});
