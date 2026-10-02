import {z} from 'zod';

export const notificationType=z.enum([
 'invitation','connection_accepted','message','call','post_like','post_reply',
 'log_added','log_update','review','agent_update','automation_status',
 'talk_first_live',
]);
export type NotificationType=z.infer<typeof notificationType>;
export const notificationPreference=z.object({type:notificationType,enabled:z.boolean()});
export const notificationPreferences=z.object({items:z.array(notificationPreference)});
export const existingNotificationTypes:NotificationType[]=['invitation','connection_accepted','message','call','post_like','post_reply','log_added','log_update','review','agent_update','automation_status'];
export const notificationTypeLabels:Record<NotificationType,string>={
 invitation:'Friend invitations',connection_accepted:'Accepted invitations',message:'Messages',call:'Video calls',
 post_like:'Likes on your posts',post_reply:'Replies to your posts',log_added:'Added to a hangout',
 log_update:'First contribution from another attendee',review:'Agent reviews',
 agent_update:'Agent inbox',automation_status:'Automation status',talk_first_live:'First live Talk',
};

export const notificationRule=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('talk_person'),personId:z.string().min(1).max(100)}),
 z.object({kind:z.literal('post_person'),personId:z.string().min(1).max(100)}),
 z.object({kind:z.literal('talk_topic'),query:z.string().trim().min(3).max(300),minScore:z.number().min(0.55).max(0.95).default(0.68)}),
 z.object({kind:z.literal('post_topic'),query:z.string().trim().min(3).max(300),minScore:z.number().min(0.55).max(0.95).default(0.68)}),
 z.object({kind:z.literal('thread_activity'),postId:z.string().min(1).max(100)}),
 z.object({kind:z.literal('circle_new'),minMutuals:z.number().int().min(1).max(20).default(1)}),
 z.object({kind:z.literal('birthday'),daysBefore:z.number().int().min(0).max(14).default(0),timeZone:z.string().min(1).max(64).default('America/New_York')}),
 z.object({kind:z.literal('anniversary'),daysBefore:z.number().int().min(0).max(14).default(0),timeZone:z.string().min(1).max(64).default('America/New_York')}),
 z.object({kind:z.literal('credit_low'),thresholdNanos:z.number().int().min(0).max(100000000000).describe('Available USD nanodollars; 1,000,000,000 is $1.')}),
 z.object({kind:z.literal('storage_high'),thresholdBytes:z.number().int().min(1).max(67108864).describe('Account storage bytes; the account limit is 67,108,864 bytes (64 MiB).')}),
]);
export type NotificationRuleInput=z.infer<typeof notificationRule>;
export const notificationRuleOutput=z.object({id:z.uuid(),rule:notificationRule,enabled:z.boolean(),revision:z.number().int().positive(),createdAt:z.string(),indexing:z.boolean().optional(),targetName:z.string().optional()});
export const notificationRulesOutput=z.object({items:z.array(notificationRuleOutput),nextCursor:z.string().nullable()});
