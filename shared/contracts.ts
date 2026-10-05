import {logRelatedResult,logSearchResult} from './logSearch';
import {websiteSummary,websiteIconWeight,websitePath} from './website';
import {memoryOutputs} from './agentMemory';
import {billingActivityOutput} from './billingActivity';
import {storageAttachmentSchema} from './storage';
import {accountPreferencesSchema} from './preferences';
import {logOutputs} from './log';
import {notificationPreferences,notificationPreference,notificationRuleOutput,notificationRulesOutput} from './notificationSettings';
import {makeDraftOutput,makeDraftSummary,makeRenderOutput,makePublishOutput} from './make';
import {iouList,iouLedger,iouRecorded} from './ious';
import {spaceSchema,spacePageSchema,speakerRequestSchema,speakerRequestsSchema} from './spaces';
import {timeResolveOutput,timeConvertOutput,timeOverlapOutput} from './utilitySchemas';
import {customDocumentSchema} from './customMedia';
import { recordAttachmentSchema } from './recordContext';
import { automationSchema,automationValidationSchema } from './automations';
import { inboxItemSchema } from './inbox';
import { z } from 'zod';

const id = z.string();
export const areaOutput=z.object({cell:z.string(),label:z.string(),point:z.object({type:z.literal('Point'),coordinates:z.tuple([z.number(),z.number()])})});
export const profileOutput = z.object({ hasSharedHangouts:z.boolean().optional(), mutualCount:z.number().int().positive().optional(),mutualFriends:z.array(z.object({id,name:z.string(),photoId:z.string().optional()})).optional(),friendAction:z.enum(['invite','accept','invited','friend','unavailable']).optional(),connectionId:id.optional(),hidden:z.boolean().optional(), websiteUrl:z.url().optional(),mediaUrl:z.url().optional(),voiceFileId:id.optional(), id, handle: z.string().optional(), name: z.string(), city: z.string(), area:areaOutput.nullable().optional(), bio: z.string(), interests: z.array(z.string()), discoverable: z.boolean(), photos: z.array(z.string()).optional(), approximateMiles:z.number().optional(),sameArea:z.boolean().optional(),distanceLabel:z.string().optional() });
const author = z.object({ name: z.string(), handle: z.string().optional(), photoId: z.string().optional(), profileVisible:z.boolean().optional() });
export const postPhoto = z.object({ id, name: z.string(), url: z.string() });
const post = z.object({ id, saved:z.boolean().optional(), userId: id, text: z.string(), links:z.array(z.string()).default([]), photos: z.array(postPhoto).default([]), city: z.string(), area:areaOutput.nullable().optional(), createdAt: z.string(), author: author.optional(), approximateMiles:z.number().optional(),sameArea:z.boolean().optional(),distanceLabel:z.string().optional(), parentId:id.optional(),rootId:id.optional(),parent:z.object({id,text:z.string(),deleted:z.boolean(),author:author.optional()}).optional(),moderated:z.boolean().optional(),deleted:z.boolean().default(false),likeCount:z.number().default(0),liked:z.boolean().default(false),replyCount:z.number().default(0) });
const connection = z.object({ id, members: z.array(id), fromId: id, toId: id, note: z.string(), status: z.enum(['pending', 'accepted', 'declined', 'withdrawn', 'disconnected']), createdAt: z.string(), initialInvitation: z.object({fromId:id,note:z.string(),createdAt:z.string()}).optional(), disconnectedBy:id.optional(), disconnectedAt:z.string().optional(), respondedAt: z.string().optional(), updatedAt: z.string().optional(), lastMessage: z.object({ text: z.string(), fromId: id, createdAt: z.string() }).optional(), unread: z.boolean().optional() });
const message = z.object({ id, connectionId: id, fromId: id, text: z.string(), createdAt: z.string(), clientId:z.string().optional() });
const page = (item: z.ZodType) => z.object({ items: z.array(item), nextCursor: z.string().nullable() });
const wallet = z.object({ starterAvailableNanos: z.number().optional(), balanceNanos: z.number(), reservedNanos: z.number(), availableNanos: z.number(), entries: z.array(z.object({ id, amountNanos: z.number(), label: z.string(), createdAt: z.string(), details: z.record(z.string(), z.unknown()).optional() })) });
const upload=z.object({id,name:z.string(),originalName:z.string().optional().describe('Original filename, private to the owner and their authorized agent. Never publish this metadata.'),purpose:z.enum(['profile_photo','profile_voice','agent_input','log_media']),bytes:z.number(),mime:z.string(),sha256:z.string(),ready:z.boolean(),uploadUrl:z.string(),url:z.string().optional()});
const websiteSourceSummary=z.object({sourceId:z.string(),url:z.url(),kind:z.enum(['html','css','javascript']),bytes:z.number().int().nonnegative(),sha256:z.string(),title:z.string(),headings:z.array(z.string()),links:z.array(z.object({url:z.url(),label:z.string()})),resourceUrls:z.array(z.url()),mediaUrls:z.array(z.url()),updatedAt:z.string(),cached:z.boolean()});
const chatMessage = z.object({ id, role: z.enum(['user', 'assistant']), text: z.string(), files:z.array(upload).optional(), inbox:z.array(z.object({id,title:z.string()})).optional(), records:z.array(recordAttachmentSchema).optional(), createdAt: z.string(), source: z.enum(['app', 'external']), status: z.string().optional() });
export const resourceLinkOutput = z.object({ rel: z.enum(['open_in_newdrugs', 'download']), targetKind: z.enum(['exact', 'surface']), title: z.string(), url: z.url(), resourceType: z.string(), resourceId: z.string().optional() });
const searchMatch = z.object({ id, dataset:z.enum(['profiles','posts','replies','threads','spaces']), entityType:z.enum(['person','post','space']), entityId:id, ownerId:id, score:z.number(), evidence:z.array(z.object({field:z.string(),text:z.string(),entityId:id,entityType:z.enum(['person','post','space'])})), signals:z.object({semantic:z.number().optional(),lexical:z.number().optional(),freshness:z.number().optional(),distance:z.number().optional(),diversity:z.number().optional(),exact:z.boolean().optional()}), sourceHash:z.string(),sourceRevision:z.string(),record:z.union([profileOutput,post,spaceSchema]) });
const searchRetrieval = z.object({id,mode:z.enum(['hybrid','semantic','keyword','exact']),model:z.string(),dimensions:z.number(),indexVersion:z.string(),constraints:z.object({includeHidden:z.boolean().optional(),scope:z.enum(['public','friends','saved']).optional(),near:z.string().optional(),radiusMiles:z.number().optional(),authorId:z.string().optional(),after:z.string().optional(),beforeDate:z.string().optional()}),candidates:z.number(),incomplete:z.boolean(),notices:z.array(z.string()),indexedAt:z.string().optional(),approximate:z.boolean()});
const searchResult = z.object({matches:z.array(searchMatch),retrieval:searchRetrieval,nextCursor:z.string().nullable()});
export const outputs: Record<string, z.ZodType> = {
  ...logOutputs,
  'make.create':makeDraftSummary,'make.get':makeDraftOutput,'make.edit':makeDraftSummary,'make.render':makeRenderOutput,'make.publish':makePublishOutput,'make.discard':z.object({discarded:z.literal(true),draftId:z.uuid()}),
  'spaces.list':spacePageSchema,'spaces.get':spaceSchema,'spaces.create':spaceSchema,'spaces.end':spaceSchema,'spaces.offer_host':spaceSchema,'spaces.cancel_host_offer':spaceSchema,'spaces.accept_host':spaceSchema,'spaces.decline_host':spaceSchema,'spaces.requests':speakerRequestsSchema,'spaces.request_speak':speakerRequestSchema,'spaces.cancel_request':z.object({cancelled:z.literal(true)}),'spaces.respond_speaker':z.object({space:spaceSchema,personId:z.string(),approved:z.boolean()}),'spaces.revoke_speaker':z.object({space:spaceSchema,personId:z.string()}),'spaces.remove_person':z.object({space:spaceSchema,personId:z.string(),removed:z.literal(true)}),
  'access.get':z.object({source:z.enum(['browser','external','agent']),scope:z.enum(['read','write']),background:z.boolean(),credential:z.object({name:z.string(),createdAt:z.string().optional(),expiresAt:z.string().nullable()}).optional(),grants:z.object({privateAccess:z.boolean(),writeAccess:z.boolean()}).optional(),operations:z.object({read:z.array(z.string()),write:z.array(z.string()),confirmationRequired:z.array(z.string())})}),
  'account.preferences':accountPreferencesSchema,'account.preferences_update':accountPreferencesSchema,
  'ious.list':iouList,'ious.get':iouLedger,'ious.record':iouRecorded,
  'automations.validate':automationValidationSchema,
  'automations.create': automationSchema, 'automations.get': automationSchema, 'automations.update': automationSchema, 'automations.enable': automationSchema, 'automations.pause': automationSchema, 'automations.delete': automationSchema,
  'automations.list': z.object({ items: z.array(automationSchema) }), 'automations.run_now': z.object({ runId: id }),
  'automations.runs': page(z.object({ id, status: z.string(), outcome: z.string().optional(), createdAt: z.string(), costNanos: z.number(), usagePending: z.boolean(), reason: z.string().optional(), inboxId: z.string().optional(), sleep: z.object({ until: z.number(), reason: z.string() }).optional() })),
  'runs.wake': z.object({ resumed: z.boolean() }), 'runs.cancel': z.object({ ok: z.literal(true) }),
  'inbox.publish': inboxItemSchema, 'inbox.get': inboxItemSchema, 'inbox.mark_read': inboxItemSchema, 'inbox.archive': inboxItemSchema,
  'inbox.list': page(inboxItemSchema), 'inbox.delete': z.object({ deleted: z.literal(true) }),
  'links.text':z.object({url:z.string(),text:z.string()}),
  'links.preview': z.object({custom:customDocumentSchema.optional(), url: z.string(), hostname: z.string(), title: z.string(), description: z.string(), imageUrl: z.string().optional(),kind:z.enum(['image','video']).optional(),embed:z.object({provider:z.string(),src:z.string(),height:z.number(),video:z.boolean().optional()}).optional() }),
  'files.prepare':upload,'files.get':upload,'files.list':z.object({items:z.array(upload)}),
  'files.discard':z.object({discarded:z.literal(true),id}),
  'files.delete':z.object({deleted:z.literal(true),id,bytesFreed:z.number()}),
  ...memoryOutputs,
  'log.search':logSearchResult,
  'log.related':logRelatedResult,
  'website.get':z.object({site:websiteSummary.nullable()}),
  'website.delete':z.object({deleted:z.literal(true),siteId:z.string()}),
  'website.inspect':z.object({revision:z.number().int().positive(),pages:z.array(z.string()),files:z.number().int().nonnegative(),assets:z.number().int().nonnegative(),issues:z.array(z.object({path:websitePath,reference:z.string(),kind:z.enum(['missing','unsafe']),message:z.string()})),issuesCapped:z.boolean()}),
  'website.icons.search':z.object({family:z.literal('Phosphor Icons'),version:z.string(),items:z.array(z.object({name:z.string(),slug:z.string(),categories:z.array(z.string()),tags:z.array(z.string())}))}),
  'website.icons.get':z.object({name:z.string(),slug:z.string(),weight:websiteIconWeight,svg:z.string(),license:z.literal('MIT'),source:z.literal('Phosphor Icons')}),
  'website.source.open':websiteSourceSummary,
  'website.source.list':z.object({items:z.array(websiteSourceSummary)}),
  'website.source.read':z.object({sourceId:z.string(),url:z.url(),kind:z.enum(['html','css','javascript']),content:z.string(),offset:z.number().int().nonnegative(),totalCharacters:z.number().int().nonnegative(),nextOffset:z.number().int().nonnegative().nullable()}),
  'website.source.search':z.object({sourceId:z.string(),items:z.array(z.object({offset:z.number().int().nonnegative(),excerpt:z.string()}))}),
  'website.create':websiteSummary,'website.patch':websiteSummary,'website.asset.add':websiteSummary,'website.media.import':websiteSummary,'website.asset.remove':websiteSummary,'website.restore':websiteSummary,'website.publish':websiteSummary,'website.unpublish':websiteSummary,
  'website.file':z.object({path:websitePath,content:z.string(),revision:z.number().int().positive(),offset:z.number().int().nonnegative(),totalCharacters:z.number().int().nonnegative(),nextOffset:z.number().int().nonnegative().nullable()}),
  'website.search':z.object({revision:z.number().int().positive(),items:z.array(z.object({path:websitePath,offset:z.number().int().nonnegative(),excerpt:z.string()}))}),
  'website.revisions':z.object({currentRevision:z.number().int().positive(),items:z.array(z.object({revision:z.number().int().positive(),createdAt:z.string()}))}),
  'website.checkpoints':z.object({items:z.array(z.object({id:z.uuid(),label:z.string(),revision:z.number().int().positive(),createdAt:z.string()}))}),
  'website.checkpoint.file':z.object({path:websitePath,content:z.string(),revision:z.number().int().positive(),offset:z.number().int().nonnegative(),totalCharacters:z.number().int().nonnegative(),nextOffset:z.number().int().nonnegative().nullable()}),
  'website.checkpoint.create':z.object({id:z.uuid(),label:z.string(),revision:z.number().int().positive(),createdAt:z.string()}),
  'website.checkpoint.restore':websiteSummary,
  'website.checkpoint.delete':z.object({deleted:z.literal(true),checkpointId:z.uuid()}),
  'website.preview':z.object({previewUrl:z.url(),revision:z.number().int().positive()}),
  'storage.attachments':z.object({items:z.array(storageAttachmentSchema),nextCursor:z.string().nullable()}),
  'storage.list':z.object({indexing:z.boolean().optional(),usedBytes:z.number(),limitBytes:z.number(),items:z.array(z.union([upload.extend({kind:z.literal('upload').optional(),createdAt:z.string(),attached:z.boolean(),inProfile:z.boolean(),inWebsite:z.boolean().optional(),posterBytes:z.number().optional(),attachments:z.array(storageAttachmentSchema),attachmentCursor:z.string().nullable().optional()}),z.object({kind:z.literal('linked_video'),id:z.string(),sourceUrl:z.string(),title:z.string(),posterUrl:z.string().optional(),bytes:z.number(),createdAt:z.string(),postId:z.string(),attachments:z.array(storageAttachmentSchema),attachmentCursor:z.string().nullable().optional()})])),nextCursor:z.string().nullable()}),
  'locations.search':z.object({items:z.array(z.object({id:z.string(),label:z.string(),cell:z.string()})),attribution:z.string()}),
  'locations.resolve':areaOutput,
  'locations.meeting_area':z.object({participants:z.array(z.object({personId:id,name:z.string(),handle:z.string().optional(),area:areaOutput})),candidates:z.array(z.object({area:areaOutput,distances:z.array(z.object({personId:id,sameArea:z.boolean(),distanceLabel:z.string(),approximateMiles:z.number().optional()}))})),method:z.string(),notice:z.string()}),
  'time.resolve':timeResolveOutput,'time.convert':timeConvertOutput,'time.overlap':timeOverlapOutput,
  'people.context':z.object({person:profileOutput.nullable(),profileAvailable:z.boolean(),connection:connection.nullable(),recentPosts:page(post)}),
  'activity.since':z.object({items:z.array(z.object({id,kind:z.enum(['invitation','connection_accepted','connection_declined','message','post_reply','post_like','log_entry']),createdAt:z.string(),actor:z.object({id,name:z.string(),handle:z.string().optional()}).nullable(),sourceId:id,text:z.string(),textTruncated:z.boolean(),postId:id.optional(),connectionId:id.optional(),entryId:id.optional(),link:resourceLinkOutput})),since:z.string(),until:z.string(),nextCursor:z.string().nullable(),notice:z.string()}),
  'identity.get': profileOutput, 'profile.update': profileOutput, 'people.get': profileOutput,
  'people.mutuals':page(z.object({id,name:z.string(),photoId:z.string().optional()})),
  'people.hide':z.object({personId:id,hidden:z.boolean()}),
  'app.open': z.object({ open: z.string(),logMonth:z.string().optional(),logScope:z.enum(['all','private','shared','invitations']).optional(),personId:z.string().optional(),date:z.string().optional(), resourceId: z.string().optional(), messageId:z.string().optional(), postIds:z.array(z.string()).optional(), areaCell:z.string().optional(),radiusMiles:z.number().optional(), query:z.string().optional(),scope:z.enum(['all','nearby','own','friends','saved']).optional(),waitForCompletion: z.boolean() }),
  'search.query':searchResult, 'posts.search':searchResult, 'search.similar':searchResult, 'search.refine':searchResult,
  'search.global':z.object({items:z.array(z.object({source:z.enum(['public','log','chat','messages']),kind:z.enum(['person','post','talk','log','chat','message']),id,title:z.string(),snippet:z.string(),url:z.url(),score:z.number()})),notices:z.array(z.object({source:z.enum(['public','log','chat','messages']),text:z.string()})),errors:z.array(z.object({source:z.enum(['public','log','chat','messages']),message:z.string()}))}),
  'search.explain':z.object({match:searchMatch,retrieval:searchRetrieval}),
  'search.datasets':z.object({datasets:z.array(z.object({dataset:z.string(),count:z.number()})),pending:z.number(),failed:z.number(),model:z.string(),dimensions:z.number(),indexVersion:z.string(),capacity:z.number().nullable().describe("Fixed fallback capacity, or null for provisioned persistent retrieval."),notice:z.string()}),
  'people.search': page(profileOutput).extend({retrieval:searchRetrieval.optional(),matches:z.array(searchMatch).optional(),indexing:z.boolean().optional()}), 'posts.list': page(post), 'posts.get': post, 'posts.ancestors':z.object({items:z.array(post).max(50),earlierId:id.nullable(),unavailable:z.boolean()}), 'posts.create': post,
  'posts.incoming_replies':page(post),'posts.thread_updates':page(post),
  'posts.save':post, 'posts.replies': page(post), 'posts.reply': post, 'posts.like': post,
  'posts.delete': z.object({ deleted: z.literal(true), id }),
  'connections.list': page(connection).extend({ people: z.array(profileOutput) }),
  'connections.status': z.object({ connection: connection.nullable() }),
  'connections.get': z.object({ connection, people: z.array(profileOutput) }),
  'connections.request': connection, 'connections.respond': connection, 'connections.withdraw': connection, 'connections.disconnect': connection, 'messages.get': message, 'messages.window':z.object({items:z.array(message),targetId:id,connection,people:z.array(profileOutput),olderCursor:id.nullable(),newerCursor:id.nullable()}), 'messages.search':z.object({items:z.array(z.object({id,connectionId:id,fromId:id,text:z.string(),createdAt:z.string(),score:z.number(),person:z.object({id,name:z.string(),handle:z.string().optional(),photoId:z.string().optional()})})),nextCursor:id.nullable(),mode:z.enum(['hybrid','keyword']),indexing:z.boolean(),notices:z.array(z.string())}), 'messages.list': page(message), 'messages.send': message,
  'messages.mark_read': z.object({ read: z.literal(true), throughMessageId: z.string().optional() }),
  'notifications.list': z.object({ unread: z.number(), unreadCapped:z.boolean().optional(),nextCursor:z.string().nullable().optional(), items: z.array(z.object({ id, kind: z.enum(['invitation', 'message', 'call', 'connection_accepted', 'review', 'post_like', 'post_reply', 'agent_update', 'automation_status', 'log_invitation', 'log_update', 'log_added', 'iou', 'alert']), title: z.string(), text: z.string(), createdAt: z.string(), photoId:z.string().optional(), connectionId: z.string().optional(), callId:z.string().optional(),callActive:z.boolean().optional(), read: z.boolean(), link: resourceLinkOutput })) }),
  'notifications.read': z.object({ read: z.literal(true) }),
  'notifications.read_all':z.object({read:z.literal(true),readAt:z.string()}),
  'notifications.preferences':notificationPreferences,'notifications.preference_set':notificationPreference,
  'notifications.rules':notificationRulesOutput,'notifications.rule_create':notificationRuleOutput,'notifications.rule_set':notificationRuleOutput,'notifications.rule_delete':z.object({deleted:z.literal(true),id:z.uuid()}),
  'people.block': z.object({ personId: id, blocked: z.boolean() }), 'people.report': z.object({ id, status: z.literal('unreviewed') }),
  'people.blocked': page(z.object({ id, personId: id, name: z.string(), handle: z.string().optional(), createdAt: z.string() })),
  'push.devices': z.object({ items: z.array(z.object({ id, deviceId: z.uuid(), createdAt: z.string() })) }),
  'push.revoke': z.object({ enabled: z.literal(false) }),
  'conversation.search': z.object({ items: z.array(z.object({ id, role: z.enum(['user', 'assistant']), text: z.string(), createdAt: z.string(), score: z.number() })), nextCursor: z.string().nullable(), mode: z.enum(['hybrid', 'keyword']), indexing: z.boolean(), notices: z.array(z.string()) }),
  'conversation.window': z.object({ items: z.array(chatMessage), targetId: id, olderCursor: z.string().nullable(), newerCursor: z.string().nullable() }),
  'wallet.activity':billingActivityOutput,'wallet.get': wallet, 'conversation.list': z.object({ items: z.array(chatMessage), nextCursor: z.string().nullable() }), 'conversation.append': chatMessage,
  'agent.actions.list': page(z.object({ id, operation: z.string(), source: z.string(), createdAt: z.string(), result: z.unknown() })),
};
export const consequences: Record<string, string> = {
  'ious.record':'Add this exact amount and reason to the shared IOU history and notify the other person. It records an amount or an outside settlement.',
  'website.delete':'Permanently delete your website, including its draft, saved revisions, checkpoints and published copy. Its preview and public pages will stop working. Uploaded media stays in Storage.',
  'website.publish':'Publish this exact website draft revision on your public username and permanent code addresses.',
  'website.unpublish':'Take the currently published website offline. The private draft and revision history remain.',
  'website.checkpoint.delete':'Permanently delete this saved website checkpoint. The current draft and published site remain.',
  'spaces.create':'Start a public live-audio Space with this title. People outside your friends can join and listen.',
  'spaces.end':'End this public live-audio Space for everyone.',
  'spaces.accept_host':'Become host of this live Talk space. You gain moderation and End controls; the prior host remains a speaker and everyone stays connected.',
  'spaces.respond_speaker':'Grant or decline this person’s microphone access in your public Space.',
  'spaces.remove_person':'Remove this person from your Space and prevent them from rejoining it.',
  'agent.instructions.update':'Replace your personal instructions used by future agent runs.',
  'log.add_person':'Add this person to the shared hangout. They can see it and add their own note/photos. Other attendees keep their contributions.',
  'log.join':'Join this shared hangout as yourself. Its attendees can see your participation, and you can log future hangouts together.',
  'log.delete':'Remove your own participation and contribution, permanently deleting your attached media and freeing its storage. Other attendees keep the hangout. The final attendee removes the empty hangout.',
  'log.leave':'Remove your own participation and contribution, permanently deleting your attached media and freeing its storage. Other attendees keep the hangout. The final attendee removes the empty hangout.',

  'automations.create': 'Create and activate this automation with the displayed schedule, access and AI spending limits. With write access, future runs can make app changes without another per-action confirmation. Hosted runs use your credits, including runs that finish silently.',
  'automations.enable': 'Enable this saved automation with its displayed schedule, access and AI spending limits. With write access, future runs can make app changes without another per-action confirmation. Hosted runs use your credits, including runs that finish silently.',
  'inbox.delete': 'Permanently delete this inbox update. Its links in your chat will stop opening the update.',
  'files.delete': 'Permanently delete this file. It will be removed from attached posts and Log entries, and existing chat attachments will no longer open; a current profile photo will also be removed from the profile.',
  'posts.create': 'Publish this exact text and its attachments publicly.', 'posts.delete': 'Permanently delete this post.',
  'posts.reply': 'Publish this exact reply and its attachments to the selected public post.',
  'connections.disconnect': 'End this connection and stop new messages. Both people retain the existing conversation. Only you can initiate reconnection.',
  'connections.request': 'Send this invitation and note to the selected person.',
  'connections.respond': 'Accept or decline this invitation. Accepting opens direct messages.',
  'people.report': 'Submit this report for operator review.',
};
