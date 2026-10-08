import {beforeAll,beforeEach,afterAll,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import type OpenAI from 'openai';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {createGuest,registerAccount,users} from '../server/auth';
import {ensureStarterPool} from '../server/starterPool';
import {reserveRun,runs,wallet,recordTurnUsage,guardSpend} from '../server/wallet';
import {decideApprovals} from '../server/agent';
import {replyToReview} from '../server/reviewReply';
import {processOpenRouterRun} from '../server/openRouterAgent';
import {wakeRun} from '../server/sleep';
import {clearAgentChat} from '../server/account';
import {reconcileRouterUsage} from '../server/routerUsage';
const model={id:'~anthropic/claude-haiku-latest',name:'Haiku',provider:'openrouter' as const,context:1000000,outputLimit:8192,reasoning:true,revision:0,selectedAt:'2026-10-07',price:{input:100,cached:10,cacheWrite:125,output:500}};
let sequence=0;
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated database required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{await connectDatabase();});beforeEach(async()=>{await clean();await ensureStarterPool();});afterAll(async()=>{await clean();await mongo.close();});
async function fixture(){const guest=await createGuest(),owner=await registerAccount(guest._id,`router_${++sequence}`,'test-hash',`192.0.2.${sequence}`);const id=`${owner._id}:${randomUUID()}`;await reserveRun(owner._id,id,'Synthetic request');await runs().updateOne({_id:id},{$set:{status:'running',lease:'lease',leaseUntil:Date.now()+60000,agentModel:model}});return (await runs().findOne({_id:id}))!;}
async function reclaim(id:string){await runs().updateOne({_id:id},{$set:{status:'running',lease:randomUUID(),leaseUntil:Date.now()+60000}});return (await runs().findOne({_id:id}))!;}
function mock(responses:{text?:string;calls?:{id:string;name:string;args:unknown}[];reasoning?:any[];finish?:string}[]){let n=0;const create=vi.fn(async()=>{const response=responses[n++];if(!response)throw Error('Unexpected inference');const id=`gen-${randomUUID()}`;return {async *[Symbol.asyncIterator](){yield {id,model:'anthropic/claude-haiku-5.5',choices:[{delta:{content:response.text||'',reasoning_details:response.reasoning,tool_calls:response.calls?.map((call,index)=>({index,id:call.id,function:{name:call.name,arguments:JSON.stringify(call.args)}}))}}]};yield {id,model:'anthropic/claude-haiku-5.5',choices:[{delta:{},finish_reason:response.finish||(response.calls?'tool_calls':'stop')}],usage:{prompt_tokens:1000,completion_tokens:100,cost:.00015}};}};});return {create,client:{chat:{completions:{create}}} as unknown as OpenAI};}
it('reads through the real MCP, preserves signatures and pins the resolved alias',async()=>{
 const run=await fixture(),reasoning=[{index:0,type:'reasoning.encrypted',data:'signed-prefix'}];
 const provider=mock([{text:'<commentary>Checking your identity</commentary>',reasoning,calls:[{id:'read',name:'newdrugs_read',args:{operation:'identity.get',input:{}}}]},{text:'Verified.'}]);
 await processOpenRouterRun(run,provider.client);const saved=(await runs().findOne({_id:run._id}))!;
 expect(saved).toMatchObject({status:'completed',draft:'Verified.',chargedNanos:300000,billingRate:{model:'anthropic/claude-haiku-5.5'}});
 const first=(provider.create.mock.calls as any)[0][0],second=(provider.create.mock.calls as any)[1][0];expect(first.tools.every((tool:any)=>tool.function.strict===false)).toBe(true);expect(second.model).toBe('anthropic/claude-haiku-5.5');
 expect(second.messages.find((message:any)=>message.role==='assistant').reasoning_details).toEqual(reasoning);expect(JSON.parse(second.messages.find((message:any)=>message.role==='tool').content)).toMatchObject({ok:true,data:{id:run.userId}});
 expect(await rows('routerStates').countDocuments()).toBe(0);expect(await wallet(run.userId)).toMatchObject({reservedNanos:0,balanceNanos:1e9-300000});
});
it('resumes an exact publish review once and keeps the original model snapshot',async()=>{
 const run=await fixture(),provider=mock([{calls:[{id:'post',name:'newdrugs_execute',args:{operation:'posts.create',input:{text:'Synthetic reviewed post'}}}]},{text:'Published.'}]);
 await processOpenRouterRun(run,provider.client);const review=(await runs().findOne({_id:run._id}))!;expect(review.status).toBe('waiting_for_approval');expect(await rows('posts').countDocuments()).toBe(0);
 await rows('agentModelSettings').insertOne({_id:'chat',model:'other/model',revision:4});await decideApprovals(run.userId,run._id,review.revision,[{id:'post',approved:true}]);await processOpenRouterRun(await reclaim(run._id),provider.client);
 expect(await rows('posts').countDocuments({text:'Synthetic reviewed post'})).toBe(1);expect((await runs().findOne({_id:run._id}))?.status).toBe('completed');expect(provider.create).toHaveBeenCalledTimes(2);expect((provider.create.mock.calls as any)[1][0].model).toBe('anthropic/claude-haiku-5.5');
});
it('returns a declined review correction as a real human turn and executes no post',async()=>{
 const run=await fixture(),provider=mock([{calls:[{id:'post',name:'newdrugs_execute',args:{operation:'posts.create',input:{text:'Declined synthetic post'}}}]},{text:'Here is another option.'}]);await processOpenRouterRun(run,provider.client);const review=(await runs().findOne({_id:run._id}))!;
 await replyToReview(run.userId,{runId:run._id,revision:review.revision},{requestId:randomUUID(),text:'skip posting, give another option',fileIds:[]});await processOpenRouterRun(await reclaim(run._id),provider.client);
 const messages=(provider.create.mock.calls as any)[1][0].messages;expect(messages.at(-1)).toMatchObject({role:'user',content:expect.stringContaining('skip posting, give another option')});expect(messages.find((message:any)=>message.role==='tool').content).not.toContain('userReply');expect(await rows('posts').countDocuments()).toBe(0);
});
it('persists sleep without inference and resumes with the same signed transcript',async()=>{
 const run=await fixture(),provider=mock([{reasoning:[{index:0,type:'reasoning.encrypted',data:'signed'}],calls:[{id:'sleep',name:'newdrugs_sleep',args:{seconds:10,reason:'Requested wait'}}]},{text:'Resumed.'}]);await processOpenRouterRun(run,provider.client);expect((await runs().findOne({_id:run._id}))?.status).toBe('sleeping');expect(provider.create).toHaveBeenCalledOnce();
 await wakeRun(run.userId,run._id,true);await processOpenRouterRun(await reclaim(run._id),provider.client);expect((await runs().findOne({_id:run._id}))?.status).toBe('completed');expect((provider.create.mock.calls as any)[1][0].messages.find((message:any)=>message.role==='tool').content).toContain('host resumed');
});
it('never repeats an interrupted paid generation, and chat clearing removes native context',async()=>{
 const run=await fixture();await rows('routerStates').insertOne({_id:run._id,userId:run.userId,purpose:'chat',messages:[],tools:[],rounds:1,replies:{},inflight:{id:'gen-interrupted'}});
 const provider=mock([]);await processOpenRouterRun(run,provider.client);expect(provider.create).not.toHaveBeenCalled();expect((await runs().findOne({_id:run._id}))?.status).toBe('failed');
 const next=await fixture();await rows('routerStates').insertOne({_id:next._id,userId:next.userId,purpose:'chat',messages:[{role:'user',content:'private'}],tools:[],rounds:0,replies:{}});await clearAgentChat(next.userId);expect(await rows('routerStates').countDocuments({userId:next.userId})).toBe(0);expect((await users().findOne({_id:next.userId}))?.reservedNanos).toBe(0);
});
it('settles interrupted generation charges once even after a later generation',async()=>{
 const run=await fixture();await runs().updateOne({_id:run._id},{$set:{providerTurnId:'gen-new',responseIds:['gen-old','gen-new']}});
 const usage={input_tokens:1000,input_tokens_details:{cached_tokens:0},output_tokens:100,output_tokens_details:{reasoning_tokens:0},total_tokens:1100};await recordTurnUsage(run._id,'gen-new',usage,0,run.lease,200000);
 await rows('routerUsageJobs').insertOne({_id:'gen-old',runId:run._id,userId:run.userId,availableAt:0,attempts:0});const get=vi.fn(async()=>({data:{total_cost:.0003,native_tokens_prompt:1000,native_tokens_completion:100}}));
 await reconcileRouterUsage({get} as unknown as OpenAI);await recordTurnUsage(run._id,'gen-old',usage);expect((await runs().findOne({_id:run._id}))?.chargedNanos).toBe(500000);expect(await rows('routerUsageJobs').countDocuments()).toBe(0);
});
it('checks a paid request against remaining automation budget before inference',async()=>{
 const run=await fixture();await runs().updateOne({_id:run._id},{$set:{purpose:'automation',budgetNanos:1000000,costNanos:800000}});await expect(guardSpend(run._id,run.lease!,300000)).rejects.toMatchObject({code:'automation_budget'});
});
