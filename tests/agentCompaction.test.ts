import {it,expect} from 'vitest';
import {compactionNeeded,compactionInput,parseConversationSummary,compactedConversation,compactionContextTokens} from '../server/agentCompaction';
import {completedRouterHistory} from '../server/routerContext';
import type {AgentModelSnapshot} from '../shared/agentModel';
const model:AgentModelSnapshot={id:'anthropic/claude-haiku-5.5',name:'Haiku',provider:'openrouter',revision:0,selectedAt:'fixture',context:1000000,outputLimit:8192,reasoning:true,price:{input:100,cached:10,cacheWrite:125,output:500}};
const summary={overview:'A continuing conversation.',activeTask:'Read deeper and return one sentence.',preferences:['A sample is acceptable when it serves the request.'],decisions:[],evidence:['Read the recent thirty records.'],completedActions:['An invitation was already submitted.'],openQuestions:[],nextSteps:['Continue the requested analysis.']};
it('compacts before a 100k request including output reserve, using reported usage when available',()=>{
 expect(compactionContextTokens(model)).toBe(100000);expect(compactionNeeded(model,[{role:'user',content:'x'.repeat(190000)}],[])).toBe(true);expect(compactionNeeded(model,[{role:'user',content:'short'}],[])).toBe(false);
 expect(compactionNeeded(model,[{role:'user',content:'short'}],[],{estimate:50,reported:95000})).toBe(true);
});
it('lets Luna use its larger context instead of Haiku\'s 100k threshold',()=>{
 const luna:AgentModelSnapshot={...model,id:'openai/gpt-6-luna',provider:'openai',context:1050000};
 expect(compactionContextTokens(luna)).toBe(840000);
 for(const reported of [95000,300000,800000])expect(compactionNeeded(luna,[{role:'user',content:'short'}],[],{estimate:50,reported})).toBe(false);
 expect(compactionNeeded(luna,[{role:'user',content:'short'}],[],{estimate:50,reported:835000})).toBe(true);
 expect(compactionContextTokens({...luna,context:32000})).toBe(25600);
});
it('makes a real handoff and starts a fresh prefix without old signed reasoning or tool calls',()=>{
 const messages:any[]=[{role:'system',content:'stable instructions'},{role:'user',content:'read deeper'},{role:'assistant',content:null,reasoning_details:[{data:'private-signature'}],tool_calls:[{id:'call'}]},{role:'tool',tool_call_id:'call',content:'verified evidence'}];
 const input=compactionInput(messages);expect(JSON.stringify(input)).not.toContain('private-signature');expect(JSON.stringify(input)).toContain('verified evidence');
 const parsed=parseConversationSummary(JSON.stringify(summary)),replacement=compactedConversation(messages[0],parsed,[{role:'assistant',content:'Earlier answer',reasoning_details:[{}],tool_calls:[]},{role:'user',content:'no, this subject'}]);
 expect(replacement[0]).toEqual(messages[0]);expect(replacement.at(-1)).toEqual({role:'user',content:'no, this subject'});expect(JSON.stringify(replacement)).not.toContain('reasoning_details');expect(JSON.stringify(replacement)).not.toContain('tool_calls');expect(replacement[1].content).toContain('invitation was already submitted');
 expect(()=>parseConversationSummary('not json')).toThrow();
});
it('keeps completed tool exchanges but omits raw pixels and prefix-bound thinking from future runs',()=>{
 const saved=completedRouterHistory([{role:'system',content:'old system'},{role:'assistant',content:null,reasoning_details:[{data:'secret-signed-block'}],tool_calls:[{id:'call',type:'function',function:{name:'read_file',arguments:'{"fileId":"owned"}'}}]},{role:'tool',tool_call_id:'call',content:'Image metadata'},{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,pixels'}}]}]);
 expect(JSON.stringify(saved)).not.toContain('secret-signed-block');expect(JSON.stringify(saved)).not.toContain('base64');expect(saved[0].tool_calls?.[0].function.arguments).toContain('owned');expect(saved[1].tool_call_id).toBe('call');
});
