import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type OpenAI from 'openai';
import type { AgentSessionEvent } from 'openai/resources/beta/agents/agents';
import { connectDatabase, db, rows, mongo } from '../server/db';
import { createGuest } from '../server/auth';
import { reserveRun, runs, wallet } from '../server/wallet';
import { processRun } from '../server/agent';
import { ensureStarterPool } from '../server/starterPool';

async function clean() { if (db().databaseName !== 'newdrugs_test') throw new Error('Only isolated cloud tests are allowed.'); for (const collection of await db().collections()) await collection.deleteMany({}); }
beforeAll(async () => { await connectDatabase(); await clean(); });
beforeEach(async () => { await clean(); await ensureStarterPool(); });
afterAll(async () => { await clean(); await mongo.close(); });

it.each([false, true])('streams both existing and fresh conversation-only sessions (fresh: %s)', async freshSession => {
  const user = await createGuest(), id = `${user._id}:${randomUUID()}`;
  await reserveRun(user._id, id, 'A synthetic stream test');
  await runs().updateOne({ _id: id }, { $set: { status: 'running', lease: 'lease', leaseUntil: Date.now() + 60000, ...(!freshSession ? { providerSessionId: 'session' } : {}), inputSubmitted: false } });
  const run = (await runs().findOne({ _id: id }))!;
  let subscribed = false, ended = false, wake: (() => void) | undefined;
  const queue: AgentSessionEvent[] = [];
  const emit = (type: string, data: Record<string, unknown>) => { queue.push({ type, event_id: randomUUID(), session_id: 'session', turn_id: 'turn', ...data } as AgentSessionEvent); wake?.(); };
  const controller = new AbortController();
  controller.signal.addEventListener('abort', () => { ended = true; wake?.(); });
  const stream = { controller, async *[Symbol.asyncIterator]() {
    subscribed = true;
    while (!ended) { if (queue.length) yield queue.shift()!; else await new Promise<void>(resolve => { wake = resolve; }); }
  } };
  const turn = { id: 'turn', status: 'in_progress', subagent_id: null, usage: null };
  const create = vi.fn(async () => { expect(subscribed).toBe(true); emit('agent.session.turn.created', { turn }); });
  const createSession = vi.fn(async (input: Record<string, unknown>) => {
    expect(input.stream).toBe(true); expect(JSON.stringify(input.input)).toContain('Current user request:\\nA synthetic stream test');
    emit('agent.session.created', { session: { id: 'session' }, session_id: undefined });
    emit('agent.session.turn.created', { turn });
    return stream;
  });
  const list = vi.fn(() => { throw new Error('A fresh stream must not start by replacing live state with history.'); });
  const client = { beta: { agents: { sessions: { create: createSession, events: { stream: async () => stream, create }, turns: { list }, items: { list } } } } } as unknown as OpenAI;
  const processing = processRun(run, client);
  try {
    await vi.waitFor(() => expect(freshSession ? createSession : create).toHaveBeenCalledOnce());
    emit('agent.session.turn.item.added', { item: { id: 'answer', type: 'message', role: 'assistant', phase: 'final_answer', status: 'in_progress', content: [], turn_id: 'turn' } });
    emit('agent.session.turn.output_text.delta', { item_id: 'answer', content_index: 0, output_index: 0, delta: 'Here is ' });
    await vi.waitFor(async () => expect((await runs().findOne({ _id: id }))?.draft).toBe('Here is '), { timeout: 5000 });
    emit('agent.session.turn.output_text.delta', { item_id: 'answer', content_index: 0, output_index: 0, delta: 'the answer.' });
    emit('agent.session.turn.output_text.done', { item_id: 'answer', content_index: 0, output_index: 0, text: 'Here is the answer.' });
    const usage = { input_tokens: 1000, input_tokens_details: { cached_tokens: 100 }, output_tokens: 100, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: 1100 };
    emit('agent.session.turn.completed', { turn: { ...turn, status: 'completed', usage }, usage });
    await processing;
    expect(await runs().findOne({ _id: id })).toMatchObject({ status: 'completed', draft: 'Here is the answer.', chargedNanos: 141000 });
    expect(await wallet(user._id)).toMatchObject({ balanceNanos: 1e9 - 141000, reservedNanos: 0 });
    expect(await rows('messages').countDocuments({ _id: `${id}:assistant` })).toBe(1);
    expect(list).not.toHaveBeenCalled();
    if (freshSession) expect(create).not.toHaveBeenCalled();
  } finally { controller.abort(); await processing; }
});

it('preserves a complete answer when recovery cancels a provider turn that stayed open', async () => {
  const user = await createGuest(), id = `${user._id}:${randomUUID()}`;
  await reserveRun(user._id, id, 'A synthetic recovery test');
  await runs().updateOne({ _id: id }, { $set: { status: 'running', lease: 'lease', leaseUntil: Date.now() + 60000, providerSessionId: 'session', providerTurnId: 'turn', inputSubmitted: true, finalRecovery: true, outputComplete: true, draft: 'The verified final answer.' } });
  const controller = new AbortController();
  const stream = { controller, async *[Symbol.asyncIterator]() { if (!controller.signal.aborted) await new Promise<void>(resolve => controller.signal.addEventListener('abort', () => resolve(), { once: true })); } };
  const create = vi.fn();
  const turn = { id: 'turn', status: 'cancelled', usage: null };
  const client = { beta: { agents: { sessions: { events: { stream: async () => stream, create }, turns: { list: async () => ({ data: [turn] }), retrieve: async () => turn }, items: { async *list() { yield { id: 'old', turn_id: 'turn', type: 'message', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: 'The verified final answer.' }] }; yield { id: 'cancel', turn_id: 'turn', type: 'message', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: 'Stopped by recovery.' }] }; } } } } } } as unknown as OpenAI;
  await processRun((await runs().findOne({ _id: id }))!, client);
  expect(await runs().findOne({ _id: id })).toMatchObject({ status: 'completed', draft: 'The verified final answer.' });
  expect(await rows('messages').findOne({ _id: `${id}:assistant` })).toMatchObject({ text: 'The verified final answer.', status: 'complete' });
  expect(create).not.toHaveBeenCalled();
});

it('recovers a quiet open turn only after its final item is complete and no tool is pending', async () => {
  const user = await createGuest(), id = `${user._id}:${randomUUID()}`;
  await reserveRun(user._id, id, 'A synthetic stalled provider test');
  await runs().updateOne({ _id: id }, { $set: { status: 'running', lease: 'lease', leaseUntil: Date.now() + 60000, providerSessionId: 'session', inputSubmitted: false } });
  let ended = false, wake: (() => void) | undefined;
  const queue: AgentSessionEvent[] = [], controller = new AbortController();
  controller.signal.addEventListener('abort', () => { ended = true; wake?.(); });
  const stream = { controller, async *[Symbol.asyncIterator]() { while (!ended) { if (queue.length) yield queue.shift()!; else await new Promise<void>(resolve => { wake = resolve; }); } } };
  const final = { id: 'answer', turn_id: 'turn', type: 'message', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: 'Complete before the turn closed.' }] };
  const turn = { id: 'turn', status: 'in_progress', subagent_id: null, usage: null };
  const create = vi.fn(async (_id: string, request: any) => {
    if (request.events[0].type === 'agent.session.input.message') { queue.push({ type: 'agent.session.turn.item.done', event_id: randomUUID(), session_id: 'session', turn_id: 'turn', item: final } as AgentSessionEvent); wake?.(); }
  });
  const retrieveSession = vi.fn(async () => ({ required_actions: [] }));
  const client = { beta: { agents: { sessions: { events: { stream: async () => stream, create }, retrieve: retrieveSession, turns: { retrieve: async () => turn } } } } } as unknown as OpenAI;
  await processRun((await runs().findOne({ _id: id }))!, client);
  expect(await runs().findOne({ _id: id })).toMatchObject({ status: 'queued', finalRecovery: true, outputComplete: true, draft: final.content[0].text });
  expect(retrieveSession).toHaveBeenCalled();
  expect(create.mock.calls.filter(call => call[1].events[0].type === 'agent.session.input.cancel')).toHaveLength(1);
});
