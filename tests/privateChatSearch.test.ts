import { beforeAll, beforeEach, afterAll, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { connectDatabase, rows, db, mongo, transaction } from '../server/db';
import { createGuest, users, type Actor } from '../server/auth';
import { ensureStarterPool } from '../server/starterPool';
import { indexChatMessage, enqueueChatSearch, searchChat, backfillChatSearch, chatPassages } from '../server/search/chat';
import { conversationWindow, executeOperation } from '../server/operations';
import { DIMENSIONS } from '../server/search/model';
import { searchPublic } from '../server/search/retrieve';
import { resetIndex } from '../server/search/index';
import { buildResourceLinks } from '../server/resourceLinks';
import { parseDestination } from '../shared/navigation';
const provider = vi.hoisted(() => ({ embed: vi.fn(async (text: string) => { const vector = Array(512).fill(0); vector[/bike|cycling|bicycle/i.test(text) ? 0 : 1] = 1; return vector; }) }));
vi.mock('../server/search/embeddings', () => ({ embed: provider.embed }));
async function clean() { if (db().databaseName !== 'newdrugs_test') throw Error('Isolated cloud tests only.'); resetIndex(); for (const collection of await db().collections()) await collection.deleteMany({}); }
beforeAll(async () => { await connectDatabase(); });
beforeEach(async () => { await clean(); await ensureStarterPool(); provider.embed.mockClear(); });
afterAll(async () => { await clean(); await mongo.close(); });
async function person() { const user = await createGuest(); await users().updateOne({ _id: user._id }, { $set: { handle: `chat_${randomUUID().slice(0, 8)}` } }); return { userId: user._id, source: 'external', scope: 'write' } as Actor; }
async function message(actor: Actor, text: string, role = 'user', id = randomUUID(), time = Date.now()) {
  await transaction(async session => { await rows('messages').insertOne({ _id: id, userId: actor.userId, role, text, source: 'app', createdAt: new Date(time).toISOString() }, { session }); await enqueueChatSearch(actor.userId, id, session); });
  return id;
}
it('finds user and agent messages semantically, while keeping other accounts and public search separate', async () => {
  const me = await person(), other = await person();
  const first = await message(me, 'I want to try cycling this weekend.'), reply = await message(me, 'A bicycle ride near the river could work.', 'assistant');
  const privateOther = await message(other, 'My secret cycling plan');
  await message(me, 'A cooking class might also be fun.');
  while (await indexChatMessage());
  const result = await searchChat({ query: 'bike outings' }, me);
  expect(result.items.map(item => item.id)).toEqual(expect.arrayContaining([first, reply]));
  expect(result.items.some(item => item.id === privateOther)).toBe(false);
  expect(result.items.some(item => item.text.includes('cooking'))).toBe(false);
  expect((await searchChat({ query: 'bike outings', role: 'assistant' }, me)).items.map(item => item.id)).toEqual([reply]);
  expect(provider.embed.mock.calls.some(call => (call as unknown[])[2] === `chat:${me.userId}`)).toBe(true);
  const publicResult = await searchPublic({ query: 'bike outings', datasets: ['posts','profiles'], mode: 'hybrid', limit: 20 }, me);
  expect(publicResult.matches).toEqual([]); expect(await rows('searchDocuments').countDocuments()).toBe(0);
  const links = buildResourceLinks('conversation.search', { query: 'bike outings' }, result, me);
  expect(links.every(link => link.targetKind === 'exact')).toBe(true);
  expect(parseDestination(links[0].url, 'https://dev.druggie.org')).toMatchObject({ view: 'chat', resourceId: result.items[0].id });
});
it('searches later passages, rechecks live ownership/content and isolates pagination', async () => {
  const me = await person(), other = await person();
  await message(me, 'cycling one'); await message(me, 'cycling two');
  const long = await message(me, `${'food '.repeat(600)}cycling bicycle weekend`, 'assistant');
  while (await indexChatMessage());
  const page = await searchChat({ query: 'bike', limit: 1 }, me);
  expect(page.nextCursor).not.toBeNull();
  await expect(searchChat({ query: 'bike', limit: 1, cursor: page.nextCursor! }, other)).rejects.toThrow();
  await expect(searchChat({ query: 'changed', limit: 1, cursor: page.nextCursor! }, me)).rejects.toMatchObject({ code: 'search_changed' });
  const result = await searchChat({ query: 'bike' }, me);
  expect(result.items.map(item => item.id)).toContain(long);
  await rows('messages').deleteMany({ userId: me.userId });
  expect((await searchChat({ query: 'bike' }, me)).items).toEqual([]);
});
it('refuses cross-account context windows and reads adjacent pages without gaps', async () => {
  const me = await person(), other = await person();
  const messages = Array.from({ length: 100 }, (_, i) => ({ _id: `message-${String(i).padStart(3, '0')}`, userId: me.userId, role: i % 2 ? 'assistant' : 'user', text: `Row ${i}`, source: 'app', createdAt: new Date(1700000000000 + i * 1000).toISOString() }));
  await rows('messages').insertMany(messages);
  const window = await conversationWindow(me.userId, 'message-050');
  expect(window.items.map(item => item.id)).toEqual(messages.slice(30, 71).map(item => item._id));
  expect(window).toMatchObject({ olderCursor: 'message-030', newerCursor: 'message-070' });
  await expect(conversationWindow(other.userId, 'message-050')).rejects.toThrow();
  const next = await executeOperation('conversation.list', { after: window.newerCursor, limit: 30 }, me) as { items: { id: string }[]; nextCursor: string | null };
  expect(next.items.map(item => item.id)).toEqual(messages.slice(71).map(item => item._id)); expect(next.nextCursor).toBeNull();
  await expect(executeOperation('conversation.list', { after: 'message-050' }, other)).rejects.toThrow();
});
it('backfills old messages and discards a source that changes during embedding', async () => {
  const me = await person();
  await rows('messages').insertOne({ _id: 'intro', userId: me.userId, role: 'assistant', text: 'Welcome', kind: 'introduction', source: 'app', createdAt: new Date().toISOString() });
  const id = await message(me, 'cycling initial'); await rows('chatSearchJobs').deleteMany({});
  await backfillChatSearch(); expect(await rows('chatSearchJobs').countDocuments()).toBe(1);
  let edited = false;
  await indexChatMessage(async () => { if (!edited) { edited = true; await transaction(async session => { await rows('messages').updateOne({ _id: id }, { $set: { text: 'cooking instead' } }, { session }); await enqueueChatSearch(me.userId, id, session); }); } return [1, ...Array(DIMENSIONS - 1).fill(0)]; });
  expect(await rows('chatSearchChunks').countDocuments()).toBe(0);
  await indexChatMessage(); expect((await searchChat({ query: 'cooking' }, me)).items).toHaveLength(1);
  const parts = chatPassages('a'.repeat(10000)); expect(parts.at(-1)!.offset + parts.at(-1)!.text.length).toBe(10000);
});
it('enqueues external conversation writes atomically and reports a keyword fallback honestly', async () => {
  const me = await person();
  const saved = await executeOperation('conversation.append', { role: 'user', text: 'cycling near the river' }, me, randomUUID()) as { id: string };
  expect(await rows('chatSearchJobs').findOne({ userId: me.userId, messageId: saved.id })).not.toBeNull();
  const result = await searchChat({ query: 'cycling' }, me, async () => { throw Error('embedding_unavailable'); });
  expect(result.mode).toBe('keyword'); expect(result.items[0].id).toBe(saved.id); expect(result.notices.join(' ')).toContain('temporarily unavailable');
});

it('requires actual word evidence for fresh chat fallback and never re-adds indexed rejects',async()=>{
 const me=await person();const substring=await message(me,'search profiles');
 const queryVector=async()=>[1,...Array(511).fill(0)];
 expect((await searchChat({query:'sea'},me,queryVector)).items).toEqual([]);
 const relevant=await message(me,'sea outings');
 expect((await searchChat({query:'sea'},me,queryVector)).items.map(item=>item.id)).toEqual([relevant]);
 while(await indexChatMessage());
 expect((await searchChat({query:'sea'},me,queryVector)).items.some(item=>item.id===substring)).toBe(false);
});
