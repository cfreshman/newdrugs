import { MongoClient, type ClientSession, type Db } from 'mongodb';
import { config } from './config';

export const mongo = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
let database: Db;
export interface Row { _id: string; [key: string]: unknown }
export function db() { if (!database) throw new Error('Database is not connected.'); return database; }
export function rows<T extends { _id: string } = Row>(name: string) { return db().collection<T>(name); }
export async function transaction<T>(run: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = mongo.startSession();
  try { return await session.withTransaction(() => run(session), { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } }) as T; }
  finally { await session.endSession(); }
}
export async function connectDatabase(name?: string) {
  await mongo.connect();
  database = mongo.db(name);
  const hello = await database.admin().command({ hello: 1 });
  if (!hello.setName) throw new Error('The cloud MongoDB connection needs a replica set for atomic credits.');
  await Promise.all([
    rows('agentSessionCleanup').createIndex({ availableAt: 1 }),
    rows('automations').createIndex({ status: 1, nextRunAt: 1 }),
    rows('automations').createIndex({ userId: 1, createdAt: -1 }),
    rows('runs').createIndex({ automationId: 1, userId: 1, createdAt: -1, _id: -1 }),
    rows('runs').createIndex({ status: 1, 'sleep.until': 1 }),
    rows('agentInbox').createIndex({ userId: 1, createdAt: -1, _id: -1 }),
    rows('agentInbox').createIndex({ userId: 1, archivedAt: 1, readAt: 1 }),
    rows('agentInbox').createIndex({ runId: 1 }, { unique: true, partialFilterExpression: { runId: { $type: 'string' } } }),
    rows('chatSearchChunks').createIndex({ userId: 1, indexVersion: 1, role: 1 }),
    rows('chatSearchChunks').createIndex({ userId: 1, messageId: 1 }),
    rows('chatSearchJobs').createIndex({ availableAt: 1 }),
    rows('chatSearchJobs').createIndex({ userId: 1, messageId: 1 }),
    rows('chatSearchResults').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    rows('chatSearchResults').createIndex({ userId: 1, expiresAt: -1 }),
    rows('pushSubscriptions').createIndex({ userId: 1, revokedAt: 1 }),
    rows('pushSubscriptions').createIndex({ sessionId: 1 }),
    rows('pushOutbox').createIndex({ status: 1, availableAt: 1 }),
    rows('pushOutbox').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    rows('users').createIndex({ suspendedAt: 1 }),
    rows('users').createIndex({createdAt:-1,_id:-1},{partialFilterExpression:{handle:{$type:'string'}}}),
    rows('users').createIndex({ handle: 1 }, { unique: true, partialFilterExpression: { handle: { $type: 'string' } } }),
    rows('users').createIndex({ discoverable: 1, cityKey: 1, _id: 1 }),
    rows('users').createIndex({ 'area.point':'2dsphere' }),
    rows('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    rows('tokens').createIndex({ userId: 1, createdAt: -1 }),
    rows('tokens').createIndex({ hash: 1 }, { unique: true }),
    rows('messages').createIndex({ userId: 1, createdAt: -1, _id: -1 }),
    rows('ledger').createIndex({ userId: 1, createdAt: -1 }),
    rows('runs').createIndex({ userId: 1, status: 1 }),
    rows('runs').createIndex({ status: 1, nextAttempt: 1, updatedAt: 1 }),
    rows('agentCredentials').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    rows('operationEmbeddings').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ...['postSaves'].map(name=>rows(name).createIndex({userId:1,targetId:1},{unique:true})),
    ...['postSaves'].map(name=>rows(name).createIndex({userId:1,createdAt:-1,_id:-1})),
    rows('posts').createIndex({ cityKey: 1, _id: -1 }),
    rows('posts').createIndex({ 'area.point':'2dsphere' }),
    rows('posts').createIndex({ userId: 1, _id: -1 }),
    rows('posts').createIndex({userId:1,rootId:1}),
    rows('postLikes').createIndex({createdAt:-1,_id:-1}),
    rows('posts').createIndex({ parentId: 1, deletedAt: 1, _id: -1 }),
    rows('postLikes').createIndex({ postId: 1, userId: 1 }, { unique: true }),
    rows('posts').createIndex({ fileIds: 1, deletedAt: 1 }),
    rows('linkPreviews').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    rows('linkPreviewRates').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    rows('connections').createIndex({ members: 1, _id: -1 }),
    rows('connections').createIndex({ members: 1, updatedAt: -1, _id: -1 }),
    rows('connections').createIndex({ toId: 1, status: 1, createdAt: -1 }),
    rows('notifications').createIndex({ userId: 1, readAt: 1, createdAt: -1 }),
    rows('uploads').createIndex({ retained: 1, expiresAt: 1 }),
    rows('uploads').createIndex({ userId: 1, _id: -1 }),
    rows('directMessages').createIndex({ connectionId: 1, _id: -1 }),
    rows('blocks').createIndex({ members: 1 }),
    rows('searchOutbox').createIndex({ status: 1, availableAt: 1 }),
    rows('searchDocuments').createIndex({ indexVersion: 1, indexedAt: -1, _id: 1 }),
    rows('searchDocuments').createIndex({ dataset: 1, ownerId: 1 }),
    rows('searchQueryVectors').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    rows('searchRetrievals').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    rows('searchRetrievals').createIndex({ userId: 1, expiresAt: -1 }),
    rows('searchRates').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    rows('receipts').createIndex({ userId: 1, createdAt: -1 }),
  ]);
}
