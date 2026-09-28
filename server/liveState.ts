import {workGate} from './workGate';
import {defaultPreferences} from '../shared/preferences';
import type {Request,Response} from 'express';
import type {ChangeStream,ChangeStreamDocument,Document} from 'mongodb';
import {randomUUID} from 'node:crypto';
import {db,rows,transaction} from './db';
import {browserActor,hash,profile,users} from './auth';
import {config} from './config';
import {runs,wallet} from './wallet';
import {runView} from './agent';
import {conversationPage} from './operations';
import {AppError,requireValue} from './errors';
import type {LiveChange,LiveTopic,RecordInvalidation} from '../shared/liveState';
import {notificationState} from './notifications';
import {acquireLiveLease,liveInstance,liveLeases,recordKeys,type LiveLease} from './liveSubscriptions';
const topics:LiveTopic[]=['preferences','user','wallet','messages','run','notifications'];
type Subscriber={userId:string;sessionId:string;lease:LiveLease;keys:Set<string>|null;state(value:LiveChange,requested:LiveTopic[]):void;records(change:RecordInvalidation):void;close(auth?:boolean):void};
type Group={listeners:Set<Subscriber>;dirty:Set<LiveTopic>;timer?:ReturnType<typeof setTimeout>;pending?:Promise<void>};
const projections=workGate(8,2048);
const metrics={projectionReads:0,recordFrames:0,stateFrames:0};
export const liveStateMetrics=()=>({...metrics,connections:subscribers.size,accounts:groups.size,projections:projections.stats()});
const subscribers=new Set<Subscriber>(),groups=new Map<string,Group>(),sessions=new Map<string,Set<Subscriber>>(),leases=new Map<string,Subscriber>();
let watcher:ChangeStream|undefined,starting:Promise<void>|undefined,leaseTimer:ReturnType<typeof setInterval>|undefined;
function dirty(userId:string,keys:LiveTopic[]){
 const group=groups.get(userId);if(!group)return;keys.forEach(key=>group.dirty.add(key));
 if(!group.dirty.size||group.timer||group.pending)return;
 group.timer=setTimeout(()=>{group.timer=undefined;void flush(userId,group);},20);
}
async function flush(userId:string,group:Group){
 if(group.pending)return group.pending;if(!group.dirty.size||!group.listeners.size)return;
 const requested=[...group.dirty];group.dirty.clear();
 group.pending=(async()=>{try{metrics.projectionReads++;const value=await projections.run(()=>readLiveState(userId,requested));for(const listener of group.listeners)listener.state(value,requested);}catch(error){console.error('Live projection interrupted',{name:error instanceof Error?error.name:'Error'});for(const listener of [...group.listeners])listener.close();}})().finally(()=>{group.pending=undefined;if(group.dirty.size)dirty(userId,[]);});
 return group.pending;
}
function records(userIds:Iterable<string>,change:RecordInvalidation){for(const id of new Set(userIds)){const group=groups.get(id);if(!group)continue;for(const listener of group.listeners){const keys=change.keys.filter(key=>!listener.keys||listener.keys.has(key));if(keys.length)listener.records({...change,keys});}}}
function publicRecords(keys:string[]){records(groups.keys(),{keys});}
async function logViewers(personId:string){
 const online=[...groups.keys()];if(!online.length)return [];
 const result=await rows('logEntries').aggregate<{_id:string}>([{$match:{members:personId,deletedAt:{$exists:false}}},{$unwind:'$members'},{$match:{members:{$in:online}}},{$group:{_id:'$members'}}]).toArray();return result.map(row=>row._id);
}
export async function dispatchLiveChange(event:ChangeStreamDocument<Document>){
 if(!('ns' in event)||!('coll' in event.ns)){for(const listener of [...subscribers])listener.close();return;}
 const collection=event.ns.coll,document='fullDocument' in event?event.fullDocument:null,key='documentKey' in event?String(event.documentKey._id):'';
 if(collection==='recordEvents'){if(document){records(document.userIds||[],document.payload);for(const id of document.notificationUsers||[])dirty(id,['notifications']);}return;}
 if(collection==='liveSubscriptions'){
  const listener=leases.get(key);if(!listener)return;
  if(!document||document.connectionId!==listener.lease.connectionId||document.instance!==liveInstance){listener.close();return;}
  const nextKeys=document.keys?new Set<string>(document.keys):null,added=nextKeys?[...nextKeys].filter(key=>listener.keys&&!listener.keys.has(key)):[];listener.keys=nextKeys;if(added.length)listener.records({keys:added});return;
 }
 if(collection==='sessions'){if(!document||document.expiresAt<=new Date())for(const listener of [...sessions.get(key)||[]])listener.close(true);return;}
 if(collection==='logEntries'){
  // Current writers use a transaction-bound event with before/after audiences.
  // Older imports still refresh their current members without a global broadcast.
  if(document&&document.liveEventVersion!==1)records([...(document.members||[]),...(document.invited||[])],{keys:['log','people'],log:[{id:key,date:document.date,deleted:Boolean(document.deletedAt)}]});return;
 }
 if(collection==='logBirthdays'){
  const friendships=await rows('connections').find({members:key,status:'accepted'},{projection:{members:1}}).toArray();records([key,...friendships.flatMap(row=>row.members as string[])],{keys:['log_birthdays']});return;
 }
 if(collection==='logPreferences'){records([key],{keys:['log_preferences']});return;}
 if(collection==='posts'||collection==='postLikes'){publicRecords(['posts']);return;}
 if(collection==='searchDocuments'){publicRecords(['people','posts']);return;}
 if(collection==='users'){
  const fields='updateDescription' in event?[...Object.keys(event.updateDescription.updatedFields||{}),...(event.updateDescription.removedFields||[])]:[];
  if(!document||document.suspendedAt){for(const listener of [...groups.get(key)?.listeners||[]])listener.close(true);}
  if(fields.some(field=>/^(name|handle|photos|suspendedAt)(\.|$)/.test(field))){records(await logViewers(key),{keys:['log','people']});publicRecords(['posts']);}
  if(document?.discoverable||fields.includes('discoverable')||fields.includes('suspendedAt'))publicRecords(['people']);
  const changed=new Set<LiveTopic>();
  if(!fields.length)topics.forEach(topic=>changed.add(topic));
  if(fields.some(field=>/^(name|handle|bio|interests|photos|area|city|discoverable)(\.|$)/.test(field)))changed.add('user');
  if(fields.some(field=>/^(balanceNanos|reservedNanos|starter)/.test(field)))changed.add('wallet');
  if(fields.some(field=>/^preferences/.test(field)))changed.add('preferences');
  if(fields.includes('activeRun'))changed.add('run');if(fields.includes('chatGeneration'))changed.add('messages');
  dirty(key,[...changed]);return;
 }
 if(['connections','directMessages','blocks'].includes(collection)){
  let members=document?.members as string[]|undefined;
  if(collection==='directMessages'&&document?.connectionId)members=(await rows('connections').findOne({_id:String(document.connectionId)},{projection:{members:1}}))?.members as string[]|undefined;
  if(collection==='blocks'&&!members)members=key.split(':');
  for(const id of members||[])dirty(id,['notifications']);records(members||[],{keys:['connections','messages','people','posts','log']});return;
 }
 const owner=document?.userId;if(!owner)return;
 if(collection==='agentInbox'||collection==='automations'){records([owner],{keys:[collection==='agentInbox'?'inbox':'automations']});dirty(owner,['notifications']);return;}
 if(collection==='chatSearchChunks'){records([owner],{keys:['chat_history']});return;}
 if(collection==='postSaves'){records([owner],{keys:['posts']});return;}
 if(collection==='uploads'){records([owner],{keys:['storage']});return;}
 if(collection==='notifications'){dirty(owner,['notifications']);return;}
 if(collection==='ledger'){dirty(owner,['wallet']);return;}
 if(collection==='messages'){dirty(owner,['messages']);return;}
 if(collection==='runs'){
  const fields='updateDescription' in event?Object.keys(event.updateDescription.updatedFields||{}):['status'];
  if(document.purpose==='automation'){if(fields.some(field=>/^(status|sleep|chargedNanos|reservedNanos|inboxId|delivery|error|usagePending)(\.|$)/.test(field))){records([owner],{keys:['automations']});dirty(owner,['wallet','notifications']);}}
  else{dirty(owner,['run',...(fields.some(field=>/^(status|chargedNanos|reservedNanos|usagePending)/.test(field))?['wallet' as const]:[]),...(fields.some(field=>field.startsWith('approvals'))?['notifications' as const]:[])]);}return;
 }
}
async function startWatch(){
 if(starting)return starting;
 starting=(async()=>{
  const stream=db().watch([{$match:{'ns.coll':{$in:['recordEvents','liveSubscriptions','users','runs','messages','ledger','sessions','connections','directMessages','blocks','posts','postLikes','notifications','uploads','searchDocuments','chatSearchChunks','agentInbox','automations','postSaves','logEntries','logPreferences','logBirthdays']}}}],{fullDocument:'updateLookup',maxAwaitTimeMS:1000});watcher=stream;
  try{const first=await stream.tryNext();if(first)await dispatchLiveChange(first);}catch(error){starting=undefined;watcher=undefined;await stream.close();throw error;}
  void(async()=>{try{for await(const event of stream)await dispatchLiveChange(event);}catch(error){if(watcher===stream)console.error('Live state connection interrupted',{name:error instanceof Error?error.name:'Error'});}finally{if(watcher===stream){watcher=undefined;starting=undefined;for(const listener of [...subscribers])listener.close();}}})();
  if(!leaseTimer)leaseTimer=setInterval(()=>{const active=[...subscribers];if(active.length)void liveLeases().bulkWrite(active.map(listener=>({updateOne:{filter:{_id:listener.lease._id,connectionId:listener.lease.connectionId,instance:liveInstance},update:{$set:{expiresAt:new Date(Date.now()+180000)}}}}))).catch(()=>{for(const listener of active)listener.close();});},60000);
 })();return starting;
}
export async function readLiveState(userId: string, requested: LiveTopic[] = topics): Promise<LiveChange> {
  return transaction(async session => {
    const owner = requireValue(await users().findOne({ _id: userId }, { session }));
    const result: LiveChange = {};
    if (requested.includes('preferences')) result.preferences={...defaultPreferences,...owner.preferences};
    if (requested.includes('user')) result.user = profile(owner);
    if (requested.includes('wallet')) result.wallet = await wallet(userId, session, owner);
    if (requested.includes('messages')) { const page = await conversationPage(userId, 60, undefined, session); result.messages = page.items; result.conversationCursor = page.nextCursor; result.conversationGeneration = owner.chatGeneration || 0; }
    if (requested.includes('notifications')) result.notifications = await notificationState(userId, session);
    if (requested.includes('run')) { const active = owner.activeRun && await runs().findOne({ _id: owner.activeRun, userId }, { session }); result.run = active ? runView(active) : null; }
    return result;
  });
}

export async function streamLiveState(req:Request,res:Response){
 const actor=browserActor(req),userId=actor.userId;
 if(subscribers.size>=config.LIVE_MAX_CONNECTIONS)throw new AppError(429,'live_limit','Live connections are busy. Reconnecting shortly.');
 const sessionId=hash(req.cookies[config.SESSION_COOKIE]),credential=requireValue(await rows('sessions').findOne({_id:sessionId,userId,expiresAt:{$gt:new Date()}}));
 const channel=typeof req.query?.channel==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(req.query.channel)?req.query.channel:randomUUID();
 const lease=await acquireLiveLease(userId,sessionId,channel,recordKeys(req.query?.records));
 let closed=false,sequence=0,recordTimer:ReturnType<typeof setTimeout>|undefined;
 const sent=new Map<LiveTopic,string>(),epoch=randomUUID(),pendingKeys=new Set<string>();let pendingLog:RecordInvalidation['log']=[];
 let heartbeat:ReturnType<typeof setInterval>|undefined,expiration:ReturnType<typeof setTimeout>|undefined;
 const write=(value:string)=>{if(closed)return;if(res.writableLength>1_000_000){close();return;}if(value.startsWith('event: records'))metrics.recordFrames++;else if(value.startsWith('event: state'))metrics.stateFrames++;res.write(value);};
 const close=(auth=false)=>{if(closed)return;if(auth)write('event: auth-changed\ndata: {}\n\n');closed=true;clearTimeout(recordTimer);clearTimeout(expiration);clearInterval(heartbeat);subscribers.delete(listener);leases.delete(lease._id);const group=groups.get(userId);group?.listeners.delete(listener);if(group&&!group.listeners.size){clearTimeout(group.timer);groups.delete(userId);}const sameSession=sessions.get(sessionId);sameSession?.delete(listener);if(!sameSession?.size)sessions.delete(sessionId);void liveLeases().deleteOne({_id:lease._id,connectionId:lease.connectionId,instance:liveInstance}).catch(()=>{});if(!res.writableEnded)res.end();};
 const listener:Subscriber={userId,sessionId,lease,keys:lease.keys?new Set(lease.keys):null,close,
  state(current,requested){const change:LiveChange={};for(const topic of requested){const serialized=JSON.stringify(topic==='messages'?[current.messages,current.conversationGeneration]:current[topic]);const fingerprint=hash(serialized);if(sent.get(topic)!==fingerprint){Object.assign(change,{[topic]:current[topic]});sent.set(topic,fingerprint);}}if(change.messages){change.conversationCursor=current.conversationCursor;change.conversationGeneration=current.conversationGeneration;}if(Object.keys(change).length)write(`event: state\ndata: ${JSON.stringify({userId,epoch,sequence:++sequence,change})}\n\n`);},
  records(change){change.keys.forEach(key=>pendingKeys.add(key));if(change.keys.includes('log'))pendingLog=change.log&&pendingLog&&pendingLog.length+change.log.length<=128?[...pendingLog,...change.log]:undefined;if(recordTimer)return;recordTimer=setTimeout(()=>{recordTimer=undefined;write(`event: records\ndata: ${JSON.stringify({keys:[...pendingKeys],...(pendingLog?.length?{log:pendingLog}:{})})}\n\n`);pendingKeys.clear();pendingLog=[];},50);}
 };
 res.status(200).set({'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no',Connection:'keep-alive'});res.flushHeaders();res.write('retry: 1000\n\n');res.on('close',()=>close());
 const previous=leases.get(lease._id);previous?.close();subscribers.add(listener);leases.set(lease._id,listener);
 const group=groups.get(userId)||{listeners:new Set<Subscriber>(),dirty:new Set<LiveTopic>()};groups.set(userId,group);group.listeners.add(listener);
 const sameSession=sessions.get(sessionId)||new Set<Subscriber>();sameSession.add(listener);sessions.set(sessionId,sameSession);
 try{await startWatch();if(!closed){topics.forEach(topic=>group.dirty.add(topic));await flush(userId,group);}}catch{close();return;}
 if(closed)return;
 heartbeat=setInterval(()=>write(': heartbeat\n\n'),15000);
 expiration=setTimeout(()=>close(true),Math.max(1,Math.min(2147483647,new Date(credential.expiresAt as Date).getTime()-Date.now())));
}
export async function stopLiveState(){
 clearInterval(leaseTimer);leaseTimer=undefined;for(const listener of [...subscribers])listener.close();const stream=watcher;watcher=undefined;starting=undefined;await stream?.close();await liveLeases().deleteMany({instance:liveInstance});
}
