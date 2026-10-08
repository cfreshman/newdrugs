import {expect,it} from 'vitest';
import {compatibleModel,modelCost,tokenNanos} from '../server/agentModels';
import {RouterAccumulator,inputMessages,routerRequest,routerUsageCost,visibleRouterText} from '../server/openRouter';
import {routerToolReply} from '../server/openRouterAgent';
import type {AgentModelSnapshot} from '../shared/agentModel';
const raw={id:'~anthropic/claude-haiku-latest',name:'Haiku',context_length:1000000,top_provider:{max_completion_tokens:128000},architecture:{input_modalities:['text','image'],output_modalities:['text']},supported_parameters:['tools','tool_choice','reasoning'],pricing:{prompt:'0.0000001',completion:'0.0000005',input_cache_read:'0.00000001',input_cache_write:'0.000000125',overrides:[{min_prompt_tokens:100000,prompt:'0.0000005',completion:'0.0000025',input_cache_read:'0.00000005',input_cache_write:'0.000000625'}]}};
const model:AgentModelSnapshot={...compatibleModel(raw)!,provider:'openrouter',revision:0,selectedAt:'2026-10-07'};
it('accepts compatible aliases and excludes missing tools, vision or verified prices',()=>{
 expect(model).toMatchObject({id:raw.id,outputLimit:8192,reasoning:true,price:{input:100,cached:10,cacheWrite:125,output:500,threshold:100000}});
 for(const change of [{supported_parameters:['tools']},{architecture:{input_modalities:['text'],output_modalities:['text']}},{pricing:{}},{id:'anthropic/claude:online'}])expect(compatibleModel({...raw,...change})).toBeNull();
 expect(tokenNanos('0.0000000001')).toBe(1);expect(()=>tokenNanos('NaN')).toThrow();
});
it('applies the long-context rate to the whole request and uses actual provider cost',()=>{
 expect(modelCost(model,100000,1000,1000,100)).toBe(9985000);
 expect(modelCost(model,100001,1000,1000,100)).toBe(49925500);
 expect(routerUsageCost(model,{prompt_tokens:1000,completion_tokens:100,cost:.00014525})).toBe(145250);
 expect(()=>modelCost(model,100,90,20,0)).toThrow();
});
it('uses the Haiku strict-tool fix, adaptive effort and stable Anthropic routing',()=>{
 const tools:any[]=[{type:'function',function:{name:'read',parameters:{type:'object'},strict:true}}];
 const request=routerRequest(model,[{role:'user',content:'test'}],tools);
 expect(request).toMatchObject({model:raw.id,reasoning:{effort:'medium'},provider:{order:['anthropic'],allow_fallbacks:false,require_parameters:true},tools:[{function:{strict:false}}]});
 expect(request).not.toHaveProperty('temperature');expect(request).not.toHaveProperty('thinking');expect(tools[0].function.strict).toBe(true);
 expect(routerRequest({...model,id:'other/model',reasoning:false},[],[])).not.toHaveProperty('reasoning');
});
it('preserves streamed reasoning signatures, fragmented tool calls and final-chunk usage',()=>{
 const accumulator=new RouterAccumulator();
 accumulator.apply({id:'gen-test',model:'anthropic/claude-haiku-5.5',choices:[{delta:{content:'<commentary>Checking identity',reasoning_details:[{type:'reasoning.encrypted',index:0,data:'signed-'}],tool_calls:[{index:0,id:'call',function:{name:'read',arguments:'{"op'}}]}}]});
 accumulator.apply({choices:[{delta:{content:'</commentary>',reasoning_details:[{type:'reasoning.encrypted',index:0,data:'block'}],tool_calls:[{index:0,function:{arguments:'":"identity"}'}}]},finish_reason:'tool_calls'}],usage:{prompt_tokens:100,completion_tokens:20,cost:.00002}});
 const response=accumulator.result(model);expect(response.message.reasoning_details).toEqual([{type:'reasoning.encrypted',index:0,data:'signed-block'}]);
 expect(response.message.tool_calls?.[0].function.arguments).toBe('{"op":"identity"}');expect(visibleRouterText(response.message.content)).toEqual({preamble:'Checking identity',draft:''});
 expect(visibleRouterText('<comm')).toEqual({preamble:'',draft:''});expect(visibleRouterText('Final answer')).toEqual({preamble:'',draft:'Final answer'});
});
it('reports refusal and truncated responses rather than treating them as success',()=>{
 for(const finish of ['content_filter','length','error']){const accumulator=new RouterAccumulator();accumulator.apply({id:'gen',model:model.id,choices:[{delta:{content:'partial'},finish_reason:finish}],usage:{prompt_tokens:10,completion_tokens:10}});expect(()=>accumulator.result(model)).toThrow();}
});
it('puts review corrections in user messages and images outside tool text',()=>{
 const correction=routerToolReply(JSON.stringify({ok:false,status:'not_executed',userReply:{text:'Do this instead',files:[]}}));
 expect(JSON.parse(correction.content)).not.toHaveProperty('userReply');expect(correction.followUp[0]).toMatchObject({role:'user',content:[{type:'text',text:'Do this instead'},{type:'text',text:expect.stringContaining('files')}]});
 const image=routerToolReply([{type:'input_text',text:'Owned image'},{type:'input_image',image_url:'data:image/png;base64,AA'}]);expect(image.content).not.toContain('base64');expect(image.followUp[0].content[0].type).toBe('image_url');
 expect(inputMessages([{role:'user',content:[{type:'input_image',image_url:'https://example.org/p.png'}]}])[0].content).toEqual([{type:'image_url',image_url:{url:'https://example.org/p.png',detail:'auto'}}]);
});
