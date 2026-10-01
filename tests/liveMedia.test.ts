import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {RoomServiceClient} from 'livekit-server-sdk';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {users,type User,type Actor} from '../server/auth';
import {config} from '../server/config';
import {startCall,joinCall,endCall,callHistory,incomingCall} from '../server/calling';
import {reconcileSpacePresence,spaceRoomName,spaceWebhook} from '../server/spaces';
import {executeOperation} from '../server/operations';
import {sourceDocument} from '../server/search/sources';
import {notificationState} from '../server/notifications';
import {indexOne} from '../server/search/worker';
import {searchPublic} from '../server/search/retrieve';
import {resetIndex} from '../server/search/index';

const original={LIVEKIT_URL:config.LIVEKIT_URL,LIVEKIT_PUBLIC_URL:config.LIVEKIT_PUBLIC_URL,LIVEKIT_API_KEY:config.LIVEKIT_API_KEY,LIVEKIT_API_SECRET:config.LIVEKIT_API_SECRET,QDRANT_URL:config.QDRANT_URL};
const actor=(userId='me'):Actor=>({userId,source:'external',scope:'write'});
const call=(name:string,input:unknown={},userId='me',confirmed=false)=>executeOperation(name,input,actor(userId),randomUUID(),{confirmed}) as Promise<any>;
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated test database required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{if(new URL(config.MONGODB_URI).pathname!=='/newdrugs_test')throw Error('Isolated test database required');await connectDatabase();Object.assign(config,{LIVEKIT_URL:'http://127.0.0.1:7880',LIVEKIT_PUBLIC_URL:'wss://dev.druggie.org',LIVEKIT_API_KEY:'test-key-test-key',LIVEKIT_API_SECRET:'test-secret-test-secret-test-secret',QDRANT_URL:''});});
beforeEach(async()=>{resetIndex();await clean();const base:User={_id:'me',handle:'me',name:'Me',bio:'',city:'',cityKey:'',interests:[],discoverable:true,balanceNanos:0,reservedNanos:0,createdAt:new Date().toISOString()};await users().insertMany([base,{...base,_id:'other',handle:'other',name:'Other'}]);await rows('connections').insertOne({_id:'me:other',members:['me','other'],status:'accepted',fromId:'me',toId:'other',note:'Hi',createdAt:new Date().toISOString()});});
afterAll(async()=>{await clean();await mongo.close();Object.assign(config,original);});

it('keeps a video call in the accepted DM and queues room closure when it ends',async()=>{
 const started=await startCall('me','me:other');expect(started.status).toBe('waiting');
 expect((await incomingCall('other'))?.id).toBe(started.id);
 expect((await callHistory('me','me:other')).active?.id).toBe(started.id);
 expect((await notificationState('other')).items.some(item=>item.kind==='call'&&item.callActive)).toBe(true);
 const joined=await joinCall('other',started.id);expect(joined.status).toBe('connected');
 const ended=await endCall(started.id,'me');expect(ended?.status).toBe('ended');
 expect((await callHistory('other','me:other')).items[0].status).toBe('ended');
 expect(await rows('liveMediaEffects').countDocuments({kind:'close'})).toBe(1);
 expect((await notificationState('other')).items.find(item=>item.kind==='call')?.read).toBe(true);
});

it('indexes a live talk title and optional description and gates speaking and removal',async()=>{
 let space=await call('spaces.create',{title:'Night walks',description:'Talking about late walks by the ocean.'},'me',true);
 expect((await sourceDocument('spaces',space.id))?.text).toBe('title: Night walks\ndescription: Talking about late walks by the ocean.');
 const vector=Array(512).fill(0);vector[0]=1;await indexOne(async()=>vector);
 const matched=await searchPublic({query:'ocean walks',datasets:['spaces'],mode:'semantic',limit:20},actor('other'),vector);
 expect(matched.matches[0]).toMatchObject({dataset:'spaces',entityType:'space',record:{id:space.id,description:'Talking about late walks by the ocean.'}});
 expect((await call('spaces.list',{},'other')).items.map((item:any)=>item.id)).toEqual([space.id]);
 const request=await call('spaces.request_speak',{spaceId:space.id},'other');expect(request.status).toBe('pending');
 expect((await call('spaces.requests',{spaceId:space.id})).items[0].personId).toBe('other');
 await expect(call('spaces.respond_speaker',{spaceId:space.id,revision:space.revision,personId:'other',approve:true},'other',true)).rejects.toMatchObject({code:'space_host'});
 space=(await call('spaces.respond_speaker',{spaceId:space.id,revision:space.revision,personId:'other',approve:true},'me',true)).space;
 expect(space.speakerIds).toContain('other');
 expect(await rows('liveMediaEffects').countDocuments({kind:'speaker'})).toBe(1);
 space=(await call('spaces.remove_person',{spaceId:space.id,revision:space.revision,personId:'other'},'me',true)).space;
 await expect(call('spaces.get',{spaceId:space.id},'other')).rejects.toMatchObject({code:'space_unavailable'});
 await call('spaces.end',{spaceId:space.id,revision:space.revision},'me',true);
 expect(await sourceDocument('spaces',space.id)).toBeNull();
 expect((await call('spaces.list')).items).toEqual([]);
 expect(await rows('searchOutbox').findOne({_id:`spaces:${space.id}`})).toMatchObject({kind:'spaces'});
 const titleOnly=await call('spaces.create',{title:'Stargazing'},'me',true);
 expect((await sourceDocument('spaces',titleOnly.id))?.text).toBe('title: Stargazing');
});
it('keeps a Talk space live through a host browser refresh until the room actually closes',async()=>{
 const space=await call('spaces.create',{title:'Reconnect'},'me',true),room={name:spaceRoomName(space.id)};
 await spaceWebhook({event:'participant_left',room,participant:{identity:'me'}});
 expect((await call('spaces.get',{spaceId:space.id})).status).toBe('live');
 await spaceWebhook({event:'room_finished',room});
 expect((await rows('spaces').findOne({_id:space.id}))?.status).toBe('ended');
});
it('projects connected Talk participants and fences an old leave after a rejoin',async()=>{
 const space=await call('spaces.create',{title:'Current room'},'me',true),room={name:spaceRoomName(space.id)};
 await spaceWebhook({event:'participant_joined',room,participant:{identity:'me',sid:'host-1'}});
 await spaceWebhook({event:'participant_joined',room,participant:{identity:'other',sid:'guest-1'}});
 let listed=(await call('spaces.list')).items[0];
 expect([listed.speakingCount,listed.listeningCount]).toEqual([1,1]);
 expect(listed.presentSpeakers.map((person:any)=>person.id)).toEqual(['me']);
 await spaceWebhook({event:'participant_left',room,participant:{identity:'other',sid:'guest-1'}});
 listed=(await call('spaces.list')).items[0];expect([listed.speakingCount,listed.listeningCount]).toEqual([1,0]);
 await spaceWebhook({event:'participant_joined',room,participant:{identity:'other',sid:'guest-2'}});
 await spaceWebhook({event:'participant_left',room,participant:{identity:'other',sid:'guest-1'}});
 listed=(await call('spaces.list')).items[0];expect(listed.listeningCount).toBe(1);
});
it('recovers presence for a room that was already open before deployment',async()=>{
 const space=await call('spaces.create',{title:'Already open'},'me',true);
 const participants=vi.spyOn(RoomServiceClient.prototype,'listParticipants').mockResolvedValue([{identity:'me',sid:'host-1'}] as any);
 try{
  expect((await call('spaces.list',{},'other')).items[0].speakingCount).toBe(0);
  await reconcileSpacePresence();
  expect(participants).toHaveBeenCalledWith(spaceRoomName(space.id));
  expect((await call('spaces.list',{},'other')).items[0].speakingCount).toBe(1);
  participants.mockResolvedValue([]);
  await reconcileSpacePresence();
  expect((await call('spaces.list',{},'other')).items[0].speakingCount).toBe(0);
 }finally{participants.mockRestore();}
});

it('ends a private call and removes a listener from a public Space when either person blocks',async()=>{
 const video=await startCall('me','me:other');
 const space=await call('spaces.create',{title:'Outside',description:'We are talking about parks.'},'me',true);
 await call('people.block',{personId:'me',blocked:true},'other');
 expect((await rows('calls').findOne({_id:video.id}))?.status).toBe('ended');
 expect((await call('spaces.get',{spaceId:space.id},'me')).id).toBe(space.id);
 await expect(call('spaces.get',{spaceId:space.id},'other')).rejects.toMatchObject({code:'space_unavailable'});
 expect(await rows('spaceRemovals').findOne({_id:`${space.id}:other`})).toBeTruthy();
 expect(await rows('liveMediaEffects').countDocuments({kind:'close',room:{$regex:video.id}})).toBe(1);
 expect(await rows('liveMediaEffects').countDocuments({kind:'remove',spaceId:space.id,personId:'other'})).toBe(1);
});
