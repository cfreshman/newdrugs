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
import {routerConversationInput,sessionInput} from '../server/sessionContext';
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
 expect(second.messages.find((message:any)=>message.role==='assistant'&&message.tool_calls).reasoning_details).toEqual(reasoning);expect(JSON.parse(second.messages.find((message:any)=>message.role==='tool').content)).toMatchObject({ok:true,data:{id:run.userId}});
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
 const messages=(provider.create.mock.calls as any)[1][0].messages;expect(messages.at(-1)).toMatchObject({role:'user',content:[{type:'text',text:'skip posting, give another option'},{type:'text',text:expect.any(String)}]});expect(messages.find((message:any)=>message.role==='tool').content).not.toContain('userReply');expect(await rows('posts').countDocuments()).toBe(0);
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
it('keeps conversational roles and the current request, without echoing history in its answer',async()=>{
 const run=await fixture();const turns=[['user','ur haiku 5.5'],['assistant','I can look up its release.'],['user','look it up, released today. previously u were luna 6'],['assistant','I mistakenly looked up Luna.']];
 await rows('messages').insertMany(turns.map(([role,text],index)=>({_id:`history-${index}`,userId:run.userId,role,text,source:'app',createdAt:`2026-10-01T00:00:0${index}.000Z`})));await updateRequest(run,'no. haiku');
 const input=await routerConversationInput(run);const history=input.filter(message=>typeof message.content==='string'&&turns.some(([,text])=>text===message.content));expect(history.map(message=>[message.role,message.content])).toEqual(turns);
 expect(input.at(-1)?.role).toBe('user');expect(input.at(-1)?.content[0]).toEqual({type:'text',text:'no. haiku'});
 expect(JSON.stringify(input)).not.toContain('Historical requests are not new authorization');
 const hosted=JSON.stringify(await sessionInput(run));expect(hosted).toContain('Recover conversational intent');expect(hosted).toContain('role=\\"assistant\\"');
 const provider=mock([{text:'Looking up Haiku.'}]);await processOpenRouterRun(run,provider.client);expect((await runs().findOne({_id:run._id}))?.draft).toBe('Looking up Haiku.');
});
async function updateRequest(run:Awaited<ReturnType<typeof fixture>>,text:string){run.text=text;run.timezone='America/New_York';await runs().updateOne({_id:run._id},{$set:{text,timezone:run.timezone}});}
it('returns host-verified model identity and a user-local clock through its runtime tool',async()=>{
 const run=await fixture();await updateRequest(run,'which model are you');const provider=mock([{calls:[{id:'runtime',name:'newdrugs_runtime',args:{}}]},{text:'Claude Haiku 5.5.'}]);await processOpenRouterRun(run,provider.client);
 const second=(provider.create.mock.calls as any)[1][0];expect(JSON.parse(second.messages.find((message:any)=>message.tool_call_id==='runtime').content)).toMatchObject({provider:'openrouter',configuredModel:model.id,resolvedModel:'anthropic/claude-haiku-5.5',clock:{timeZone:'America/New_York'}});
});
async function longThread(run:Awaited<ReturnType<typeof fixture>>){
 await rows('messages').insertOne({_id:'old-assistant',userId:run.userId,role:'assistant',text:'The full visible chat stays intact.',source:'app',createdAt:'2026-01-01T00:00:00.000Z'});
 await rows('routerThreads').insertOne({_id:run.userId,generation:0,messages:[{role:'user',content:'Old conversation. '.repeat(15000)}],through:'old-assistant',updatedAt:'2026-01-01T00:00:00.000Z'});
}
it('actually summarizes near 100k, bills once, and continues with the request and signed tool flow intact',async()=>{
 const run=await fixture();await longThread(run);await updateRequest(run,'Read deeper, then give a single sentence.');
 const summary={overview:'Long-running chat.',activeTask:run.text,preferences:[],decisions:['Sampling is fine when suitable.'],evidence:['Thirty recent records were read.'],completedActions:[],openQuestions:[],nextSteps:['Continue deeper.']};
 const provider=mock([{text:JSON.stringify(summary)},{reasoning:[{index:0,type:'reasoning.encrypted',data:'new-prefix-signature'}],calls:[{id:'read',name:'newdrugs_read',args:{operation:'identity.get',input:{}}}]},{text:'One distilled sentence.'}]);await processOpenRouterRun(run,provider.client);
 const calls=provider.create.mock.calls as any;expect(calls[0][0].tools).toBeUndefined();expect(calls[1][0].messages.some((message:any)=>String(message.content).includes('Conversation handoff'))).toBe(true);expect(JSON.stringify(calls[1][0].messages)).not.toContain('Old conversation. '.repeat(100));expect(calls[1][0].messages.at(-1).content[0].text).toBe(run.text);
 expect(calls[2][0].messages.find((message:any)=>message.tool_calls?.[0]?.id==='read').reasoning_details).toEqual([{index:0,type:'reasoning.encrypted',data:'new-prefix-signature'}]);expect((await runs().findOne({_id:run._id}))!).toMatchObject({status:'completed',draft:'One distilled sentence.',chargedNanos:450000});
 expect((await rows('messages').findOne({_id:'old-assistant'}))?.text).toBe('The full visible chat stays intact.');expect(await rows('routerThreads').findOne({_id:run.userId})).toMatchObject({through:`${run._id}:assistant`});
});
it('keeps the preceding context if compaction fails and never publishes a malformed summary',async()=>{
 const run=await fixture();await longThread(run);const provider=mock([{text:'not a valid summary'}]);await processOpenRouterRun(run,provider.client);
 expect((await runs().findOne({_id:run._id}))!).toMatchObject({status:'failed',chargedNanos:150000,error:expect.stringContaining('could not be compacted')});expect((await rows('routerThreads').findOne({_id:run.userId}))?.through).toBe('old-assistant');
});
it('retains completed tool history across tasks and removes it when chat is cleared',async()=>{
 const run=await fixture(),first=mock([{calls:[{id:'read',name:'newdrugs_read',args:{operation:'identity.get',input:{}}}]},{text:'The earlier answer.'}]);await processOpenRouterRun(run,first.client);
 const nextId=`${run.userId}:${randomUUID()}`;await reserveRun(run.userId,nextId,'continue');const next=await reclaim(nextId);next.agentModel=model;await runs().updateOne({_id:nextId},{$set:{agentModel:model}});const second=mock([{text:'The continued answer.'}]);await processOpenRouterRun(next,second.client);
 const input=(second.create.mock.calls as any)[0][0].messages;expect(input.some((message:any)=>message.tool_call_id==='read')).toBe(true);expect(input.at(-1).content[0].text).toBe('continue');expect((await runs().findOne({_id:nextId}))?.draft).toBe('The continued answer.');
 await clearAgentChat(run.userId);expect(await rows('routerThreads').countDocuments({_id:run.userId})).toBe(0);
});
it('replays a native compaction checkpoint verbatim, keeps it out of chat and meters it once',async()=>{
 const run=await fixture();const nativeBlock={type:'compaction',content:'Preserve the active request and completed operations.'};let round=0;
 const post=vi.fn(async()=>{const n=round++,id=`gen-${randomUUID()}`;return {async *[Symbol.asyncIterator](){yield {type:'message_start',message:{id,model:'anthropic/claude-haiku-5.5',usage:{input_tokens:n?1000:0,output_tokens:0}}};yield {type:'content_block_start',index:0,content_block:n?{type:'text',text:''}:{type:'compaction',content:''}};yield {type:'content_block_delta',index:0,delta:n?{type:'text_delta',text:'A normal answer.'}:{type:'compaction_delta',content:nativeBlock.content}};yield {type:'message_delta',delta:{stop_reason:n?'end_turn':'compaction'},usage:n?{output_tokens:100,cost:.00015}:{input_tokens:0,output_tokens:0,cost:.009,iterations:[{type:'compaction',input_tokens:90000,output_tokens:200,cache_read_input_tokens:0,cache_creation_input_tokens:0}]}};}};});
 await processOpenRouterRun(run,{post} as unknown as OpenAI);const second=(post.mock.calls as any)[1][1].body;expect(second.messages[0]).toMatchObject({role:'assistant',content:[nativeBlock]});expect(second.messages.at(-1).content[0].text).toBe(run.text);expect((await runs().findOne({_id:run._id}))!).toMatchObject({status:'completed',draft:'A normal answer.',chargedNanos:9150000});
 const thread=await rows('routerThreads').findOne({_id:run.userId});expect(JSON.stringify(thread)).toContain(nativeBlock.content);expect((await rows('messages').findOne({_id:`${run._id}:assistant`}))?.text).toBe('A normal answer.');
});
it('continues a 300k Luna conversation without invoking Haiku\'s early compaction',async()=>{
 const run=await fixture();run.agentModel={...model,id:'openai/gpt-6-luna',provider:'openai',context:1050000};await runs().updateOne({_id:run._id},{$set:{agentModel:run.agentModel}});
 const count=vi.fn(async()=>({input_tokens:300000})),compact=vi.fn();
 const create=vi.fn(async()=>({async *[Symbol.asyncIterator](){yield {type:'response.created',response:{id:'resp-long',model:'gpt-6-luna'}};yield {type:'response.completed',response:{id:'resp-long',model:'gpt-6-luna',status:'completed',usage:{input_tokens:300000,input_tokens_details:{cached_tokens:0},output_tokens:100},output:[{id:'msg',type:'message',role:'assistant',phase:'final_answer',status:'completed',content:[{type:'output_text',text:'The uncompressed answer.',annotations:[]}]}]}};}}));
 await processOpenRouterRun(run,{responses:{inputTokens:{count},compact,create}} as unknown as OpenAI);
 expect(count).toHaveBeenCalledOnce();expect(compact).not.toHaveBeenCalled();expect(create).toHaveBeenCalledOnce();expect((await runs().findOne({_id:run._id}))!).toMatchObject({status:'completed',draft:'The uncompressed answer.',chargedNanos:30050000});
});
it('uses direct OpenAI native compaction with exact counts and preserves its entire canonical output',async()=>{
 const run=await fixture();run.agentModel={...model,id:'openai/gpt-6-luna',provider:'openai',context:1050000};await runs().updateOne({_id:run._id},{$set:{agentModel:run.agentModel}});
 const canonical=[{type:'message',role:'user',content:[{type:'input_text',text:run.text}]},{type:'compaction',id:'cmp-state',encrypted_content:'canonical opaque state'}];let counted=0;
 const count=vi.fn(async()=>({input_tokens:++counted===1?835000:1000})),compact=vi.fn(async()=>({id:'cmp-receipt',output:canonical,usage:{input_tokens:835000,input_tokens_details:{cached_tokens:0},output_tokens:200}}));
 const create=vi.fn(async()=>({async *[Symbol.asyncIterator](){yield {type:'response.created',response:{id:'resp-main',model:'gpt-6-luna'}};yield {type:'response.output_item.added',item:{id:'msg',type:'message',phase:'final_answer'}};yield {type:'response.output_text.delta',item_id:'msg',delta:'The continued answer.'};yield {type:'response.completed',response:{id:'resp-main',model:'gpt-6-luna',status:'completed',usage:{input_tokens:1000,input_tokens_details:{cached_tokens:0},output_tokens:100},output:[{id:'msg',type:'message',role:'assistant',phase:'final_answer',status:'completed',content:[{type:'output_text',text:'The continued answer.',annotations:[]}]}]}};}}));
 const client={responses:{inputTokens:{count},compact,create}} as unknown as OpenAI;await processOpenRouterRun(run,client);
 expect(compact).toHaveBeenCalledOnce();expect((create.mock.calls as any)[0][0].input).toEqual(canonical);expect((await runs().findOne({_id:run._id}))!).toMatchObject({status:'completed',draft:'The continued answer.',chargedNanos:83750000});expect(await rows('responseCleanup').findOne({_id:'resp-main'})).toMatchObject({userId:run.userId});
 await clearAgentChat(run.userId);expect((await rows('responseCleanup').findOne({_id:'resp-main'}))?.clearedAt).toEqual(expect.any(Number));
});
