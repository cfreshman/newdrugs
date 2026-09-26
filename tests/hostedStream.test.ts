import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type OpenAI from 'openai';
import type { AgentSessionEvent } from 'openai/resources/beta/agents/agents';
import { connectDatabase, db, rows, mongo } from '../server/db';
import { createGuest, registerAccount } from '../server/auth';
import { reserveRun, runs, wallet } from '../server/wallet';
import { processRun } from '../server/agent';
import { ensureStarterPool } from '../server/starterPool';

let accountSequence = 0;
async function fundedAccount() { const user = await createGuest(); return registerAccount(user._id, `stream_${++accountSequence}`, 'test-hash', `192.0.2.${accountSequence}`); }
async function clean() { if (db().databaseName !== 'newdrugs_test') throw new Error('Only isolated cloud tests are allowed.'); for (const collection of await db().collections()) await collection.deleteMany({}); }
beforeAll(async () => { await connectDatabase(); await clean(); });
beforeEach(async () => { await clean(); await ensureStarterPool(); });
afterAll(async () => { await clean(); await mongo.close(); });

it.each([false, true])('streams both existing and fresh conversation-only sessions (fresh: %s)', async freshSession => {
  const user = await fundedAccount(), id = `${user._id}:${randomUUID()}`;
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
  const user = await fundedAccount(), id = `${user._id}:${randomUUID()}`;
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
  const user = await fundedAccount(), id = `${user._id}:${randomUUID()}`;
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

it('resumes a declined tool with the exact typed correction and never executes its write', async () => {
  const { hash } = await import('../server/auth');
  const { operations } = await import('../shared/catalog');
  const { canonicalJSON } = await import('../server/operations');
  const { replyToReview } = await import('../server/reviewReply');
  const user = await fundedAccount(), id = `${user._id}:${randomUUID()}`;
  await reserveRun(user._id, id, 'Publish the old caption');
  const op = operations.find(op => op.name === 'posts.create')!, input = op.schema.parse({ text: 'Old caption' }) as Record<string, unknown>;
  await runs().updateOne({ _id: id }, { $set: { status: 'waiting_for_approval', revision: 4, providerSessionId: 'session', providerTurnId: 'turn', inputSubmitted: true,
    approvals: [{ id: 'call', operation: op.name, input, version: op.version, digest: hash(canonicalJSON({ name: op.name, version: op.version, input })), title: 'Publish', detail: 'Publish', human: true, kind: 'write', status: 'pending', expiresAt: Date.now() + 60000 }] } });
  await replyToReview(user._id, { runId: id, revision: 4 }, { requestId: randomUUID(), text: 'nah cancel that. what else could i do', fileIds: [] });
  await runs().updateOne({ _id: id }, { $set: { status: 'running', lease: 'lease', leaseUntil: Date.now() + 60000 } });
  let ended = false, wake: (() => void) | undefined;
  const queue: AgentSessionEvent[] = [], controller = new AbortController();
  controller.signal.addEventListener('abort', () => { ended = true; wake?.(); });
  const stream = { controller, async *[Symbol.asyncIterator]() { while (!ended) { if (queue.length) yield queue.shift()!; else await new Promise<void>(resolve => { wake = resolve; }); } } };
  const turn = { id: 'turn', status: 'in_progress', subagent_id: null, usage: null };
  const create = vi.fn(async (_id: string, request: any) => {
    const reply = request.events[0]; expect(reply.type).toBe('agent.session.input.tool_result');
    expect(JSON.parse(reply.output)).toMatchObject({ status: 'not_executed', userReply: { text: 'nah cancel that. what else could i do' } });
    queue.push({ type: 'agent.session.turn.completed', event_id: randomUUID(), session_id: 'session', turn_id: 'turn', turn: { ...turn, status: 'completed' }, usage: null } as AgentSessionEvent); wake?.();
  });
  const client = { beta: { agents: { sessions: { events: { stream: async () => stream, create }, turns: { list: async () => ({ data: [turn] }), retrieve: async () => turn }, items: { async *list() {} }, retrieve: async () => ({ required_actions: [{ type: 'function_call', call_id: 'call', turn_id: 'turn', name: 'newdrugs_execute', arguments: JSON.stringify({ operation: op.name, input }) }] }) } } } } as unknown as OpenAI;
  await processRun((await runs().findOne({ _id: id }))!, client);
  expect(create).toHaveBeenCalledOnce();
  expect(await rows('posts').countDocuments()).toBe(0);
  expect((await runs().findOne({ _id: id }))?.status).toBe('completed');
});

it('sleeps without returning a tool result, then resumes the same provider turn exactly once', async () => {
  const { wakeRun } = await import('../server/sleep');
  const user = await fundedAccount(), id = `${user._id}:${randomUUID()}`;
  await reserveRun(user._id,id,'Wait briefly, then answer.');
  await runs().updateOne({_id:id},{$set:{status:'running',lease:'first',leaseUntil:Date.now()+60000}});
  const makeStream=()=>{let end=false,wake:(()=>void)|undefined;const events:AgentSessionEvent[]=[];const controller=new AbortController();controller.signal.addEventListener('abort',()=>{end=true;wake?.();});return {controller,emit:(event:unknown)=>{events.push(event as AgentSessionEvent);wake?.();},async *[Symbol.asyncIterator](){while(!end){if(events.length)yield events.shift()!;else await new Promise<void>(resolve=>{wake=resolve;});}}};};
  let stream=makeStream();
  const action={type:'function_call',call_id:'sleep-call',turn_id:'turn',name:'newdrugs_sleep',arguments:JSON.stringify({seconds:10,reason:'Waiting for the requested time'})};
  let required:unknown[]=[action];
  const createEvent=vi.fn(async(_sessionId:string,body:{events:any[]})=>{
    if(body.events[0].type==='agent.session.input.tool_result'){
      expect(body.events[0]).toMatchObject({call_id:'sleep-call',turn_id:'turn',success:true});required=[];
      stream.emit({type:'agent.session.turn.completed',event_id:randomUUID(),session_id:'session',turn_id:'turn',turn:{id:'turn',status:'completed',subagent_id:null,usage:null},usage:null});
    }
  });
  const client={beta:{agents:{sessions:{create:async()=>{stream.emit({type:'agent.session.created',event_id:randomUUID(),session:{id:'session'}});stream.emit({type:'agent.session.turn.created',event_id:randomUUID(),turn_id:'turn',turn:{id:'turn',subagent_id:null}});stream.emit({type:'agent.session.requires_action',event_id:randomUUID(),session:{id:'session',required_actions:required}});return stream;},events:{stream:async()=>stream,create:createEvent},retrieve:async()=>({id:'session',required_actions:required}),turns:{list:async()=>({data:[{id:'turn'}]}),retrieve:async()=>({id:'turn',status:'in_progress',usage:null})},items:{async *list(){}}}}}} as unknown as OpenAI;
  await processRun((await runs().findOne({_id:id}))!,client);
  expect((await runs().findOne({_id:id}))?.status).toBe('sleeping');expect(createEvent).not.toHaveBeenCalled();
  expect(await wakeRun(user._id,id,true)).toEqual({resumed:true});
  await runs().updateOne({_id:id},{$set:{status:'running',lease:'second',leaseUntil:Date.now()+60000}});stream=makeStream();
  await processRun((await runs().findOne({_id:id}))!,client);
  expect((await runs().findOne({_id:id}))?.status).toBe('completed');expect(createEvent).toHaveBeenCalledTimes(1);
  expect((await runs().findOne({_id:id}))?.completedSleeps?.['sleep-call']).toContain('The host resumed this task');
});

it('does not restore a provider session that finishes creation after chat was cleared', async () => {
  const { clearAgentChat } = await import('../server/account');
  const user=await fundedAccount(),id=`${user._id}:${randomUUID()}`;
  await reserveRun(user._id,id,'Old private context');await runs().updateOne({_id:id},{$set:{status:'running',lease:'lease',leaseUntil:Date.now()+60000}});
  const controller=new AbortController();
  const client={beta:{agents:{sessions:{create:async()=>{await clearAgentChat(user._id);return{controller,async *[Symbol.asyncIterator](){yield{type:'agent.session.created',session:{id:'late-session'}};}};}}}}} as unknown as OpenAI;
  await processRun((await runs().findOne({_id:id}))!,client);
  expect(await rows('agentSessions').findOne({_id:user._id})).toBeNull();expect(await rows('agentSessionCleanup').findOne({_id:'late-session'})).not.toBeNull();
  expect((await runs().findOne({_id:id}))?.text).toBe('');
});

it('replaces a definitively failed empty provider session without replaying a started turn', async () => {
  const user=await fundedAccount(),id=`${user._id}:${randomUUID()}`;
  await reserveRun(user._id,id,'A safe startup retry');await runs().updateOne({_id:id},{$set:{status:'running',lease:'lease',leaseUntil:Date.now()+60000,providerSessionId:'dead-session',creatingSession:true,failures:1}});
  await rows('agentSessions').insertOne({_id:user._id,sessionId:'dead-session',credentialId:'old-key'});
  const controller=new AbortController();
  const create=vi.fn(async()=>({controller,async *[Symbol.asyncIterator](){yield{type:'agent.session.created',session:{id:'replacement'}};yield{type:'agent.session.turn.created',turn_id:'retry-turn',turn:{id:'retry-turn',subagent_id:null}};yield{type:'agent.session.turn.completed',turn_id:'retry-turn',turn:{id:'retry-turn',subagent_id:null,status:'completed',usage:null},usage:null};}}));
  const client={beta:{agents:{sessions:{create,retrieve:async()=>({status:'failed'}),turns:{list:async()=>({data:[]})},events:{create:vi.fn()}}}}} as unknown as OpenAI;
  await processRun((await runs().findOne({_id:id}))!,client);
  expect(create).toHaveBeenCalledOnce();expect(await runs().findOne({_id:id})).toMatchObject({providerSessionId:'replacement',status:'completed',creationRecoveries:1});
  expect(await rows('agentSessionCleanup').findOne({_id:'dead-session'})).not.toBeNull();
});

it('refreshes an outdated contract review without executing it or returning a spurious changed-input error',async()=>{
 const {hash}=await import('../server/auth');const {operations}=await import('../shared/catalog');const {canonicalJSON}=await import('../server/operations');
 const user=await fundedAccount(),id=`${user._id}:${randomUUID()}`,op=operations.find(op=>op.name==='posts.create')!,input=op.schema.parse({text:'Keep this exact post'});
 await reserveRun(user._id,id,'Post this');await runs().updateOne({_id:id},{$set:{status:'running',lease:'lease',leaseUntil:Date.now()+60000,providerSessionId:'session',providerTurnId:'turn',inputSubmitted:true,approvals:[{id:'call',operation:op.name,input,version:'old-contract',digest:hash(canonicalJSON({name:op.name,version:'old-contract',input})),title:'Publish',detail:'Publish',human:true,kind:'write',status:'approved',expiresAt:Date.now()+60000}]}});
 let ended=false,wake:(()=>void)|undefined;const controller=new AbortController();controller.signal.addEventListener('abort',()=>{ended=true;wake?.();});const stream={controller,async *[Symbol.asyncIterator](){while(!ended)await new Promise<void>(resolve=>{wake=resolve;});}};
 const turn={id:'turn',status:'in_progress',subagent_id:null,usage:null},create=vi.fn();
 const client={beta:{agents:{sessions:{events:{stream:async()=>stream,create},turns:{list:async()=>({data:[turn]}),retrieve:async()=>turn},items:{async *list(){}},retrieve:async()=>({required_actions:[{type:'function_call',call_id:'call',turn_id:'turn',name:'newdrugs_execute',arguments:JSON.stringify({operation:op.name,input})}]})}}}} as unknown as OpenAI;
 await processRun((await runs().findOne({_id:id}))!,client);const current=await runs().findOne({_id:id});expect(current?.status).toBe('waiting_for_approval');expect(current?.approvals[0]).toMatchObject({status:'pending',version:op.version,input});expect(create).not.toHaveBeenCalled();expect(await rows('posts').countDocuments()).toBe(0);
});

it.each([false,true])('reviews the full active-creation configuration before execution, existing approval=%s',async(existing)=>{
 const {operations}=await import('../shared/catalog');const {hash}=await import('../server/auth');const {canonicalJSON}=await import('../server/operations');
 const user=await fundedAccount(),id=`${user._id}:${randomUUID()}`,op=operations.find(o=>o.name==='automations.create')!;
 const input=op.schema.parse({name:'Morning context',instruction:'Review my current account activity.',schedule:{kind:'weekly',timeZone:'America/New_York',weekdays:[1],hour:7,minute:0},accountActivity:true});
 await reserveRun(user._id,id,'Set up the task');
 await runs().updateOne({_id:id},{$set:{status:'running',lease:'lease',leaseUntil:Date.now()+60000,providerSessionId:'session',providerTurnId:'turn',inputSubmitted:true,approvals:existing?[{id:'create-call',operation:op.name,input,version:'old-contract',digest:hash(canonicalJSON({name:op.name,version:'old-contract',input})),title:'Create',detail:'Create',human:false,kind:'write',status:'approved',expiresAt:Date.now()+60000}]:[]}});
 const controller=new AbortController(),stream={controller,async *[Symbol.asyncIterator](){if(!controller.signal.aborted)await new Promise<void>(resolve=>controller.signal.addEventListener('abort',()=>resolve(),{once:true}));}};
 const create=vi.fn(),turn={id:'turn',status:'in_progress',usage:null};
 const client={beta:{agents:{sessions:{events:{stream:async()=>stream,create},turns:{list:async()=>({data:[turn]}),retrieve:async()=>turn},items:{async *list(){}},retrieve:async()=>({required_actions:[{type:'function_call',call_id:'create-call',turn_id:'turn',name:'newdrugs_execute',arguments:JSON.stringify({operation:op.name,input})}]})}}}} as unknown as OpenAI;
 await processRun((await runs().findOne({_id:id}))!,client);
 const pending=await runs().findOne({_id:id});expect(pending?.status).toBe('waiting_for_approval');expect(pending?.approvals[0]).toMatchObject({operation:op.name,status:'pending',human:true,version:op.version,automation:input});
 expect(await rows('automations').countDocuments()).toBe(0);expect(create).not.toHaveBeenCalled();
});
