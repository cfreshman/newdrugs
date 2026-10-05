import {expect,it} from 'vitest';
import {paymentHandlesInput,paymentLink} from '../shared/paymentHandles';

it('normalizes account payment names and builds exact-cent links to fixed hosts',()=>{
 expect(paymentHandlesInput.parse({venmo:' @Laura_2 ',cashApp:' $Benjy3 ',currentPassword:'secret'})).toMatchObject({venmo:'Laura_2',cashApp:'Benjy3'});
 expect(paymentHandlesInput.parse({venmo:' ',cashApp:'',currentPassword:'secret'})).toMatchObject({venmo:'',cashApp:''});
 expect(paymentLink('venmo','Laura_2',4253)).toBe('https://venmo.com/?txn=pay&recipients=Laura_2&amount=42.53');
 expect(paymentLink('cashApp','Benjy3',4253)).toBe('https://cash.app/$Benjy3/42.53');
});

it('rejects untrusted destinations and invalid amounts',()=>{
 for(const handle of ['https://other.site','name/path','name?x=1','name\nnext']){
  expect(paymentLink('venmo',handle,100)).toBeNull();
  expect(paymentLink('cashApp',handle,100)).toBeNull();
 }
 expect(paymentLink('venmo','Laura_2',0)).toBeNull();
 expect(paymentLink('cashApp','Benjy3',Number.NaN)).toBeNull();
});
