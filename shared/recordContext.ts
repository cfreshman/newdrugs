import {z} from 'zod';
export const recordReferenceSchema=z.strictObject({kind:z.enum(['post','person','message','log','artifact']),id:z.string().min(1).max(150),revision:z.number().int().positive().optional(),contentRevision:z.union([z.number().int().positive(),z.literal('legacy')]).optional()});
export type RecordReference=z.infer<typeof recordReferenceSchema>;
export interface RecordAttachment extends RecordReference {title:string}
export const recordAttachmentSchema=recordReferenceSchema.extend({title:z.string().max(180)});
