import {expect,it} from 'vitest';
import {iouBalanceChange,iouRecordTransition} from '../server/ious';

it('keeps both views of an IOU in exact cents and prevents over-settlement',()=>{
 const charge=iouBalanceChange(true,0,'owe','them_to_me',1418);
 expect(charge).toBe(1418);
 expect(iouBalanceChange(false,charge,'settle','me_to_them',1418)).toBe(0);
 expect(iouBalanceChange(true,charge,'settle','them_to_me',418)).toBe(1000);
 expect(()=>iouBalanceChange(true,charge,'settle','them_to_me',1419)).toThrow(/more than/);
 expect(iouBalanceChange(false,0,'owe','them_to_me',1417)).toBe(-1417);
 expect(iouRecordTransition(true,1418,{kind:'settle'})).toMatchObject({balanceCents:0,amountCents:1418,direction:'them_to_me'});
 expect(iouRecordTransition(false,1418,{kind:'payment',amountCents:418})).toMatchObject({balanceCents:1000,amountCents:418,direction:'me_to_them'});
 expect(()=>iouRecordTransition(true,1418,{kind:'payment',amountCents:1418})).toThrow(/full remaining/);
});
