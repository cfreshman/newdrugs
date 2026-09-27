import {z} from 'zod';
export const billingActivityItem=z.object({id:z.string(),kind:z.enum(['charge','usage','credit','adjustment']),label:z.string(),amountNanos:z.number(),startedAt:z.string(),endedAt:z.string(),chargeCount:z.number().int().nonnegative()});
export const billingActivityOutput=z.object({items:z.array(billingActivityItem)});
export type BillingActivityItem=z.infer<typeof billingActivityItem>;
