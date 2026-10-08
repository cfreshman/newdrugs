import {it,expect} from 'vitest';
import {openAIInput,openAIRequest,directResult,directUsage} from '../server/routerOpenAI';
import type {AgentModelSnapshot} from '../shared/agentModel';
const model:AgentModelSnapshot={id:'openai/gpt-6-luna',name:'Luna',provider:'openai',revision:0,selectedAt:'fixture',context:1050000,outputLimit:8192,reasoning:true,price:{input:100,cached:10,cacheWrite:125,output:500}};
it('uses native Responses inputs and carries OpenAI compact output without alteration',()=>{
 const output=[{type:'message',role:'user',content:[{type:'input_text',text:'Original words.'}]},{type:'compaction',id:'cmp',encrypted_content:'opaque-canonical-state'}];
 expect(openAIInput([{role:'system',content:'prompt'},{role:'assistant',content:null,response_items:output}])).toEqual(output);
 const request=openAIRequest(model,[{role:'system',content:'prompt'},{role:'user',content:'Continue.'}],[]);expect(request.model).toBe('gpt-6-luna');expect(request.store).toBe(true);expect(request.include).toEqual(['reasoning.encrypted_content']);
});
it('keeps human words as a user turn while allowing obsolete host metadata to compact',()=>{
 const input=openAIInput([{role:'user',context_kind:'request',content:[{type:'text',text:'read deeper, one sentence'},{type:'text',text:'Current host clock and profile data'}]}]);expect(input[0].role).toBe('assistant');expect(input[1]).toEqual({role:'user',content:[{type:'input_text',text:'read deeper, one sentence'}]});
});
it('separates commentary from the answer and accounts for native search calls',()=>{
 const result=directResult(model,{id:'resp',model:'gpt-6-luna',status:'completed',usage:{input_tokens:1000,input_tokens_details:{cached_tokens:100,cache_write_tokens:100},output_tokens:100},output:[{type:'message',phase:'commentary',content:[{type:'output_text',text:'Checking the source'}]},{type:'web_search_call',status:'completed',action:{type:'search'}},{type:'message',phase:'final_answer',content:[{type:'output_text',text:'The answer.',annotations:[]}]}]});expect(result.message.content).toBe('<commentary>Checking the source</commentary>The answer.');expect(result.costNanos).toBe(10143500);
 expect(directUsage(model,{input_tokens:1000,input_tokens_details:{cached_tokens:100},output_tokens:100}).costNanos).toBe(141000);
});
