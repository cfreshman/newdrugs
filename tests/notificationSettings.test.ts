import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {connectDatabase,db,mongo,rows,transaction} from '../server/db';
import {users,type Actor,type User} from '../server/auth';
import {config} from '../server/config';
import {executeOperation} from '../server/operations';
import {notificationState} from '../server/notifications';
import {enqueueNotificationEvent,processNotificationEvent} from '../server/notificationEvents';
import {processScheduledNotificationRule} from '../server/notificationSchedule';
import {deliverPush} from '../server/push';
import {insertAgentToken} from '../server/agentTokens';
import {Temporal} from '@js-temporal/polyfill';
import {spaceRoomName,spaceWebhook} from '../server/spaces';

const actor=(userId='me'):Actor=>({userId,source:'external',scope:'write'});
const call=(name:string,input:unknown={},userId='me')=>executeOperation(name,input,actor(userId),randomUUID(),{confirmed:true}) as Promise<any>;
const connectHost=(space:{id:string},hostId='me')=>spaceWebhook({event:'participant_joined',room:{name:spaceRoomName(space.id)},participant:{identity:hostId,sid:`${hostId}-host`}});
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated test database required');for(const collection of await db().collections())await collection.deleteMany({});}
const original={LIVEKIT_URL:config.LIVEKIT_URL,LIVEKIT_PUBLIC_URL:config.LIVEKIT_PUBLIC_URL,LIVEKIT_API_KEY:config.LIVEKIT_API_KEY,LIVEKIT_API_SECRET:config.LIVEKIT_API_SECRET,QDRANT_URL:config.QDRANT_URL};
beforeAll(async()=>{if(new URL(config.MONGODB_URI).pathname!=='/newdrugs_test')throw Error('Isolated test database required');await connectDatabase();Object.assign(config,{LIVEKIT_URL:'http://127.0.0.1:7880',LIVEKIT_PUBLIC_URL:'wss://dev.druggie.org',LIVEKIT_API_KEY:'test-key-test-key',LIVEKIT_API_SECRET:'test-secret-test-secret-test-secret',QDRANT_URL:''});});
beforeEach(async()=>{await clean();const base:User={_id:'me',handle:'me',name:'Me',bio:'',city:'',cityKey:'',interests:[],discoverable:true,photos:[randomUUID()],balanceNanos:500000000,reservedNanos:0,createdAt:new Date().toISOString()};await users().insertMany([base,{...base,_id:'other',handle:'other',name:'Other',photos:[randomUUID()]},{...base,_id:'friend',handle:'friend',name:'Friend'}]);});
afterAll(async()=>{await clean();await mongo.close();Object.assign(config,original);});

it('preserves existing type defaults and suppresses only future disabled notifications',async()=>{
 const defaults=await call('notifications.preferences');
 expect(defaults.items.find((item:any)=>item.type==='message')).toMatchObject({enabled:true});
 expect(defaults.items.find((item:any)=>item.type==='talk_first_live')).toMatchObject({enabled:false});
 await call('notifications.preference_set',{type:'post_like',enabled:false});
 const post=await call('posts.create',{text:'A quiet post'});
 await call('posts.like',{postId:post.id,liked:true},'other');
 expect((await notificationState('me')).items.some(item=>item.kind==='post_like')).toBe(false);
 await call('notifications.preference_set',{type:'post_like',enabled:true});
 await call('posts.like',{postId:post.id,liked:false},'other');
 await call('posts.like',{postId:post.id,liked:true},'other');
 expect((await notificationState('me')).items.some(item=>item.kind==='post_like')).toBe(true);
 await call('notifications.preference_set',{type:'invitation',enabled:false},'friend');
 await call('connections.request',{personId:'friend',note:'Hello'});
 expect((await notificationState('friend')).items.some(item=>item.kind==='invitation')).toBe(false);
});
it('alerts for first live Talk and selected hosts without notifying every later opening',async()=>{
 await call('notifications.preference_set',{type:'talk_first_live',enabled:true},'other');
 await call('notifications.rule_create',{rule:{kind:'talk_person',personId:'me'}},'other');
 const first=await call('spaces.create',{title:'Night walks'});
 expect(await rows('notificationEvents').countDocuments({resourceId:first.id})).toBe(0);
 await connectHost(first);
 for(let n=0;n<4;n++)await processNotificationEvent();
 const notices=(await notificationState('other')).items.filter(item=>item.kind==='alert');
 expect(notices).toHaveLength(1);expect(notices[0].link.url).toContain(`/spaces/${first.id}`);
 expect(notices[0].title).toMatch(/Talk/);
 const later=await call('spaces.create',{title:'Another room'},'friend');await connectHost(later,'friend');
 for(let n=0;n<4;n++)await processNotificationEvent();
 expect((await notificationState('other')).items.filter(item=>item.kind==='alert')).toHaveLength(1);
});
it('records one first-live transition when two hosts open Talks concurrently',async()=>{
 const [first,second]=await Promise.all([call('spaces.create',{title:'First'},'me'),call('spaces.create',{title:'Second'},'friend')]);
 await Promise.all([connectHost(first),connectHost(second,'friend')]);
 expect(await rows('notificationEvents').countDocuments({kind:'talk_first_live'})).toBe(1);
});
it('does not repeat the first-live alert when Talk briefly returns to zero',async()=>{
 let room=await call('spaces.create',{title:'First'});
 await connectHost(room);
 await call('spaces.end',{spaceId:room.id,revision:room.revision});
 room=await call('spaces.create',{title:'Opened again'});
 await connectHost(room);
 expect((await call('spaces.get',{spaceId:room.id})).status).toBe('live');
 expect(await rows('notificationEvents').countDocuments({kind:'talk_first_live'})).toBe(1);
});
it('watches a selected author and Circle person with exact links and mutual context',async()=>{
 await call('notifications.rule_create',{rule:{kind:'post_person',personId:'me'}},'other');
 const post=await call('posts.create',{text:'Evening sky'});
 for(let n=0;n<3;n++)await processNotificationEvent();
 expect((await notificationState('other')).items.find(item=>item.kind==='alert')?.link.url).toContain(`/posts/${post.id}`);
 await call('notifications.rule_create',{rule:{kind:'circle_new',minMutuals:2}},'other');
 await rows('connections').insertMany([{_id:'friend:other',members:['friend','other'],status:'accepted'},{_id:'friend:me',members:['friend','me'],status:'accepted'}]);
 await rows('circlePairs').insertOne({_id:'me:other',members:['me','other'],mutualCount:2,previewIds:['friend']});
 await transaction(session=>enqueueNotificationEvent('circle_new','me','me',session,{recipientId:'other',mutualCount:2}));
 await processNotificationEvent();
 const person=(await notificationState('other')).items.find(item=>item.kind==='alert'&&item.link.resourceType==='person');
 expect(person).toMatchObject({title:'@me is in your Circle',text:'2 mutual friends: @friend',photoId:expect.any(String)});
 expect(person?.link.url).toContain('/people/me');
});
it('watches one thread and a storage threshold without notifying unrelated activity',async()=>{
 const root=await call('posts.create',{text:'A conversation'});
 await call('notifications.rule_create',{rule:{kind:'thread_activity',postId:root.id}},'other');
 const reply=await call('posts.reply',{postId:root.id,text:'A thought'},'friend');
 for(let n=0;n<3;n++)await processNotificationEvent();
 expect((await notificationState('other')).items.find(item=>item.kind==='alert')?.link.url).toContain(`/posts/${reply.id}`);
 await call('notifications.rule_create',{rule:{kind:'storage_high',thresholdBytes:100}});
 await processScheduledNotificationRule();expect((await notificationState('me')).items.some(item=>item.kind==='alert')).toBe(false);
 await users().updateOne({_id:'me'},{$set:{storageBytes:200}});await rows('notificationRules').updateOne({kind:'storage_high'},{$set:{nextAt:0}});await processScheduledNotificationRule();
 expect((await notificationState('me')).items.find(item=>item.kind==='alert')?.title).toBe('Your storage is nearly full');
});
it('rearms a low-credit threshold only after the balance recovers',async()=>{
 await call('notifications.rule_create',{rule:{kind:'credit_low',thresholdNanos:800000000}});
 await processScheduledNotificationRule();
 expect((await notificationState('me')).items.filter(item=>item.kind==='alert')).toHaveLength(1);
 await rows('notificationRules').updateOne({kind:'credit_low'},{$set:{nextAt:0}});await processScheduledNotificationRule();
 expect((await notificationState('me')).items.filter(item=>item.kind==='alert')).toHaveLength(1);
 await users().updateOne({_id:'me'},{$set:{balanceNanos:1000000000}});await rows('notificationRules').updateOne({kind:'credit_low'},{$set:{nextAt:0}});await processScheduledNotificationRule();
 await users().updateOne({_id:'me'},{$set:{balanceNanos:300000000}});await rows('notificationRules').updateOne({kind:'credit_low'},{$set:{nextAt:0}});await processScheduledNotificationRule();
 expect((await notificationState('me')).items.filter(item=>item.kind==='alert')).toHaveLength(2);
});
it('reminds only current friends of birthdays and the owner of Log anniversaries',async()=>{
 const today=Temporal.Now.plainDateISO('UTC'),old=today.with({year:today.year-1}).toString();
 await rows('connections').insertOne({_id:'friend:me',members:['friend','me'],status:'accepted',fromId:'me',toId:'friend',createdAt:new Date().toISOString()});
 await rows('logBirthdays').insertOne({_id:'friend',month:today.month,day:today.day,year:1990});
 await call('notifications.rule_create',{rule:{kind:'birthday',daysBefore:0,timeZone:'UTC'}});
 await processScheduledNotificationRule();
 const birthday=(await notificationState('me')).items.find(item=>item.kind==='alert');
 expect(birthday).toMatchObject({title:"It's @friend's birthday"});
 expect(JSON.stringify(birthday)).not.toContain('1990');
 const entry=await call('log.create',{entry:{date:old,title:'First walk',recurrence:'anniversary'},contribution:{note:'A walk'}});
 await call('notifications.rule_create',{rule:{kind:'anniversary',daysBefore:0,timeZone:'UTC'}});
 await processScheduledNotificationRule();
 const anniversary=(await notificationState('me')).items.find(item=>item.kind==='alert'&&item.link.resourceType==='log');
 expect(anniversary?.link.url).toContain(`/log/${entry.id}`);
 await rows('connections').updateOne({_id:'friend:me'},{$set:{status:'disconnected'}});
 expect((await notificationState('me')).items.some(item=>item.kind==='alert'&&item.link.resourceType==='person')).toBe(false);
});
it('omits legacy Log invitations and unsolicited account alerts',async()=>{
 const types=(await call('notifications.preferences')).items.map((item:any)=>item.type);
 expect(types).not.toContain('log_invitation');
 expect(types).not.toContain('security_login');
 expect(types).not.toContain('security_credential');
 await transaction(session=>insertAgentToken('me',{name:'Codex',scope:'read',expiresInDays:null},session));
 expect((await notificationState('me')).items).toHaveLength(0);
 await rows('notifications').insertOne({_id:'old-sign-in',userId:'me',actorId:'me',kind:'alert',alertType:'security_login',resourceType:'account',resourceId:'me',title:'New sign-in to your account',text:'',readAt:null,createdAt:new Date().toISOString()});
 expect((await notificationState('me')).items).toHaveLength(0);
});
it('sends the same enabled post notification to a device without post text',async()=>{
 const saved={publicKey:config.VAPID_PUBLIC_KEY,privateKey:config.VAPID_PRIVATE_KEY};config.VAPID_PUBLIC_KEY='fixture';config.VAPID_PRIVATE_KEY='fixture';
 try{
  await rows('sessions').insertOne({_id:'push-session',userId:'me',expiresAt:new Date(Date.now()+60000)});
  await rows('pushSubscriptions').insertOne({_id:'push-device',userId:'me',deviceId:randomUUID(),sessionId:'push-session',revokedAt:null,endpoint:'https://fcm.googleapis.com/fixture',keys:{}});
  const post=await call('posts.create',{text:'A private-to-the-author caption'});
  await call('posts.like',{postId:post.id,liked:true},'other');
  await rows('pushOutbox').updateMany({userId:'me'},{$set:{availableAt:0}});
  const packets:string[]=[];await deliverPush((async(_subscription:any,payload:any)=>{packets.push(String(payload));return {statusCode:201};}) as any);
  expect(packets).toHaveLength(1);
  const packet=JSON.parse(packets[0]);expect(packet).toMatchObject({kind:'post_like',url:`/posts/${post.id}`,body:'@other liked your post'});
  expect(packets[0]).not.toContain('A private-to-the-author caption');
 }finally{config.VAPID_PUBLIC_KEY=saved.publicKey;config.VAPID_PRIVATE_KEY=saved.privateKey;}
});
