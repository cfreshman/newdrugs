// @vitest-environment jsdom
import {act,createElement} from 'react';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {BillingActivity,billingDateRange} from '../src/BillingActivity';import {setupDOM} from './dom';
const api=vi.hoisted(()=>({operation:vi.fn()}));vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:api.operation}));
let dom:ReturnType<typeof setupDOM>;const wallet={balanceNanos:1e9,reservedNanos:0,availableNanos:1e9,entries:[]};
beforeEach(()=>{dom=setupDOM();api.operation.mockReset().mockResolvedValue({items:[{id:'period',kind:'usage',label:'Agent usage',amountNanos:-12000000,startedAt:'2026-09-01T12:00:00Z',endedAt:'2026-09-27T12:00:00Z',chargeCount:20}]});});afterEach(()=>dom.cleanup());
it('loads grouped activity only when opened and refreshes it when live receipts change',async()=>{
 await act(async()=>dom.root.render(createElement(BillingActivity,{wallet})));expect(api.operation).not.toHaveBeenCalled();
 const details=dom.container.querySelector('details')!;await act(async()=>{details.open=true;details.dispatchEvent(new Event('toggle'));});expect(api.operation.mock.calls[0][0]).toBe('wallet.activity');
 expect(dom.container.querySelector('.ledger-date')?.textContent).toContain('Sep 1, 2026 - Sep 27, 2026');expect(dom.container.querySelectorAll('.ledger li')).toHaveLength(1);
 await act(async()=>dom.root.render(createElement(BillingActivity,{wallet:{...wallet,entries:[{id:'new',amountNanos:-10,label:'Agent usage',createdAt:'2026-09-27T12:00:00Z'}]}})));expect(api.operation).toHaveBeenCalledTimes(2);expect(dom.container.querySelector('details')).toBe(details);
});
it('includes both times for a period within one day and a year on dates',()=>{
 expect(billingDateRange('2026-09-27T12:00:00Z','2026-09-27T14:00:00Z')).toMatch(/Sep 27, 2026, .+ - .+/);
 expect(billingDateRange('2025-12-31T12:00:00Z','2026-01-01T12:00:00Z')).toBe('Dec 31, 2025 - Jan 1, 2026');
});
