import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {users,type Actor,type User} from '../server/auth';
import {config} from '../server/config';
import {executeOperation} from '../server/operations';
import {indexNotificationRule} from '../server/notificationRuleIndex';
import {processNotificationEvent} from '../server/notificationEvents';
import {notificationState} from '../server/notifications';

const mocks=vi.hoisted(()=>({embed:vi.fn(),match:vi.fn(),upsert:vi.fn(),remove:vi.fn()}));
vi.mock('../server/search/embeddings',()=>({embed:mocks.embed}));
vi.mock('../server/search/backend',async original=>({...await original<typeof import('../server/search/backend')>(),matchNotificationRules:mocks.match,upsertNotificationRuleVector:mocks.upsert,deleteNotificationRuleVector:mocks.remove}));
const actor=(userId='me'):Actor=>({userId,source:'external',scope:'write'});
const call=(name:string,input:unknown={},userId='me')=>executeOperation(name,input,actor(userId),randomUUID(),{confirmed:true}) as Promise<any>;
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated test database required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{if(new URL(config.MONGODB_URI).pathname!=='/newdrugs_test')throw Error('Isolated test database required');await connectDatabase();});
beforeEach(async()=>{await clean();const base:User={_id:'me',handle:'me',name:'Me',bio:'',city:'',cityKey:'',interests:[],discoverable:true,balanceNanos:0,reservedNanos:0,createdAt:new Date().toISOString()};await users().insertMany([base,{...base,_id:'other',handle:'other',name:'Other'}]);mocks.embed.mockReset().mockResolvedValue(Array(512).fill(0));mocks.match.mockReset();mocks.upsert.mockReset().mockResolvedValue(undefined);mocks.remove.mockReset().mockResolvedValue(undefined);});
afterAll(async()=>{await clean();await mongo.close();});
it('indexes a private topic watch and alerts only after a matching new post',async()=>{
 const rule=await call('notifications.rule_create',{rule:{kind:'post_topic',query:'late-night walking'}} ,'other');
 expect(rule.indexing).toBe(true);
 await indexNotificationRule();
 expect(mocks.upsert).toHaveBeenCalledWith(rule.id,'post_topic',expect.any(Array));
 expect((await call('notifications.rules',{},'other')).items[0].indexing).toBe(false);
 const post=await call('posts.create',{text:'An evening walk along the coast'});
 await processNotificationEvent();
 mocks.match.mockResolvedValue([{id:rule.id,score:0.9}]);
 await processNotificationEvent();
 expect(mocks.match).toHaveBeenCalledWith('post_topic',expect.any(Array),0,50);
 const alert=(await notificationState('other')).items.find(item=>item.kind==='alert');
 expect(alert?.link.url).toContain(`/posts/${post.id}`);
 await call('notifications.rule_set',{ruleId:rule.id,revision:rule.revision,enabled:false},'other');
 const next=await call('posts.create',{text:'Another evening walk'});
 await processNotificationEvent();await processNotificationEvent();
 expect((await notificationState('other')).items.filter(item=>item.kind==='alert')).toHaveLength(1);
 expect(next.id).toBeTruthy();
});
