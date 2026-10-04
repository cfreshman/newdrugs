import {z} from 'zod';

/** Advisory input context for one human chat message. It grants no authority. */
export const chatInputContext=z.strictObject({mobile:z.boolean(),dictated:z.boolean()});
export type ChatInputContext=z.infer<typeof chatInputContext>;
