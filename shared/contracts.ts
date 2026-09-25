import { z } from 'zod';

const id = z.string();
export const areaOutput=z.object({cell:z.string(),label:z.string(),point:z.object({type:z.literal('Point'),coordinates:z.tuple([z.number(),z.number()])})});
export const profileOutput = z.object({ id, handle: z.string().optional(), name: z.string(), city: z.string(), area:areaOutput.nullable().optional(), bio: z.string(), interests: z.array(z.string()), discoverable: z.boolean(), photos: z.array(z.string()).optional(), approximateMiles:z.number().optional(),sameArea:z.boolean().optional(),distanceLabel:z.string().optional() });
const author = z.object({ name: z.string(), handle: z.string().optional(), photoId: z.string().optional() });
const post = z.object({ id, userId: id, text: z.string(), city: z.string(), area:areaOutput.nullable().optional(), createdAt: z.string(), author: author.optional(), approximateMiles:z.number().optional(),sameArea:z.boolean().optional(),distanceLabel:z.string().optional(), parentId:id.optional(),rootId:id.optional(),parent:z.object({id,text:z.string(),deleted:z.boolean(),author:author.optional()}).optional(),deleted:z.boolean().default(false),likeCount:z.number().default(0),liked:z.boolean().default(false),replyCount:z.number().default(0) });
const connection = z.object({ id, members: z.array(id), fromId: id, toId: id, note: z.string(), status: z.enum(['pending', 'accepted', 'declined', 'withdrawn']), createdAt: z.string(), respondedAt: z.string().optional(), updatedAt: z.string().optional(), lastMessage: z.object({ text: z.string(), fromId: id, createdAt: z.string() }).optional(), unread: z.boolean().optional() });
const message = z.object({ id, connectionId: id, fromId: id, text: z.string(), createdAt: z.string(), clientId:z.string().optional() });
const page = (item: z.ZodType) => z.object({ items: z.array(item), nextCursor: z.string().nullable() });
const wallet = z.object({ balanceNanos: z.number(), reservedNanos: z.number(), availableNanos: z.number(), entries: z.array(z.object({ id, amountNanos: z.number(), label: z.string(), createdAt: z.string(), details: z.record(z.string(), z.unknown()).optional() })) });
const upload=z.object({id,name:z.string(),purpose:z.enum(['profile_photo','agent_input']),bytes:z.number(),mime:z.string(),sha256:z.string(),ready:z.boolean(),uploadUrl:z.string(),url:z.string().optional()});
const chatMessage = z.object({ id, role: z.enum(['user', 'assistant']), text: z.string(), files:z.array(upload).optional(), createdAt: z.string(), source: z.enum(['app', 'external']), status: z.string().optional() });
export const resourceLinkOutput = z.object({ rel: z.enum(['open_in_newdrugs', 'download']), targetKind: z.enum(['exact', 'surface']), title: z.string(), url: z.url(), resourceType: z.string(), resourceId: z.string().optional() });
const searchMatch = z.object({ id, dataset:z.enum(['profiles','posts','replies','threads']), entityType:z.enum(['person','post']), entityId:id, ownerId:id, score:z.number(), evidence:z.array(z.object({field:z.string(),text:z.string(),entityId:id,entityType:z.enum(['person','post'])})), signals:z.object({semantic:z.number().optional(),lexical:z.number().optional(),freshness:z.number().optional(),distance:z.number().optional(),diversity:z.number().optional(),exact:z.boolean().optional()}), sourceHash:z.string(),sourceRevision:z.string(),record:z.union([profileOutput,post]) });
const searchRetrieval = z.object({id,mode:z.enum(['hybrid','semantic','keyword','exact']),model:z.string(),dimensions:z.number(),indexVersion:z.string(),constraints:z.object({near:z.string().optional(),radiusMiles:z.number().optional(),authorId:z.string().optional(),after:z.string().optional(),beforeDate:z.string().optional()}),candidates:z.number(),incomplete:z.boolean(),notices:z.array(z.string()),indexedAt:z.string().optional(),approximate:z.boolean()});
const searchResult = z.object({matches:z.array(searchMatch),retrieval:searchRetrieval,nextCursor:z.string().nullable()});
export const outputs: Record<string, z.ZodType> = {
  'files.prepare':upload,'files.get':upload,'files.list':z.object({items:z.array(upload)}),
  'files.discard':z.object({discarded:z.literal(true),id}),
  'files.delete':z.object({deleted:z.literal(true),id,bytesFreed:z.number()}),
  'storage.list':z.object({usedBytes:z.number(),limitBytes:z.number(),items:z.array(upload.extend({createdAt:z.string(),attached:z.boolean(),inProfile:z.boolean()})),nextCursor:z.string().nullable()}),
  'locations.search':z.object({items:z.array(z.object({id:z.string(),label:z.string(),cell:z.string()})),attribution:z.string()}),
  'locations.resolve':areaOutput,
  'identity.get': profileOutput, 'profile.update': profileOutput, 'people.get': profileOutput,
  'app.open': z.object({ open: z.string(), resourceId: z.string().optional(), postIds:z.array(z.string()).optional(), areaCell:z.string().optional(),radiusMiles:z.number().optional(), query:z.string().optional(),scope:z.enum(['all','nearby','own']).optional(),waitForCompletion: z.boolean() }),
  'search.query':searchResult, 'posts.search':searchResult, 'search.similar':searchResult, 'search.refine':searchResult,
  'search.explain':z.object({match:searchMatch,retrieval:searchRetrieval}),
  'search.datasets':z.object({datasets:z.array(z.object({dataset:z.string(),count:z.number()})),pending:z.number(),failed:z.number(),model:z.string(),dimensions:z.number(),indexVersion:z.string(),capacity:z.number(),notice:z.string()}),
  'people.search': page(profileOutput).extend({retrieval:searchRetrieval.optional(),matches:z.array(searchMatch).optional()}), 'posts.list': page(post), 'posts.get': post, 'posts.create': post,
  'posts.replies': page(post), 'posts.reply': post, 'posts.like': post,
  'posts.delete': z.object({ deleted: z.literal(true), id }),
  'connections.list': page(connection).extend({ people: z.array(profileOutput) }),
  'connections.status': z.object({ connection: connection.nullable() }),
  'connections.get': z.object({ connection, people: z.array(profileOutput) }),
  'connections.request': connection, 'connections.respond': connection, 'connections.withdraw': connection, 'messages.list': page(message), 'messages.send': message,
  'messages.mark_read': z.object({ read: z.literal(true), throughMessageId: z.string().optional() }),
  'notifications.list': z.object({ unread: z.number(), items: z.array(z.object({ id, kind: z.enum(['invitation', 'message', 'connection_accepted', 'review', 'post_like', 'post_reply']), title: z.string(), text: z.string(), createdAt: z.string(), connectionId: z.string().optional(), link: resourceLinkOutput })) }),
  'notifications.read': z.object({ read: z.literal(true) }),
  'people.block': z.object({ personId: id, blocked: z.boolean() }), 'people.report': z.object({ id, status: z.literal('unreviewed') }),
  'people.blocked': page(z.object({ id, personId: id, name: z.string(), handle: z.string().optional(), createdAt: z.string() })),
  'wallet.get': wallet, 'conversation.list': z.object({ items: z.array(chatMessage) }), 'conversation.append': chatMessage,
  'agent.actions.list': page(z.object({ id, operation: z.string(), source: z.string(), createdAt: z.string(), result: z.unknown() })),
};
export const consequences: Record<string, string> = {
  'files.delete': 'Permanently delete this file. Existing chat attachments will no longer open; a current profile photo will also be removed from the profile.',
  'posts.create': 'Publish this exact text publicly.', 'posts.delete': 'Permanently delete this post.',
  'posts.reply': 'Publish this exact reply to the selected public post.',
  'connections.request': 'Send this invitation and note to the selected person.',
  'connections.respond': 'Accept or decline this invitation. Accepting opens direct messages.',
  'people.report': 'Submit this report for operator review.',
};
