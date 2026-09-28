import {it,expect,vi} from 'vitest';
import {AppError} from '../server/errors';
const state=vi.hoisted(()=>({entry:vi.fn(),finish:vi.fn()}));
vi.mock('../server/config',()=>({config:{VAPID_PUBLIC_KEY:'fixture',VAPID_PRIVATE_KEY:'fixture'}}));
vi.mock('../server/auth',()=>({hash:(s:string)=>s,users:()=>({findOne:async(filter:any)=>filter.suspendedAt?.$type?null:{handle:'fixture'}})}));
vi.mock('../server/log',()=>({logEntryFor:state.entry}));
vi.mock('../server/db',()=>({rows:(name:string)=>({findOne:async()=>name==='blocks'?null:{_id:'notice'},findOneAndUpdate:async()=>({_id:'event',userId:'me',actorId:'other',connectionId:'entry',kind:'log_update',eventId:'1'}),updateOne:state.finish}),transaction:async(work:any)=>work()}));
import {deliverPush} from '../server/push';
it.each([1,2])('retries transient errors in Log authorization/title lookup %s',async position=>{
 state.entry.mockReset();state.finish.mockClear();if(position===2)state.entry.mockResolvedValueOnce({members:['me'],title:'Fixture'});state.entry.mockRejectedValueOnce(new Error('temporary database failure'));
 await expect(deliverPush(vi.fn())).rejects.toThrow('temporary database failure');expect(state.finish).not.toHaveBeenCalled();
});
it('skips genuinely revoked Log notifications',async()=>{state.entry.mockReset().mockRejectedValueOnce(new AppError(404,'not_found','Unavailable'));state.finish.mockClear();await deliverPush(vi.fn());expect(state.finish).toHaveBeenCalledWith(expect.anything(),{$set:{status:'skipped'}});});
