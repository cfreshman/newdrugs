import {z} from 'zod';
export const billingActivityItem=z.object({id:z.string(),kind:z.enum(['charge','usage','credit','adjustment']),label:z.string(),model:z.string().min(1).max(160).optional(),amountNanos:z.number(),startedAt:z.string(),endedAt:z.string(),chargeCount:z.number().int().nonnegative()});
export const billingActivityOutput=z.object({items:z.array(billingActivityItem),indexing:z.boolean().optional()});
export type BillingActivityItem=z.infer<typeof billingActivityItem>;
