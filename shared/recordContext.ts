import {z} from 'zod';
export const recordReferenceSchema=z.strictObject({kind:z.enum(['post','person','message','log']),id:z.string().min(1).max(150)});
export type RecordReference=z.infer<typeof recordReferenceSchema>;
export interface RecordAttachment extends RecordReference {title:string}
export const recordAttachmentSchema=recordReferenceSchema.extend({title:z.string().max(180)});
