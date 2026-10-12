import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {connectDatabase,db,mongo,rows,transaction} from '../server/db';
import {config} from '../server/config';
import {createGuest,newSession,registerAccount,users,type User} from '../server/auth';
import {changeUsername} from '../server/account';
import {notificationState,notifySignup} from '../server/notifications';
import * as push from '../server/push';
import type {Response} from 'express';

async function clean(){
  if(db().databaseName!=='newdrugs_test')throw Error('Isolated test database required');
  for(const collection of await db().collections())await collection.deleteMany({});
}
beforeAll(async()=>{
  if(new URL(config.MONGODB_URI).pathname!=='/newdrugs_test')throw Error('Isolated test database required');
  await connectDatabase();
});
beforeEach(async()=>{
  await clean();
  const base:User={_id:'cyrus-user',handle:'cyrus',name:'Cyrus',bio:'',city:'',cityKey:'',interests:[],discoverable:false,balanceNanos:0,reservedNanos:0,createdAt:new Date().toISOString()};
  await users().insertMany([base,{...base,_id:'other-user',handle:'other'},{...base,_id:'similar-user',handle:'cyrus_fan'}]);
  config.VAPID_PUBLIC_KEY='fixture';config.VAPID_PRIVATE_KEY='fixture';
});
afterEach(()=>{vi.restoreAllMocks();config.VAPID_PUBLIC_KEY='';config.VAPID_PRIVATE_KEY='';});
afterAll(async()=>{await clean();await mongo.close();});
async function signup(handle='new_member'){
  const guest=await createGuest();
  return registerAccount(guest._id,handle,'encoded-password');
}
async function device(userId:string){
  const sessionId=randomUUID(),id=randomUUID();
  await rows('sessions').insertOne({_id:sessionId,userId,expiresAt:new Date(Date.now()+60000)});
  await rows('pushSubscriptions').insertOne({_id:id,userId,deviceId:randomUUID(),sessionId,revokedAt:null,endpoint:`https://fcm.googleapis.com/${userId}`,keys:{}});
}

it('notifies only the exact cyrus account, with one indexed recipient lookup',async()=>{
  const base=(await users().findOne({_id:'other-user'}))!;
  await users().insertMany(Array.from({length:1000},(_,index)=>({...base,_id:`unrelated-${index}`,handle:`unrelated_${index}`})));
  const plan=await users().find({handle:'cyrus',suspendedAt:null}).limit(1).explain('executionStats');
  expect(plan.executionStats.totalDocsExamined).toBeLessThanOrEqual(1);
  expect(plan.executionStats.totalKeysExamined).toBeLessThanOrEqual(1);
  const person=await signup();
  expect(await rows('notifications').countDocuments({kind:'signup'})).toBe(1);
  expect(await rows('notifications').findOne({kind:'signup'})).toMatchObject({userId:'cyrus-user',actorId:person._id,title:'@new_member signed up',readAt:null});
  const state=await notificationState('cyrus-user');
  expect(state.unread).toBe(1);
  expect(state.items[0]).toMatchObject({kind:'signup',title:'@new_member signed up',read:false,link:{url:'https://dev.druggie.org/notifications'}});
  for(const userId of ['other-user','similar-user',person._id])expect((await notificationState(userId)).items).toHaveLength(0);
  expect(await rows('pushOutbox').countDocuments()).toBe(1);
  expect(await rows('pushOutbox').findOne({})).toMatchObject({userId:'cyrus-user',kind:'signup'});
});
it('does not notify for guests, sessions, username edits or a failed signup',async()=>{
  await createGuest();expect(await rows('notifications').countDocuments()).toBe(0);
  const duplicate=await createGuest();
  await expect(registerAccount(duplicate._id,'other','encoded-password')).rejects.toMatchObject({code:11000});
  expect(await rows('notifications').countDocuments()).toBe(0);
  const person=await signup();
  await newSession({cookie:vi.fn()} as unknown as Response,person._id);
  await changeUsername(person,'renamed_member');
  await expect(registerAccount(person._id,'another_name','encoded-password')).rejects.toMatchObject({code:'registered'});
  expect(await rows('notifications').countDocuments({kind:'signup'})).toBe(1);
});
it('keeps registration and its notification atomic and allows a failed attempt to retry',async()=>{
  const guest=await createGuest(),enqueue=vi.spyOn(push,'enqueueStoredPush').mockRejectedValueOnce(Error('Fixture outbox failure'));
  await expect(registerAccount(guest._id,'new_member','encoded-password')).rejects.toThrow('Fixture outbox failure');
  expect((await users().findOne({_id:guest._id}))?.handle).toBeUndefined();
  expect(await rows('notifications').countDocuments()).toBe(0);
  expect(await rows('pushOutbox').countDocuments()).toBe(0);
  enqueue.mockRestore();
  await registerAccount(guest._id,'new_member','encoded-password');
  expect(await rows('notifications').countDocuments({kind:'signup'})).toBe(1);
  expect(await rows('pushOutbox').countDocuments()).toBe(1);
});
it('does not duplicate a notice or push when registration races or delivery is retried',async()=>{
  const guest=await createGuest();
  const results=await Promise.allSettled([registerAccount(guest._id,'first_name','encoded-password'),registerAccount(guest._id,'second_name','encoded-password')]);
  expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
  const person=(await users().findOne({_id:guest._id}))!;
  await transaction(session=>notifySignup(person,session));
  expect(await rows('notifications').countDocuments({kind:'signup'})).toBe(1);
  expect(await rows('pushOutbox').countDocuments()).toBe(1);
});
it('allows signup without a cyrus recipient, and skips suspended, self and internal test accounts',async()=>{
  await users().deleteOne({_id:'cyrus-user'});
  expect((await signup('without_recipient')).handle).toBe('without_recipient');
  await signup('cyrus');
  expect(await rows('notifications').countDocuments()).toBe(0);
  await users().updateOne({handle:'cyrus'},{$set:{suspendedAt:new Date().toISOString()}});
  await signup('suspended_recipient');
  expect(await rows('notifications').countDocuments()).toBe(0);
  await users().updateOne({handle:'cyrus'},{$unset:{suspendedAt:''}});
  const internal=await createGuest();await users().updateOne({_id:internal._id},{$set:{internalTestAccount:true}});
  await registerAccount(internal._id,'internal_test','encoded-password');
  expect(await rows('notifications').countDocuments()).toBe(0);
});
it('delivers device push only to cyrus and respects read history',async()=>{
  await device('cyrus-user');await device('other-user');
  await signup();
  await rows('pushOutbox').updateMany({},{$set:{availableAt:0}});
  const send=vi.fn(async(_subscription:unknown,_payload?:string|Buffer|null)=>({statusCode:201,body:'',headers:{}}));
  await push.deliverPush(send);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toMatchObject({endpoint:'https://fcm.googleapis.com/cyrus-user'});
  const packet=JSON.parse(String(send.mock.calls[0][1]));
  expect(packet).toMatchObject({kind:'signup',title:'@new_member signed up',body:'',url:'/notifications'});
  expect(JSON.stringify(packet)).not.toContain('encoded-password');
  const notice=(await notificationState('cyrus-user')).items[0];
  await rows('notifications').updateOne({_id:notice.id},{$set:{readAt:new Date().toISOString()}});
  expect((await notificationState('cyrus-user')).items[0].read).toBe(true);
  expect((await notificationState('cyrus-user')).unread).toBe(0);
  expect(await push.pushStillRelevant((await rows('pushOutbox').findOne({})) as never)).toBe(false);
});
it('links to the profile once it is public and does not push to another recipient',async()=>{
  const person=await signup();await users().updateOne({_id:person._id},{$set:{discoverable:true}});
  expect((await notificationState('cyrus-user')).items[0].link).toMatchObject({resourceType:'person',resourceId:person._id,url:`https://dev.druggie.org/people/${person._id}`});
  const event=(await rows('pushOutbox').findOne({}))!;
  expect(await push.pushStillRelevant({...event,userId:'other-user'} as never)).toBe(false);
});
