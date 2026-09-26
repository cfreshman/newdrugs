import { z } from 'zod';
export const inboxLinkSchema = z.strictObject({ title: z.string().trim().min(1).max(120), url: z.url().max(2048).refine(value => { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; }, 'Use a public HTTP(S) link without credentials.') });
export const deliverySchema = z.strictObject({ title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(12000), links: z.array(inboxLinkSchema).max(12).default([]) });
export const inboxItemSchema = deliverySchema.extend({ id: z.string(), createdAt: z.string(), read: z.boolean(), archived: z.boolean(), unavailable: z.boolean(), producer: z.strictObject({ kind: z.enum(['external', 'hosted', 'automation']), name: z.string(), id: z.string().optional() }), automationId: z.string().optional(), runId: z.string().optional() });
export type InboxItem = z.infer<typeof inboxItemSchema>;
export type InboxAttachment = Pick<InboxItem, 'id' | 'title'>;
