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

it('marks DM calls read without answering them, preserving newer messages and other notification history',async()=>{
 const started=await startCall('me','me:other'),createdAt='2026-09-30T12:00:00Z';
 await rows('directMessages').insertMany([{_id:'m1',connectionId:'me:other',fromId:'me',text:'one',createdAt},{_id:'m2',connectionId:'me:other',fromId:'me',text:'two',createdAt}]);
 await rows('notifications').insertMany([{_id:'new-message',userId:'other',actorId:'me',connectionId:'me:other',kind:'message',messageId:'m2',readAt:null,createdAt},{_id:'unrelated',userId:'other',actorId:'me',connectionId:'different',kind:'call',readAt:null,createdAt},{_id:'other-owner',userId:'me',actorId:'other',connectionId:'me:other',kind:'connection_accepted',readAt:null,createdAt}]);
 await call('messages.mark_read',{connectionId:'me:other',throughMessageId:'m1'},'other');
 expect((await rows('notifications').findOne({_id:`call:${started.id}:other`}))?.readAt).toBeTruthy();
 expect((await rows('calls').findOne({_id:started.id}))?.status).toBe('waiting');
 for(const id of ['new-message','unrelated','other-owner'])expect((await rows('notifications').findOne({_id:id}))?.readAt).toBeNull();
 await call('messages.mark_read',{connectionId:'me:other',throughMessageId:'m2'},'other');
 expect((await rows('notifications').findOne({_id:'new-message'}))?.readAt).toBeTruthy();
 expect(await rows('notifications').countDocuments()).toBe(4);
 expect((await notificationState('other')).items.find(item=>item.kind==='call'&&item.callId===started.id)?.read).toBe(true);
});

it('marks an opened invitation read without accepting it and denies someone outside the conversation',async()=>{
 await rows('connections').insertOne({_id:'pending',members:['me','other'],fromId:'me',toId:'other',status:'pending',note:'Hi',createdAt:new Date().toISOString()});
 await call('messages.mark_read',{connectionId:'pending'},'other');
 expect(await rows('connections').findOne({_id:'pending'})).toMatchObject({status:'pending',notificationReadAt:expect.any(String)});
 await rows('connections').insertOne({_id:'unrelated',members:['other','stranger'],fromId:'other',toId:'stranger',status:'pending'});
 await expect(call('messages.mark_read',{connectionId:'unrelated'},'me')).rejects.toMatchObject({status:404});
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
it('hands a live Talk space to a connected speaker only after acceptance',async()=>{
 let space=await call('spaces.create',{title:'Night walks'},'me',true);
 const room={name:spaceRoomName(space.id)};
 await spaceWebhook({event:'participant_joined',room,participant:{identity:'me',sid:'host-1'}});
 await spaceWebhook({event:'participant_joined',room,participant:{identity:'other',sid:'speaker-1'}});
 await call('spaces.request_speak',{spaceId:space.id},'other');
 space=(await call('spaces.respond_speaker',{spaceId:space.id,revision:space.revision,personId:'other',approve:true},'me',true)).space;
 space=await call('spaces.offer_host',{spaceId:space.id,revision:space.revision,personId:'other'});
 expect(space.hostId).toBe('me');expect(space.hostOffer.toId).toBe('other');
 expect((await call('spaces.get',{spaceId:space.id},'other')).hostOffer.id).toBe(space.hostOffer.id);
 await expect(call('spaces.accept_host',{spaceId:space.id,revision:space.revision,offerId:randomUUID()},'other',true)).rejects.toMatchObject({code:'space_host_offer'});
 await expect(call('spaces.accept_host',{spaceId:space.id,revision:space.revision,offerId:space.hostOffer.id},'me',true)).rejects.toMatchObject({code:'space_host_offer'});
 const previousRevision=space.revision,offerId=space.hostOffer.id;
 space=await call('spaces.accept_host',{spaceId:space.id,revision:space.revision,offerId},'other',true);
 expect(space).toMatchObject({hostId:'other',hostName:'@other',myRole:'host',status:'live'});
 expect(space.speakerIds).toEqual(['me','other']);expect(space.hostOffer).toBeUndefined();
 expect((await call('spaces.get',{spaceId:space.id},'me')).myRole).toBe('speaker');
 expect((await call('spaces.list',{},'me')).items[0]).toMatchObject({hostId:'other',speakingCount:2});
 expect((await sourceDocument('spaces',space.id))?.ownerId).toBe('other');
 expect(await rows('liveMediaEffects').countDocuments({kind:'close',room:spaceRoomName(space.id)})).toBe(0);
 await expect(call('spaces.end',{spaceId:space.id,revision:space.revision},'me',true)).rejects.toMatchObject({code:'space_host'});
 await expect(call('spaces.accept_host',{spaceId:space.id,revision:previousRevision,offerId},'other',true)).rejects.toMatchObject({code:'space_changed'});
 const ended=await call('spaces.end',{spaceId:space.id,revision:space.revision},'other',true);expect(ended.status).toBe('ended');
});
it('revokes a pending Talk host offer when its speaker leaves, declines or loses the mic',async()=>{
 let space=await call('spaces.create',{title:'Night walks'},'me',true);
 const room={name:spaceRoomName(space.id)};
 await spaceWebhook({event:'participant_joined',room,participant:{identity:'me',sid:'host-1'}});
 await spaceWebhook({event:'participant_joined',room,participant:{identity:'other',sid:'speaker-1'}});
 await call('spaces.request_speak',{spaceId:space.id},'other');
 space=(await call('spaces.respond_speaker',{spaceId:space.id,revision:space.revision,personId:'other',approve:true},'me',true)).space;
 space=await call('spaces.offer_host',{spaceId:space.id,revision:space.revision,personId:'other'});
 const expiredOffer=space.hostOffer.id;
 await spaceWebhook({event:'participant_left',room,participant:{identity:'other',sid:'speaker-1'}});
 space=await call('spaces.get',{spaceId:space.id},'me');expect(space.hostOffer).toBeUndefined();
 await expect(call('spaces.accept_host',{spaceId:space.id,revision:space.revision,offerId:expiredOffer},'other',true)).rejects.toMatchObject({code:'space_host_offer'});
 await spaceWebhook({event:'participant_joined',room,participant:{identity:'other',sid:'speaker-2'}});
 space=await call('spaces.offer_host',{spaceId:space.id,revision:space.revision,personId:'other'});
 space=await call('spaces.decline_host',{spaceId:space.id,revision:space.revision,offerId:space.hostOffer.id},'other');
 expect(space.hostId).toBe('me');expect(space.hostOffer).toBeUndefined();
 space=await call('spaces.offer_host',{spaceId:space.id,revision:space.revision,personId:'other'});
 space=(await call('spaces.revoke_speaker',{spaceId:space.id,revision:space.revision,personId:'other'},'me')).space;
 expect(space.hostOffer).toBeUndefined();
 await expect(call('spaces.offer_host',{spaceId:space.id,revision:space.revision,personId:'other'})).rejects.toMatchObject({code:'space_speaker'});
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
it('offers profile navigation only for currently discoverable Talk participants',async()=>{
 const space=await call('spaces.create',{title:'Open room'},'me',true),room={name:spaceRoomName(space.id)};
 await spaceWebhook({event:'participant_joined',room,participant:{identity:'me',sid:'host-1'}});
 await spaceWebhook({event:'participant_joined',room,participant:{identity:'other',sid:'listener-1'}});
 const publicView=await call('spaces.get',{spaceId:space.id},'me');
 expect(publicView.profileIds).toEqual(['me','other']);
 expect(publicView.participantCards).toEqual([{id:'me',name:'Me',handle:'me'},{id:'other',name:'Other',handle:'other'}]);
 expect((await call('spaces.list',{},'me')).items[0].profileIds).toBeUndefined();
 await users().updateOne({_id:'other'},{$set:{discoverable:false}});
 const privateView=await call('spaces.get',{spaceId:space.id},'me');
 expect(privateView.presentListeners.map((person:any)=>person.id)).toEqual(['other']);
 expect(privateView.profileIds).toEqual(['me']);
 await users().updateOne({_id:'other'},{$set:{discoverable:true}});
 expect((await call('spaces.get',{spaceId:space.id},'me')).profileIds).toEqual(['me','other']);
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
