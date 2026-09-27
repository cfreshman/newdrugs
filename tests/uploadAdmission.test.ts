import {EventEmitter} from 'node:events';
import {it,expect,vi} from 'vitest';
import {uploadAdmission} from '../server/uploadAdmission';
it('rejects excess upload bodies before parsing and releases each slot exactly once',()=>{
 const admit=uploadAdmission(2),response=()=>Object.assign(new EventEmitter(),{set:vi.fn()}),one=response(),two=response(),third=response(),next=vi.fn();
 admit({} as any,one as any,next);admit({} as any,two as any,next);expect(next.mock.calls).toEqual([[],[]]);
 admit({} as any,third as any,next);expect(next.mock.lastCall?.[0]).toMatchObject({status:503,code:'uploads_busy'});
 one.emit('close');one.emit('finish');admit({} as any,response() as any,next);expect(next.mock.lastCall).toEqual([]);admit({} as any,response() as any,next);expect(next.mock.lastCall?.[0]).toMatchObject({status:503});
});
