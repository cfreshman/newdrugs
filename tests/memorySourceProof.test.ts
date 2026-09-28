import {createHash} from 'node:crypto';
import {it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({post:{id:'post',text:'I enjoy hiking',likeCount:0},note:null as any}));
vi.mock('../server/auth',async()=>({hash:(text:string)=>(awaitImport as any)(text)}));
function awaitImport(text:string){return createHash('sha256').update(text).digest('hex');}
vi.mock('../server/operations',()=>({executeOperation:async()=>state.post}));
vi.mock('../server/db',()=>({rows:(name:string)=>({findOne:async()=>null,find:()=>({sort:()=>({limit:()=>({toArray:async()=>name==='agentMemorySlots'?[state.note]:[]})})})})}));
import {agentMemoryContext,memorySourceContent} from '../server/agentMemory';
it('keeps durable evidence after a like but invalidates an edited source',async()=>{
 state.note={_id:'note',userId:'me',key:'hiking',title:'Activity',content:'I enjoy hiking',core:true,sources:[{kind:'post',id:'post'}],sourceProofs:[awaitImport(JSON.stringify(memorySourceContent('post',state.post)))],revision:1,estimatedTokens:30,updatedAt:'2026-09-27T00:00:00Z'};
 expect((await agentMemoryContext('me')).slots).toHaveLength(1);
 state.post={...state.post,likeCount:1};
 expect((await agentMemoryContext('me')).slots).toHaveLength(1);
 state.post={...state.post,text:'I no longer enjoy hiking'};
 expect(await agentMemoryContext('me')).toMatchObject({slots:[],omittedSlots:1});
});
