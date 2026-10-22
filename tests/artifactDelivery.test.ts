import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type OpenAI from 'openai';
import type { AgentSessionEvent, AgentSessionItem } from 'openai/resources/beta/agents/agents';
import type { ArtifactPresentationReference } from '../shared/artifacts';
import type { AgentModelSnapshot } from '../shared/agentModel';
import { artifactHistoryText, bindPrimaryArtifact, completedArtifactFinal, mergeArtifactReferences } from '../server/artifactDelivery';
import { completedRouterHistory, routerThreadInput } from '../server/routerContext';
import { compactionRecentInput } from '../server/agentCompaction';
import { historyText, routerConversationInput, sessionContinuity, sessionInput } from '../server/sessionContext';
import { connectDatabase, db, mongo, rows, transaction } from '../server/db';
import { createGuest, users, type Actor } from '../server/auth';
import { config } from '../server/config';
import { conversationPage, conversationWindow, executeOperation } from '../server/operations';
import { finishRun, reserveRun, runs } from '../server/wallet';
import { clearAgentChat } from '../server/account';
import { handleActions, processRun, runView } from '../server/agent';
import { processOpenRouterRun } from '../server/openRouterAgent';

const reference = (artifactId = randomUUID(), presentation: 'inline' | 'link' = 'inline', presentedRevision = 1): ArtifactPresentationReference => ({ artifactId, presentation, presentedRevision, title: 'A graph' });
const graph = { title: 'A graph', bodyHtml: '<p>private-template-marker</p><script>document.body.dataset.value=String(data.value)</script>', data: { value: 'private-data-marker' }, ephemeral: true };
const model: AgentModelSnapshot = { id: 'anthropic/claude-haiku-5.5', name: 'Haiku', provider: 'openrouter', context: 1000000, outputLimit: 8192, reasoning: true, revision: 0, selectedAt: '2026-10-22', price: { input: 100, cached: 10, cacheWrite: 125, output: 500 } };

describe('artifact delivery primitives', () => {
  it('deduplicates retries and bounds distinct results while retaining the latest presentation', () => {
    const first = reference(), second = reference(), third = reference();
    expect(mergeArtifactReferences([first], first)).toEqual([first]);
    const updated = { ...first, presentation: 'link' as const, presentedRevision: 2 };
    expect(mergeArtifactReferences([first, second], updated)).toEqual([updated, second]);
    expect(() => mergeArtifactReferences([first, second, third], reference())).toThrow('at most 3');
    expect(() => mergeArtifactReferences([], { ...first, bodyHtml: 'untrusted' } as ArtifactPresentationReference)).toThrow();
  });

  it('carries artifact-only turns as compact identifying model context', () => {
    const artifact = reference();
    expect(artifactHistoryText([artifact])).toContain(artifact.artifactId);
    expect(historyText({ text: '', artifacts: [artifact] })).toContain('artifacts.get');
    expect(artifactHistoryText(undefined)).toBe('');
  });

  it('keeps versioned references distinct from current editable content in model continuity',()=>{
    const previous={...reference(),contentRevision:1},next={...previous,contentRevision:2,presentedRevision:3};
    expect(mergeArtifactReferences([previous],next)).toEqual([previous,next]);
    expect(mergeArtifactReferences([previous,next],{...next,presentation:'link'})).toEqual([previous,{...next,presentation:'link'}]);
    expect(()=>mergeArtifactReferences([previous,next,{...next,contentRevision:3}],{...next,contentRevision:4})).toThrow('at most 3');
    expect(previous.contentRevision).toBe(1);
    const history=artifactHistoryText([next]);expect(history).toContain('contentRevision');expect(history).toContain('artifacts.view');expect(history).toContain('artifacts.get');
  });

  it('requires persisted artifacts and an explicitly completed final item for quiet-turn recovery', () => {
    const artifact = reference(), final = { id: 'final', type: 'message', role: 'assistant', phase: 'final_answer', status: 'completed', content: [] } as unknown as AgentSessionItem;
    expect(completedArtifactFinal([artifact], [final])).toBe(true);
    expect(completedArtifactFinal(undefined, [final])).toBe(false);
    expect(completedArtifactFinal([artifact], [])).toBe(false);
    expect(completedArtifactFinal([artifact], [{ ...final, status: 'in_progress' } as AgentSessionItem])).toBe(false);
    expect(completedArtifactFinal([artifact], [{ ...final, phase: 'commentary' } as AgentSessionItem])).toBe(false);
    expect(completedArtifactFinal([artifact], [final, { ...final, id: 'later', status: 'in_progress' } as AgentSessionItem])).toBe(false);
  });

  it('omits artifact source only from completed artifact exchanges in every router transport', () => {
    const artifact = reference(), input = { operation: 'artifacts.create', input: graph };
    const get = { operation: 'artifacts.get', input: { artifactId: artifact.artifactId } };
    const messages: import('../server/openRouter').RouterMessage[] = [
      { role: 'assistant', content: null, tool_calls: [{ id: 'create', type: 'function', function: { name: 'newdrugs_execute', arguments: JSON.stringify(input) } }], native_content: [{ type: 'tool_use', id: 'create', name: 'newdrugs_execute', input }], response_items: [{ type: 'function_call', call_id: 'create', name: 'newdrugs_execute', arguments: JSON.stringify(input) }] },
      { role: 'tool', tool_call_id: 'create', content: JSON.stringify({ ok: true, operation: 'artifacts.create', data: { id: artifact.artifactId, reference: artifact } }) },
      { role: 'assistant', content: null, tool_calls: [{ id: 'get', type: 'function', function: { name: 'newdrugs_read', arguments: JSON.stringify(get) } }] },
      { role: 'tool', tool_call_id: 'get', content: JSON.stringify({ ok: true, data: { id: artifact.artifactId, title: artifact.title, revision: 1, bodyHtml: graph.bodyHtml, data: graph.data, refreshInstruction: 'private-instruction-marker' } }) },
      { role: 'assistant', content: null, tool_calls: [{ id: 'section', type: 'function', function: { name: 'newdrugs_read', arguments: JSON.stringify({ ...get, input: { ...get.input, section: 'data' } }) } }] },
      { role: 'tool', tool_call_id: 'section', content: JSON.stringify({ ok: true, data: { id: artifact.artifactId, source: { section: 'data', offset: 0, content: 'private-source-marker', nextOffset: null } } }) },
      { role: 'assistant', content: null, tool_calls: [{ id: 'other', type: 'function', function: { name: 'newdrugs_execute', arguments: JSON.stringify({ operation: 'website.create', input: { bodyHtml: 'keep-unrelated-html', data: { value: 'keep-unrelated-data' } } }) } }] },
      { role: 'tool', tool_call_id: 'other', content: 'keep-unrelated-result' },
    ];
    const saved = completedRouterHistory(messages), text = JSON.stringify(saved);
    for (const marker of ['private-template-marker', 'private-data-marker', 'private-instruction-marker', 'private-source-marker']) expect(text).not.toContain(marker);
    expect(text).toContain(artifact.artifactId);
    expect(text).toContain('presentedRevision');
    for (const marker of ['keep-unrelated-html', 'keep-unrelated-data', 'keep-unrelated-result']) expect(text).toContain(marker);
    expect(JSON.stringify(messages)).toContain('private-template-marker');
  });
});

describe('artifact chat lifecycle', () => {
  let sequence = 0;
  const clean = async () => { if (db().databaseName !== 'newdrugs_test') throw Error('Isolated test database required.'); for (const collection of await db().collections()) await collection.deleteMany({}); };
  beforeAll(async () => { if (new URL(config.MONGODB_URI).pathname !== '/newdrugs_test') throw Error('Isolated test database required.'); await connectDatabase(); });
  beforeEach(clean);
  afterAll(async () => { await clean(); await mongo.close(); });

  async function fixture() {
    const owner = await createGuest();
    await users().updateOne({ _id: owner._id }, { $set: { handle: `artifact_${++sequence}`, balanceNanos: 2e9 } });
    const run = await reserveRun(owner._id, `${owner._id}:${randomUUID()}`, 'Draw a compact graph');
    await runs().updateOne({ _id: run._id }, { $set: { status: 'running', lease: 'lease', leaseUntil: Date.now() + 60000 } });
    const current = (await runs().findOne({ _id: run._id }))!;
    const actor: Actor = { userId: owner._id, source: 'agent', scope: 'write', runId: run._id };
    return { run: current, actor, proof: { runId: run._id, lease: 'lease' } };
  }
  async function create(actor: Actor, proof: { runId?: string; lease?: string } = {}, input: unknown = graph, key = randomUUID()) {
    return await executeOperation('artifacts.create', input, actor, key, proof) as { id: string; revision: number; contentRevision: number };
  }
  async function present(actor:Actor,artifactId:string,proof:{runId?:string;lease?:string}={},contentRevision?:number|'legacy',presentation:'inline'|'link'='inline'){
    return await executeOperation('artifacts.present',{artifactId,contentRevision,presentation},actor,undefined,proof) as ArtifactPresentationReference;
  }
  async function createAndPresent(actor:Actor,proof:{runId?:string;lease?:string}={},input:unknown=graph,key=randomUUID()){
    const saved=await create(actor,proof,input,key);
    return {...saved,reference:await present(actor,saved.id,proof,saved.contentRevision)};
  }
  async function nextPrimary(userId:string){
    const run=await reserveRun(userId,`${userId}:${randomUUID()}`,'Edit the graph');
    await runs().updateOne({_id:run._id},{$set:{status:'running',lease:'edit-lease',leaseUntil:Date.now()+60000}});
    return {run,actor:{userId,source:'agent' as const,scope:'write' as const,runId:run._id},proof:{runId:run._id,lease:'edit-lease'}};
  }

  it('saves creations and edits without attaching them until an explicit presentation selects a version',async()=>{
    const first=await fixture(),created=await create(first.actor,first.proof);
    expect(created).not.toHaveProperty('reference');expect((await runs().findOne({_id:first.run._id}))?.artifacts).toBeUndefined();
    await present(first.actor,created.id,first.proof,1);
    await finishRun(first.run._id,'lease','','completed');
    const original=await rows('messages').findOne({_id:`${first.run._id}:assistant`});
    expect(original?.artifacts).toMatchObject([{contentRevision:1,presentation:'inline'}]);
    const edit=await nextPrimary(first.run.userId),key=randomUUID(),input={artifactId:created.id,revision:1,bodyHtml:'<p>Updated graph</p>',data:{value:42}};
    const updated=await executeOperation('artifacts.update',input,edit.actor,key,edit.proof) as {contentRevision:number};
    expect(updated).toMatchObject({contentRevision:2});expect(updated).not.toHaveProperty('reference');
    expect(await executeOperation('artifacts.update',input,edit.actor,key,edit.proof)).toEqual(updated);
    expect((await runs().findOne({_id:edit.run._id}))?.artifacts).toBeUndefined();
    const shown=await present(edit.actor,created.id,edit.proof,updated.contentRevision);
    expect(shown).toMatchObject({artifactId:created.id,contentRevision:2,presentedRevision:2,presentation:'inline'});
    expect((await runs().findOne({_id:edit.run._id}))?.artifacts).toEqual([shown]);
    await finishRun(edit.run._id,'edit-lease','','completed');
    expect(await rows('messages').findOne({_id:`${edit.run._id}:assistant`})).toMatchObject({text:'',artifacts:[shown]});
    expect((await rows('messages').findOne({_id:`${first.run._id}:assistant`}))?.artifacts).toEqual(original?.artifacts);
    const external:Actor={userId:first.run.userId,source:'external',scope:'read'};
    expect(await executeOperation('artifacts.view',{artifactId:created.id,contentRevision:1},external)).toMatchObject({contentRevision:1,bodyHtml:graph.bodyHtml,data:graph.data});
    expect(await executeOperation('artifacts.view',{artifactId:created.id},external)).toMatchObject({contentRevision:2,bodyHtml:'<p>Updated graph</p>',data:{value:42}});
    const retry=await nextPrimary(first.run.userId);
    expect(await executeOperation('artifacts.update',input,retry.actor,key,retry.proof)).toEqual(updated);
    expect((await runs().findOne({_id:retry.run._id}))?.artifacts).toBeUndefined();
  });

  it('does not attach metadata or content edits and honors a separately chosen linked presentation',async()=>{
    const {run,actor,proof}=await fixture(),external:Actor={userId:run.userId,source:'external',scope:'write'};
    const created=await create(external);
    const metadata=await executeOperation('artifacts.update',{artifactId:created.id,revision:1,title:'Renamed graph',ephemeral:false,refreshInstruction:'Read the current source.'},actor,randomUUID(),proof);
    expect(metadata).not.toHaveProperty('reference');expect((await runs().findOne({_id:run._id}))?.artifacts).toBeUndefined();
    const updated=await executeOperation('artifacts.update',{artifactId:created.id,revision:2,data:{value:2}},actor,randomUUID(),proof);
    expect(updated).not.toHaveProperty('reference');expect((await runs().findOne({_id:run._id}))?.artifacts).toBeUndefined();
    const shown=await present(actor,created.id,proof,2,'link');
    expect(shown).toMatchObject({contentRevision:2,presentedRevision:3,presentation:'link'});
    expect((await runs().findOne({_id:run._id}))?.artifacts).toEqual([shown]);
  });

  it('does not infer attachments from successful writes when a reply completes',async()=>{
    const {run,actor,proof}=await fixture(),saved=await create(actor,proof);
    await executeOperation('artifacts.update',{artifactId:saved.id,revision:1,data:{value:2}},actor,randomUUID(),proof);
    await finishRun(run._id,'lease','Saved the draft.','completed');
    const message=await rows('messages').findOne({_id:`${run._id}:assistant`});
    expect(message).toMatchObject({text:'Saved the draft.'});expect(message).not.toHaveProperty('artifacts');
    expect((await runs().findOne({_id:run._id}))?.artifacts).toBeUndefined();
    expect(await rows('artifactVersions').countDocuments({artifactId:saved.id})).toBe(2);
  });

  it('keeps browser and external content edits outside primary output and rejects a stale generation presentation',async()=>{
    const {run,actor,proof}=await fixture(),external:Actor={userId:run.userId,source:'external',scope:'write'},created=await create(external);
    await executeOperation('artifacts.update',{artifactId:created.id,revision:1,data:{value:2}},external,randomUUID());
    const browser={...external,source:'browser' as const};
    await executeOperation('artifacts.update',{artifactId:created.id,revision:2,data:{value:3}},browser,randomUUID());
    expect((await runs().findOne({_id:run._id}))?.artifacts).toBeUndefined();
    const descriptor=await present(external,created.id,{},3);
    expect(await transaction(session=>bindPrimaryArtifact({...actor,background:true},proof,descriptor,session))).toBe(false);
    await users().updateOne({_id:run.userId},{$inc:{chatGeneration:1}});
    await expect(present(actor,created.id,proof,3)).rejects.toMatchObject({code:'stale_run'});
    expect(await executeOperation('artifacts.get',{artifactId:created.id},external)).toMatchObject({revision:3,contentRevision:3,data:{value:3}});
    expect((await runs().findOne({_id:run._id}))?.artifacts).toBeUndefined();
  });

  it('commits one artifact-only reply and retains refs through history, search windows and model recovery', async () => {
    const { run, actor, proof } = await fixture(), key = randomUUID();
    const result = await createAndPresent(actor, proof, graph, key);
    expect(await createAndPresent(actor, proof, graph, key)).toEqual(result);
    const active = (await runs().findOne({ _id: run._id }))!;
    expect(active.artifacts).toEqual([result.reference]);
    expect(runView(active).artifacts).toEqual([result.reference]);
    await finishRun(run._id, 'lease', '', 'completed');
    const messageId = `${run._id}:assistant`;
    expect(await rows('messages').findOne({ _id: messageId })).toMatchObject({ text: '', artifacts: [result.reference], status: 'complete' });
    expect((await conversationPage(run.userId)).items.find(item => item.id === messageId)?.artifacts).toEqual([result.reference]);
    expect((await conversationWindow(run.userId, messageId)).items.find(item => item.id === messageId)?.artifacts).toEqual([result.reference]);
    await expect(finishRun(run._id, 'lease', '', 'completed')).rejects.toMatchObject({ code: 'stale_run' });
    expect(await rows('messages').countDocuments({ _id: messageId })).toBe(1);
    const next = await reserveRun(run.userId, `${run.userId}:${randomUUID()}`, 'Change the graph');
    const continuity = await sessionContinuity(next);
    expect(continuity.messages.find(item => item.id === messageId)?.artifacts).toEqual([result.reference]);
    for (const input of [await sessionInput(next), await routerConversationInput(next), await compactionRecentInput(next), await routerThreadInput(next)]) {
      const text = JSON.stringify(input);
      expect(text).toContain(result.id);
      expect(text).not.toContain('private-template-marker');
      expect(text).not.toContain('private-data-marker');
    }
  });

  it('presents an existing owned artifact through the trusted hosted MCP identity without copying it', async () => {
    const { run, actor } = await fixture();
    const result = await create({ ...actor, source: 'external', runId: undefined });
    expect((await runs().findOne({ _id: run._id }))?.artifacts).toBeUndefined();
    const shown = await executeOperation('artifacts.present', { artifactId: result.id, presentation: 'inline' }, actor) as ArtifactPresentationReference;
    expect(shown).toMatchObject({ artifactId: result.id, presentation: 'inline', presentedRevision: 1 });
    expect((await runs().findOne({ _id: run._id }))?.artifacts).toEqual([shown]);
    await executeOperation('artifacts.present', { artifactId: result.id, presentation: 'inline' }, actor);
    expect((await runs().findOne({ _id: run._id }))?.artifacts).toEqual([shown]);
    expect(await rows('artifacts').countDocuments({ userId: run.userId })).toBe(1);
  });

  it('presents distinct saved versions without an edit while replacing the same version presentation',async()=>{
    const {run,actor,proof}=await fixture(),external:Actor={userId:run.userId,source:'external',scope:'write'},saved=await create(external);
    await executeOperation('artifacts.update',{artifactId:saved.id,revision:1,data:{value:2}},external,randomUUID());
    const old=await executeOperation('artifacts.present',{artifactId:saved.id,contentRevision:1},actor,undefined,proof) as ArtifactPresentationReference;
    expect(old).toMatchObject({contentRevision:1,presentation:'link'});
    expect((await runs().findOne({_id:run._id}))?.artifacts).toEqual([old]);
    const inline=await present(actor,saved.id,proof,1,'inline');
    expect((await runs().findOne({_id:run._id}))?.artifacts).toEqual([inline]);
    const latest=await present(actor,saved.id,proof,2,'link');
    expect((await runs().findOne({_id:run._id}))?.artifacts).toEqual([inline,latest]);
    expect(latest).toMatchObject({contentRevision:2,presentation:'link'});
    expect(await rows('artifacts').countDocuments({userId:run.userId})).toBe(1);
    expect(await rows('receipts').countDocuments({userId:run.userId})).toBe(2);
    await finishRun(run._id,'lease','','completed');
    expect((await rows('messages').findOne({_id:`${run._id}:assistant`}))?.artifacts).toEqual([inline,latest]);
  });

  it('attaches a shared foreign version by capability while retaining private management and revocation',async()=>{
    const {run,actor,proof}=await fixture(),owner=await createGuest(),source:Actor={userId:owner._id,source:'external',scope:'write'};
    await users().updateOne({_id:owner._id},{$set:{handle:`artifact_source_${++sequence}`}});
    const saved=await create(source);
    await executeOperation('artifacts.update',{artifactId:saved.id,revision:1,data:{value:2}},source,randomUUID());
    const shown=await present(actor,saved.id,proof,1);
    expect(shown).toMatchObject({artifactId:saved.id,contentRevision:1,presentation:'inline'});
    expect((await runs().findOne({_id:run._id}))?.artifacts).toEqual([shown]);
    const caller:Actor={userId:run.userId,source:'external',scope:'write'};
    await expect(executeOperation('artifacts.get',{artifactId:saved.id},caller)).rejects.toMatchObject({code:'not_found'});
    await expect(executeOperation('artifacts.update',{artifactId:saved.id,revision:2,data:{value:3}},caller,randomUUID())).rejects.toMatchObject({code:'not_found'});
    await users().updateOne({_id:owner._id},{$set:{suspendedAt:new Date().toISOString()}});
    await expect(present(actor,saved.id,proof,2)).rejects.toMatchObject({code:'not_found'});
    await expect(transaction(session=>bindPrimaryArtifact(actor,proof,shown,session))).rejects.toMatchObject({code:'not_found'});
    await users().updateOne({_id:owner._id},{$set:{suspendedAt:null}});
    await executeOperation('artifacts.delete',{artifactId:saved.id,revision:2},source,randomUUID(),{confirmed:true});
    await expect(present(actor,saved.id,proof,1)).rejects.toMatchObject({code:'not_found'});
    await expect(transaction(session=>bindPrimaryArtifact(actor,proof,shown,session))).rejects.toMatchObject({code:'not_found'});
    expect((await runs().findOne({_id:run._id}))?.artifacts).toEqual([shown]);
  });

  it('carries an authorized saved version through native open output and shared provider surface handling',async()=>{
    const {run,actor}=await fixture(),external:Actor={userId:run.userId,source:'external',scope:'write'},saved=await create(external);
    await executeOperation('artifacts.update',{artifactId:saved.id,revision:1,data:{value:2}},external,randomUUID());
    const eventCreate=vi.fn(),client={beta:{agents:{sessions:{events:{create:eventCreate}}}}} as unknown as OpenAI;
    for(const artifactVersion of [1,'legacy',2] as const){
      const input={view:'artifacts',resourceId:saved.id,artifactVersion};
      expect(await executeOperation('app.open',input,external)).toMatchObject({open:'artifacts',resourceId:saved.id,artifactVersion});
      await handleActions(run,[{type:'function_call',name:'newdrugs_open',call_id:`open-${artifactVersion}`,turn_id:'turn',arguments:JSON.stringify(input)}] as Parameters<typeof handleActions>[1],client,true);
      const current=(await runs().findOne({_id:run._id}))!;
      expect(runView(current).surface).toMatchObject({view:'artifacts',resourceId:saved.id,artifactVersion});
      expect(JSON.parse(eventCreate.mock.lastCall![1].events[0].output).links[0].url).toContain(`?version=${artifactVersion}`);
      expect(current.artifacts).toBeUndefined();
    }
    await expect(executeOperation('app.open',{view:'artifacts',artifactVersion:1},actor)).rejects.toMatchObject({code:'artifact_version'});
    await expect(executeOperation('app.open',{view:'feed',artifactVersion:1},actor)).rejects.toMatchObject({code:'artifact_version'});
    await expect(executeOperation('app.open',{view:'artifacts',resourceId:saved.id,artifactVersion:99},actor)).rejects.toMatchObject({code:'not_found'});
  });

  it('keeps external and automation delivery outside primary chat and does not extend conversation.append', async () => {
    const { run, actor, proof } = await fixture();
    const external: Actor = { ...actor, source: 'external', runId: undefined };
    const result = await createAndPresent(external);
    for (const caller of [external, { ...actor, background: true }]) expect(await transaction(session => bindPrimaryArtifact(caller, proof, result.reference, session))).toBe(false);
    expect((await runs().findOne({ _id: run._id }))?.artifacts).toBeUndefined();
    await expect(executeOperation('conversation.append', { role: 'assistant', text: 'Output', artifacts: [result.reference] }, external, randomUUID())).rejects.toThrow();
    expect(await rows('messages').countDocuments({ role: 'assistant', artifacts: { $exists: true } })).toBe(0);
  });

  it('preserves a successfully created artifact when later prose fails', async () => {
    const { run, actor, proof } = await fixture(), result = await createAndPresent(actor, proof);
    await finishRun(run._id, 'lease', '', 'failed', 'The prose connection failed.');
    expect(await rows('messages').findOne({ _id: `${run._id}:assistant` })).toMatchObject({ text: 'The prose connection failed.', artifacts: [result.reference], status: 'interrupted' });
    expect(await rows('artifacts').findOne({ _id: result.id })).not.toBeNull();
  });

  it.each(['cancelled', 'superseded'] as const)('does not attach output after the run is %s', async kind => {
    const { run, actor, proof } = await fixture(), result = await createAndPresent(actor, proof);
    await runs().updateOne({ _id: run._id }, { $set: kind === 'cancelled' ? { cancelRequested: true } : { superseded: true } });
    await expect(transaction(session => bindPrimaryArtifact(actor, proof, result.reference, session))).rejects.toMatchObject({ code: 'stale_run' });
    await finishRun(run._id, 'lease', '', kind === 'cancelled' ? 'cancelled' : 'completed');
    expect((await rows('messages').findOne({ _id: `${run._id}:assistant` }))?.artifacts).toBeUndefined();
    expect(await rows('artifacts').findOne({ _id: result.id })).not.toBeNull();
  });

  it('bounds explicit presentations without rolling back independent saved records and rejects a stale lease or invalid capability', async () => {
    const { run, actor, proof } = await fixture();
    const first = await createAndPresent(actor, proof);
    await expect(transaction(session => bindPrimaryArtifact(actor, { ...proof, lease: 'old' }, first.reference, session))).rejects.toMatchObject({ code: 'stale_run' });
    await expect(transaction(session => bindPrimaryArtifact(actor, proof, reference(), session))).rejects.toMatchObject({ code: 'not_found' });
    await createAndPresent(actor, proof); await createAndPresent(actor, proof);
    const fourth=await create(actor,proof);
    await expect(present(actor,fourth.id,proof,1)).rejects.toMatchObject({ code: 'artifact_delivery_limit' });
    expect(await rows('artifacts').countDocuments({ userId: run.userId })).toBe(4);
    expect((await rows('artifactUsage').findOne({ _id: run.userId }))?.count).toBe(4);
  });

  it('clears bindings and provider context while retaining both ephemeral and listed records', async () => {
    const { run, actor, proof } = await fixture();
    const hidden = await createAndPresent(actor, proof), listed = await createAndPresent(actor, proof, { ...graph, ephemeral: false });
    await finishRun(run._id, 'lease', '', 'completed');
    await rows('routerThreads').insertOne({ _id: run.userId, messages: [{ role: 'assistant', content: artifactHistoryText([hidden.reference, listed.reference]) }] });
    await clearAgentChat(run.userId);
    expect(await rows('artifacts').countDocuments({ userId: run.userId })).toBe(2);
    expect((await runs().findOne({ _id: run._id }))?.artifacts).toEqual([]);
    expect(await rows('messages').countDocuments({ userId: run.userId, artifacts: { $exists: true } })).toBe(0);
    expect(await rows('routerThreads').findOne({ _id: run.userId })).toBeNull();
    // Even an old worker with a renewed lease cannot bind across Clear Chat.
    await runs().updateOne({ _id: run._id }, { $set: { status: 'running', lease: 'lease', leaseUntil: Date.now() + 60000, superseded: false, cancelRequested: false } });
    await users().updateOne({ _id: run.userId }, { $set: { activeRun: run._id } });
    await expect(transaction(session => bindPrimaryArtifact(actor, proof, hidden.reference, session))).rejects.toMatchObject({ code: 'stale_run' });
  });

  it('preserves artifact-only completion through the hosted Agents event path', async () => {
    const { run } = await fixture();
    await runs().updateOne({ _id: run._id }, { $set: { providerSessionId: 'session', inputSubmitted: false } });
    let created!:()=>void;const createdReply=new Promise<void>(resolve=>{created=resolve;});
    const controller = new AbortController(), turn = { id: 'turn', subagent_id: null, status: 'in_progress', usage: null };
    const stream = { controller, async *[Symbol.asyncIterator]() {
      yield { type: 'agent.session.turn.created', event_id: randomUUID(), turn_id: 'turn', turn } as AgentSessionEvent;
      yield { type: 'agent.session.requires_action', event_id: randomUUID(), turn_id: 'turn', session: { id: 'session', required_actions: [{ type: 'function_call', name: 'newdrugs_execute', call_id: 'graph', turn_id: 'turn', arguments: JSON.stringify({ operation: 'artifacts.create', input: graph }) }] } } as unknown as AgentSessionEvent;
      await createdReply;
      const saved=(await rows('artifacts').findOne({userId:run.userId}))!;
      // Hosted read tools use the public MCP connection outside function actions.
      await present({userId:run.userId,source:'agent',scope:'write',runId:run._id},saved._id,{},1);
      yield { type: 'agent.session.turn.completed', event_id: randomUUID(), turn_id: 'turn', turn: { ...turn, status: 'completed' }, usage: null } as AgentSessionEvent;
    } };
    const createEvent = vi.fn(async(_session:unknown,body:{events:{call_id?:string;type?:string}[]})=>{if(body.events.some(event=>event.call_id==='graph'))created();});
    const client = { beta: { agents: { sessions: { events: { stream: async () => stream, create: createEvent } } } } } as unknown as OpenAI;
    await processRun((await runs().findOne({ _id: run._id }))!, client);
    expect(await rows('messages').findOne({ _id: `${run._id}:assistant` })).toMatchObject({ text: '', artifacts: [{ presentation: 'inline', presentedRevision: 1 }] });
    expect((await runs().findOne({ _id: run._id }))?.status).toBe('completed');
    expect(createEvent.mock.calls.some(call => call[1].events[0].type === 'agent.session.input.tool_result')).toBe(true);
  });

  it('preserves artifact-only completion through the router path and saves compact continuity', async () => {
    const { run } = await fixture();
    await runs().updateOne({ _id: run._id }, { $set: { agentModel: model } });
    let round = 0;
    const createResponse = vi.fn(async () => {
      const current = round++, id = `artifact-provider-${current}`;
      const saved=current===1?(await rows('artifacts').findOne({userId:run.userId}))!:undefined;
      return { async *[Symbol.asyncIterator]() {
        const tool=current===0?{name:'newdrugs_execute',arguments:JSON.stringify({operation:'artifacts.create',input:graph})}:current===1?{name:'newdrugs_read',arguments:JSON.stringify({operation:'artifacts.present',input:{artifactId:saved!._id,contentRevision:1,presentation:'inline'}})}:undefined;
        yield { id, model: model.id, choices: [{ delta: tool ? { ...(current===0?{content:'<commentary>Drawing your graph</commentary>'}:{}), tool_calls: [{ index: 0, id: current===0?'graph':'present', function: tool }] } : { content: '' } }] };
        yield { id, model: model.id, choices: [{ delta: {}, finish_reason: tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 100, cost: .00015 } };
      } };
    });
    const client = { chat: { completions: { create: createResponse } } } as unknown as OpenAI;
    await processOpenRouterRun((await runs().findOne({ _id: run._id }))!, client);
    const message = await rows('messages').findOne({ _id: `${run._id}:assistant` });
    expect(message).toMatchObject({ text: '', artifacts: [{ presentation: 'inline', presentedRevision: 1 }] });
    const saved = JSON.stringify(await rows('routerThreads').findOne({ _id: run.userId }));
    expect(saved).toContain((message!.artifacts as ArtifactPresentationReference[])[0].artifactId);
    expect(saved).not.toContain('private-template-marker');
    expect(saved).not.toContain('private-data-marker');
    expect(createResponse).toHaveBeenCalledTimes(3);
  });
});
