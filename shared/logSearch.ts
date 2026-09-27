import {z} from 'zod';
import {logDate} from './log';
export const logSearchInput={query:z.string().trim().min(1).max(500),from:logDate.optional(),through:logDate.optional(),personId:z.string().max(100).optional(),scope:z.enum(['all','private','shared']).default('all'),limit:z.number().int().min(1).max(30).default(20),cursor:z.string().max(1000).optional()};
export const logSearchResult=z.object({items:z.array(z.object({entryId:z.string(),title:z.string(),date:logDate,place:z.string(),snippet:z.string(),score:z.number()})),nextCursor:z.string().nullable(),indexing:z.boolean(),mode:z.enum(['hybrid','keyword']),notices:z.array(z.string())});
export type LogSearchInput=z.infer<z.ZodObject<typeof logSearchInput>>;
export type LogSearchResult=z.infer<typeof logSearchResult>;
