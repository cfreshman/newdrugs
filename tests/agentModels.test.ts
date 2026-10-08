import {beforeAll,beforeEach,afterAll,expect,it,vi} from 'vitest';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {config} from '../server/config';
import {hash} from '../server/auth';
import {agentModelCatalog,agentModelSetting,setAgentModel} from '../server/agentModels';
import {DEFAULT_OPENROUTER_MODEL} from '../shared/agentModel';
import {createApp} from '../server/app';
import type {Server} from 'node:http';
import type {AddressInfo} from 'node:net';
const listed={id:'~anthropic/claude-haiku-latest',name:'Haiku',context_length:1000000,top_provider:{max_completion_tokens:128000},architecture:{input_modalities:['text','image'],output_modalities:['text']},supported_parameters:['tools','tool_choice','reasoning'],pricing:{prompt:'0.0000001',completion:'0.0000005'}};
let server:Server,origin:string;const realFetch=globalThis.fetch;
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated database required');for(const name of ['agentModelSettings','adminOwners','adminSessions','sessions','requestRates'])await rows(name).deleteMany({});}
beforeAll(async()=>{
 await connectDatabase();vi.stubGlobal('fetch',((url:any,options:any)=>String(url)==='https://openrouter.ai/api/v1/models'?Promise.resolve(new Response(JSON.stringify({data:[listed,{...listed,id:'text-only',architecture:{input_modalities:['text'],output_modalities:['text']}}]}))):realFetch(url,options)) as typeof fetch);await agentModelCatalog(true);
 await new Promise<void>(resolve=>{server=createApp().listen(0,'127.0.0.1',()=>resolve());});origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(clean);afterAll(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));await clean();vi.unstubAllGlobals();await mongo.close();});
it('validates compatibility and prevents stale admin changes',async()=>{
 expect(await agentModelSetting()).toMatchObject({model:DEFAULT_OPENROUTER_MODEL,revision:0});expect(await setAgentModel(listed.id,0,'owner')).toMatchObject({model:listed.id,revision:1});
 await expect(setAgentModel(listed.id,0,'owner')).rejects.toMatchObject({code:'model_changed'});await expect(setAgentModel('text-only',1,'owner')).rejects.toMatchObject({code:'incompatible_model'});
 expect(await setAgentModel(listed.id,1,'owner')).toMatchObject({revision:2});expect((await agentModelCatalog()).map(model=>model.id)).toEqual([listed.id]);
});
it('requires the admin owner and never returns credentials',async()=>{
 const headers={'X-NewDrugs-Dev-Key':config.DEV_ACCESS_KEY};expect((await fetch(`${origin}/api/admin/agent-model`,{headers})).status).toBe(401);
 await rows('adminOwners').insertOne({_id:'owner',username:'owner',passwordHash:'secret',createdAt:new Date().toISOString()});await rows('adminSessions').insertOne({_id:hash('owner-session'),ownerId:'owner',expiresAt:new Date(Date.now()+60000)});
 const ownerHeaders={...headers,Cookie:`${config.SESSION_COOKIE}_admin=owner-session`,Origin:config.uiOrigin,'Content-Type':'application/json'};
 const response=await fetch(`${origin}/api/admin/agent-model`,{headers:ownerHeaders});expect(response.status).toBe(200);const setting=await response.json();expect(setting).toMatchObject({model:DEFAULT_OPENROUTER_MODEL,keyConfigured:false});expect(setting).not.toHaveProperty('models');
 const save=await fetch(`${origin}/api/admin/agent-model`,{method:'POST',headers:ownerHeaders,body:JSON.stringify({model:listed.id,revision:0})});expect(save.status).toBe(200);expect(await save.json()).toMatchObject({revision:1});
 expect((await fetch(`${origin}/api/admin/agent-model`,{method:'POST',headers:ownerHeaders,body:JSON.stringify({model:listed.id,revision:0})})).status).toBe(409);
});
