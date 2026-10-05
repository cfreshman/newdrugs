import {z} from 'zod';
import {paymentHandlesOutput} from './paymentHandles';

export const iouAmount=z.number().int().min(1).max(10_000_000).describe('Whole USD cents, never a floating point dollar amount.');
export const iouRecord=z.strictObject({personId:z.uuid(),kind:z.enum(['owe','settle','payment']),direction:z.enum(['me_to_them','them_to_me']).optional(),amountCents:iouAmount.optional(),revision:z.number().int().nonnegative().optional(),reason:z.string().trim().max(240).default('')});
export const iouEntry=z.object({id:z.uuid(),pairId:z.string(),actorId:z.string(),kind:z.enum(['owe','settle','payment']),debtorId:z.string(),creditorId:z.string(),amountCents:iouAmount,reason:z.string(),balanceAfterCents:z.number().int(),createdAt:z.string(),revision:z.number().int().positive()});
export const iouPerson=z.object({id:z.string(),name:z.string(),handle:z.string().optional(),photoId:z.string().optional()});
export const iouSummary=z.object({person:iouPerson,balanceCents:z.number().int(),revision:z.number().int().nonnegative(),updatedAt:z.string(),lastEntry:iouEntry.nullable()});
export const iouList=z.object({items:z.array(iouSummary),nextCursor:z.string().nullable()});
export const iouLedger=iouSummary.extend({entries:z.array(iouEntry),nextCursor:z.string().nullable(),paymentHandles:paymentHandlesOutput});
export const iouRecorded=z.object({ledger:iouSummary,entry:iouEntry});
export type IouEntry=z.infer<typeof iouEntry>;
export type IouSummary=z.infer<typeof iouSummary>;
export type IouLedger=z.infer<typeof iouLedger>;
