import {it,expect} from 'vitest';
import {anthropicRequest,anthropicUsage,AnthropicAccumulator} from '../server/routerAnthropic';
import type {AgentModelSnapshot} from '../shared/agentModel';
const model:AgentModelSnapshot={id:'~anthropic/claude-haiku-latest',name:'Haiku',provider:'openrouter',revision:0,selectedAt:'fixture',context:1000000,outputLimit:8192,reasoning:true,price:{input:100,cached:10,cacheWrite:125,output:500,threshold:100000,long:{input:500,cached:50,cacheWrite:625,output:2500}}};
it('enables real threshold compaction and preserves native blocks without strict grammar',()=>{
 const block={type:'compaction',content:'The user requested one sentence.',signature:'native-signature'};
 const request=anthropicRequest(model,[{role:'system',content:'Stable prompt'},{role:'assistant',content:null,native_content:[block]},{role:'user',content:'Continue.'}],[{type:'function',function:{name:'read',description:'Read',parameters:{type:'object'},strict:false}}]);
 expect(request).toMatchObject({context_management:{edits:[{type:'compact_20260112',trigger:{type:'input_tokens',value:100000},pause_after_compaction:true}]},tools:[{strict:false}],provider:{order:['anthropic'],allow_fallbacks:false,require_parameters:true}});expect(request.messages[0].content).toEqual([block]);expect(request).not.toHaveProperty('temperature');
});
it('hides the provider compaction block and accounts for compaction iterations',()=>{
 const result=new AnthropicAccumulator();result.apply({type:'message_start',message:{id:'gen-native',model:'anthropic/claude-haiku-5.5',usage:{input_tokens:0,output_tokens:0}}});result.apply({type:'content_block_start',index:0,content_block:{type:'compaction',content:''}});result.apply({type:'content_block_delta',index:0,delta:{type:'compaction_delta',content:'A native summary.'}});result.apply({type:'message_delta',delta:{stop_reason:'compaction'},usage:{input_tokens:0,output_tokens:0,cost:.0085,iterations:[{type:'compaction',input_tokens:84000,output_tokens:200,cache_read_input_tokens:0,cache_creation_input_tokens:0}]}});
 expect(result.result(model)).toMatchObject({finish:'compaction',message:{content:null,native_content:[{type:'compaction',content:'A native summary.'}]},usage:{prompt_tokens:84000,completion_tokens:200},costNanos:8500000});
});
it('prices native generations separately so their aggregate does not invent a long-context tariff',()=>{
 const result=anthropicUsage(model,{iterations:[{type:'compaction',input_tokens:90000,output_tokens:1000},{type:'message',input_tokens:30000,output_tokens:1000}]});expect(result.usage.prompt_tokens).toBe(120000);expect(result.costNanos).toBe(13000000);
});
it('preserves complete streamed thinking signatures and fragmented tool arguments',()=>{
 const accumulator=new AnthropicAccumulator();accumulator.apply({type:'message_start',message:{id:'gen-tool',model:'anthropic/claude-haiku-5.5',usage:{input_tokens:1000}}});accumulator.apply({type:'content_block_start',index:0,content_block:{type:'thinking',thinking:'',signature:''}});accumulator.apply({type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'signed-'}});accumulator.apply({type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'block'}});accumulator.apply({type:'content_block_start',index:1,content_block:{type:'tool_use',id:'call',name:'read',input:{}}});accumulator.apply({type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:'{"operation":'}});accumulator.apply({type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:'"identity.get"}'}});accumulator.apply({type:'message_delta',delta:{stop_reason:'tool_use'},usage:{output_tokens:100,cost:.00015}});
 const result=accumulator.result(model);expect(result.message.native_content?.[0].signature).toBe('signed-block');expect(result.message.tool_calls?.[0].function.arguments).toBe('{"operation":"identity.get"}');expect(result.message.content).toBeNull();
});
