import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {createGuest,users,hash,type Actor,currentUser} from '../server/auth';
import {executeOperation,canonicalJSON} from '../server/operations';
import {operations} from '../shared/catalog';
import legacy from '../shared/legacyOperationRevisions.json';
import {automations,tickAutomations} from '../server/automations';
import {runs} from '../server/wallet';
import {config} from '../server/config';
import {adminKeys,executeAdminOperation} from '../server/adminCli';
import {sourceDocument} from '../server/search/sources';
import {buildResourceLinks} from '../server/resourceLinks';
const ai=config.aiEnabled;
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated cloud tests only');for(const c of await db().collections())await c.deleteMany({});}
beforeAll(async()=>{await connectDatabase();});beforeEach(async()=>{await clean();config.aiEnabled=true;});afterAll(async()=>{config.aiEnabled=ai;await clean();await mongo.close();});
async function person():Promise<Actor>{const user=await createGuest();await users().updateOne({_id:user._id},{$set:{handle:'op_'+user._id.slice(0,8),discoverable:true,balanceNanos:1e9}});return {userId:user._id,source:'browser',scope:'write'};}
async function write(name:string,input:unknown,a:Actor){return executeOperation(name,input,a,randomUUID(),{confirmed:true}) as Promise<any>;}
async function connect(a:Actor,b:Actor){const c=await write('connections.request',{personId:b.userId,note:'A test invitation'},a);return write('connections.respond',{connectionId:c.id,accept:true},b);}
async function admin(){const key={_id:randomUUID(),label:'Isolated operator',stages:['dev'],createdAt:new Date().toISOString(),revokedAt:null};await adminKeys().insertOne(key);return key;}
it('replays receipts across contract versions, including legacy receipts, but rejects changed intent',async()=>{
 const a=await person(),key=randomUUID(),input={text:'A test post'},op=operations.find(o=>o.name==='posts.create')!,version=op.version;
 const first=await executeOperation(op.name,input,a,key,{confirmed:true});op.version='different';try{expect(await executeOperation(op.name,input,a,key,{confirmed:true})).toEqual(first);}finally{op.version=version;}
 await expect(executeOperation(op.name,{text:'Different'},a,key,{confirmed:true})).rejects.toMatchObject({code:'idempotency_conflict'});
 const parsed=op.schema.parse(input),legacyKey=randomUUID();await rows('receipts').insertOne({_id:hash(`${a.userId}:${legacyKey}`),userId:a.userId,operation:op.name,fingerprint:hash(canonicalJSON({name:op.name,version:legacy[0],parsed})),result:first});
 expect(await executeOperation(op.name,input,a,legacyKey,{confirmed:true})).toEqual(first);expect(await rows('posts').countDocuments()).toBe(1);
});
it('separates human connections from external agent settings',async()=>{
 const a=await person();for(const [view,open] of [['connections','messages'],['agents','agents']]){const result=await executeOperation('app.open',{view},a);const links=buildResourceLinks('app.open',{view},result,a);expect((result as any).open).toBe(open);expect(links[0].url).toContain(open==='agents'?'/agents':'/messages');}
});
it('browses an author timeline and replies without inventing a search query',async()=>{
 const a=await person(),b=await person(),p=await write('posts.create',{text:'A public post'},a),q=await write('posts.create',{text:'Other author'},b);await write('posts.reply',{postId:q.id,text:'A reply'},a);
 const list=async(kind:string)=>executeOperation('posts.list',{scope:'public',authorId:a.userId,kind},b) as Promise<any>;
 expect((await list('posts')).items.map((p:any)=>p.text)).toEqual(['A public post']);expect((await list('replies')).items.map((p:any)=>p.text)).toEqual(['A reply']);expect((await list('all')).items).toHaveLength(2);
 await write('people.block',{personId:a.userId,blocked:true},b);await expect(list('posts')).rejects.toThrow();
});
it('keeps contact profiles readable and permits consent-based reconnection with original history',async()=>{
 const a=await person(),b=await person(),c=await connect(a,b);await users().updateOne({_id:b.userId},{$set:{discoverable:false}});
 const privateProfile=await executeOperation('people.get',{personId:b.userId},a);expect(buildResourceLinks('people.get',{},privateProfile,a)[0].targetKind).toBe('exact');
 const stranger=await person();await expect(executeOperation('people.get',{personId:b.userId},stranger)).rejects.toThrow();
 await write('messages.send',{connectionId:c.id,text:'Original message'},a);await write('connections.disconnect',{connectionId:c.id},b);
 expect((await executeOperation('messages.list',{connectionId:c.id},a) as any).items[0].text).toBe('Original message');await expect(write('messages.send',{connectionId:c.id,text:'Unwanted'},a)).rejects.toThrow();await expect(write('connections.request',{personId:b.userId,note:'Again'},a)).rejects.toThrow();
 const again=await write('connections.request',{personId:a.userId,note:'Reconnect'},b);await write('connections.respond',{connectionId:again.id,accept:true},a);expect(again.initialInvitation.note).toBe('A test invitation');expect((await executeOperation('messages.list',{connectionId:c.id},b) as any).items).toHaveLength(1);
});
it('lets the person who declined initiate a new invitation without allowing repeated unwanted requests',async()=>{
 const a=await person(),b=await person(),c=await write('connections.request',{personId:b.userId,note:'Hello'},a);await write('connections.respond',{connectionId:c.id,accept:false},b);
 await expect(write('connections.request',{personId:b.userId,note:'Again'},a)).rejects.toMatchObject({code:'invitation_declined'});expect((await write('connections.request',{personId:a.userId,note:'Changed my mind'},b)).toId).toBe(a.userId);
});
it('defers insufficient-credit automation admission, notifies once, and recovers automatically',async()=>{
 const a=await person();await users().updateOne({_id:a.userId},{$set:{balanceNanos:0}});const id=randomUUID();await automations().insertOne({_id:id,userId:a.userId,name:'Test automation',instruction:'Read current interests',schedule:{kind:'weekly',timeZone:'UTC',hour:7,minute:0,weekdays:[0,1,2,3,4,5,6]},maxRunNanos:50000000,dailyBudgetNanos:200000000,privateChat:false,accountActivity:true,webSearch:false,status:'active',revision:1,generation:1,nextRunAt:Date.now()-1000,createdAt:new Date().toISOString()});
 await tickAutomations();expect(await automations().findOne({_id:id})).toMatchObject({status:'active',blockedCode:'credit_required'});expect(await rows('notifications').countDocuments()).toBe(1);
 await automations().updateOne({_id:id},{$set:{retryAt:0}});await tickAutomations();expect(await rows('notifications').countDocuments()).toBe(1);
 await users().updateOne({_id:a.userId},{$set:{balanceNanos:1e9}});await automations().updateOne({_id:id},{$set:{retryAt:0}});await tickAutomations();expect(await runs().countDocuments({automationId:id})).toBe(1);expect((await automations().findOne({_id:id}))?.blockedReason).toBeUndefined();expect(await rows('notifications').countDocuments()).toBe(2);
 expect((await executeOperation('notifications.list',{},a) as any).items[0].link.url).toContain('/automations/'+id);
});
it('moderates public content and suspends accounts through confirmed audited operator actions',async()=>{
 const a=await person(),b=await person(),key=await admin(),p=await write('posts.create',{text:'A test post'},a);
 await expect(executeAdminOperation(key,'posts.moderate',{postId:p.id,hidden:true,reason:'Test'},randomUUID())).rejects.toMatchObject({code:'confirmation_required'});
 const request=randomUUID(),input={postId:p.id,hidden:true,reason:'Test'};await executeAdminOperation(key,'posts.moderate',input,request,true);await executeAdminOperation(key,'posts.moderate',input,request,true);expect(await rows('adminAudit').countDocuments()).toBe(1);
 expect((await executeOperation('posts.list',{scope:'public'},b) as any).items).toHaveLength(0);expect((await executeOperation('posts.get',{postId:p.id},b) as any)).toMatchObject({deleted:true,moderated:true,text:''});expect(await sourceDocument('posts',p.id)).toBeNull();
 await executeAdminOperation(key,'posts.moderate',{...input,hidden:false},randomUUID(),true);expect((await executeOperation('posts.get',{postId:p.id},b) as any).text).toBe('A test post');
 await rows('tokens').insertOne({_id:randomUUID(),userId:a.userId,revokedAt:null});await executeAdminOperation(key,'users.suspend',{userId:a.userId,suspended:true,reason:'Test'},randomUUID(),true);
 await expect(currentUser(a.userId)).rejects.toMatchObject({code:'account_suspended'});expect((await executeOperation('people.search',{scope:'all'},b) as any).items).toHaveLength(0);expect((await executeOperation('posts.list',{scope:'public'},b) as any).items).toHaveLength(0);expect(await rows('tokens').countDocuments({userId:a.userId,revokedAt:null})).toBe(0);
 await executeAdminOperation(key,'users.suspend',{userId:a.userId,suspended:false,reason:'Test complete'},randomUUID(),true);expect((await currentUser(a.userId)).suspendedAt).toBeUndefined();
});
it('shares and moderates only a reported message, not the rest of a private conversation',async()=>{
 const a=await person(),b=await person(),stranger=await person(),key=await admin(),c=await connect(a,b),message=await write('messages.send',{connectionId:c.id,text:'Reported content'},a);await write('messages.send',{connectionId:c.id,text:'Unreported content'},a);
 await expect(write('people.report',{personId:a.userId,reason:'Test',messageId:message.id},stranger)).rejects.toThrow();
 const report=await write('people.report',{personId:a.userId,reason:'Test',messageId:message.id},b),evidence=await executeAdminOperation(key,'reports.get',{reportId:report.id});expect(JSON.stringify(evidence)).toContain('Reported content');expect(JSON.stringify(evidence)).not.toContain('Unreported content');
 await executeAdminOperation(key,'reports.moderate_message',{reportId:report.id,hidden:true,reason:'Test'},randomUUID(),true);const history=await executeOperation('messages.list',{connectionId:c.id},b);expect(JSON.stringify(history)).not.toContain('Reported content');expect(JSON.stringify(history)).toContain('Unreported content');
});
it('keeps daily-budget deferrals enabled and reports failed runs separately from successful silence',async()=>{
 const a=await person(),definition={name:'Daily check',instruction:'Stay quiet if there is nothing useful.',schedule:{kind:'weekly',timeZone:'UTC',hour:7,minute:0,weekdays:[0,1,2,3,4,5,6]},maxRunNanos:50000000,dailyBudgetNanos:50000000};
 const created=await write('automations.create',definition,a),enabled=await write('automations.enable',{automationId:created.id,revision:created.revision},a);
 await rows('runs').insertOne({_id:'settled-fixture',userId:a.userId,purpose:'automation',automationId:created.id,createdAt:new Date().toISOString(),status:'completed',usagePending:false,costNanos:50000000,budgetNanos:50000000});
 await automations().updateOne({_id:created.id},{$set:{nextRunAt:Date.now()-1000}});await tickAutomations();const waiting=await automations().findOne({_id:created.id});expect(waiting?.status).toBe('active');expect(waiting?.blockedCode).toBe('automation_budget');expect(waiting?.retryAt).toBe(Date.parse(new Date(Date.now()+86400000).toISOString().slice(0,10)));
 await rows('runs').updateOne({_id:'settled-fixture'},{$set:{createdAt:'2000-01-01T00:00:00.000Z'}});await automations().updateOne({_id:created.id},{$set:{retryAt:0}});await tickAutomations();const run=(await runs().findOne({automationId:created.id,status:'queued'}))!;expect(run).toBeTruthy();
 await runs().updateOne({_id:run._id},{$set:{status:'running',lease:'test',leaseUntil:Date.now()+60000}});const {finishRun}=await import('../server/wallet');await finishRun(run._id,'test','', 'completed');expect((await runs().findOne({_id:run._id}))?.status).toBe('failed');expect(await rows('notifications').countDocuments({automationId:created.id,text:'The agent did not return a delivery decision.'})).toBe(1);
});
it('limits operator evidence files to photos in the reported post',async()=>{
 const a=await person(),b=await person(),key=await admin(),postId=randomUUID(),fileId=randomUUID(),unrelatedId=randomUUID();
 await rows('uploads').insertMany([{_id:fileId,userId:a.userId,name:'reported.webp',mime:'image/webp',bytes:10,ready:true},{_id:unrelatedId,userId:a.userId,name:'private.webp',mime:'image/webp',bytes:10,ready:true}]);
 await rows('posts').insertOne({_id:postId,userId:a.userId,text:'Test photo',fileIds:[fileId],createdAt:new Date().toISOString()});const report=await write('people.report',{personId:a.userId,postId,reason:'Test evidence'},b);
 const files=await executeAdminOperation(key,'reports.files',{reportId:report.id}) as any;expect(files.items.map((file:any)=>file.id)).toEqual([fileId]);
});
