import {EventEmitter} from 'node:events';import {randomUUID} from 'node:crypto';
import {it,expect,vi,afterEach} from 'vitest';
const state=vi.hoisted(()=>({balances:new Map<string,number>(),reads:0,closeWatch:()=>{}}));
vi.mock('../server/auth',()=>({browserActor:(req:any)=>req.actor,hash:(value:string)=>value,profile:(user:any)=>({id:user._id}),users:()=>({findOne:async({ _id}:any)=>{state.reads++;return {_id,name:_id,balanceNanos:state.balances.get(_id)||0,reservedNanos:0};}})}));
vi.mock('../server/wallet',()=>({wallet:async(userId:string)=>({balanceNanos:state.balances.get(userId)||0,reservedNanos:0,availableNanos:0,entries:[]}),runs:()=>({findOne:async()=>null})}));
vi.mock('../server/agent',()=>({runView:(value:unknown)=>value}));
vi.mock('../server/operations',()=>({conversationPage:async()=>({items:[],nextCursor:null})}));
vi.mock('../server/notifications',()=>({notificationState:async()=>({unread:0,items:[]})}));
vi.mock('../server/liveSubscriptions',()=>({liveInstance:'node',recordKeys:(value:string)=>value.split(','),liveLeases:()=>({deleteOne:async()=>{},deleteMany:async()=>{},bulkWrite:async()=>{}}),acquireLiveLease:async(userId:string,sessionId:string,channel:string,keys:string[])=>({_id:channel,userId,sessionId,channel,keys,connectionId:channel,instance:'node'})}));
vi.mock('../server/db',()=>({transaction:async(callback:Function)=>callback(undefined),rows:()=>({findOne:async()=>({expiresAt:new Date(Date.now()+60000)})}),db:()=>({watch:()=>({tryNext:async()=>null,close:async()=>state.closeWatch(),async *[Symbol.asyncIterator](){await new Promise<void>(resolve=>{state.closeWatch=resolve;});}})})}));
import {dispatchLiveChange,streamLiveState,stopLiveState,liveStateMetrics} from '../server/liveState';import {config} from '../server/config';
afterEach(async()=>{await stopLiveState();state.balances.clear();state.reads=0;});
it('refreshes DM unread indicators only for the notification owner and interested views',async()=>{
 const tabs:{owner:string;keys:string;events:string[]}[]=[];
 for(const [owner,keys] of [['owner','connections'],['owner','posts'],['someone-else','connections']]){
  const events:string[]=[],emitter=new EventEmitter();tabs.push({owner,keys,events});
  const response=Object.assign(emitter,{writableLength:0,writableEnded:false,status(){return this;},set(){return this;},flushHeaders(){},write(text:string){events.push(text);return true;},end(){this.writableEnded=true;emitter.emit('close');}});
  await streamLiveState({actor:{userId:owner,source:'browser'},cookies:{[config.SESSION_COOKIE]:randomUUID()},query:{channel:randomUUID(),records:keys}} as any,response as any);
 }
 await dispatchLiveChange({ns:{coll:'notifications'},documentKey:{_id:'call-notice'},fullDocument:{_id:'call-notice',userId:'owner',connectionId:'dm',kind:'call',readAt:new Date().toISOString()}} as any);
 await vi.waitFor(()=>expect(tabs[0].events.filter(event=>event.startsWith('event: records'))).toHaveLength(1));
 expect(tabs[0].events.find(event=>event.startsWith('event: records'))).toContain('connections');
 expect(tabs.slice(1).flatMap(tab=>tab.events.filter(event=>event.startsWith('event: records')))).toEqual([]);
});
it('keeps one private Log edit scoped with 1,000 synthetic live connections and shares per-account reads',async()=>{
 const tabs:{owner:string;events:string[]}[]=[];
 for(let i=0;i<1000;i++){
  const owner=`user-${Math.floor(i/2)}`,events:string[]=[];tabs.push({owner,events});
  const emitter=new EventEmitter();const response=Object.assign(emitter,{writableLength:0,writableEnded:false,status(){return this;},set(){return this;},flushHeaders(){},write(text:string){events.push(text);return true;},end(){this.writableEnded=true;emitter.emit('close');}});
  await streamLiveState({actor:{userId:owner,source:'browser'},cookies:{[config.SESSION_COOKIE]:randomUUID()},query:{channel:randomUUID(),records:'log'}} as any,response as any);
 }
 expect(liveStateMetrics().connections).toBe(1000);const reads=state.reads;
 await dispatchLiveChange({ns:{coll:'recordEvents'},fullDocument:{userIds:['user-0'],payload:{keys:['log'],log:[{id:'one-entry',date:'2026-09-27'}]}}} as any);
 await vi.waitFor(()=>expect(tabs.filter(tab=>tab.events.some(event=>event.startsWith('event: records')))).toHaveLength(2));expect(state.reads).toBe(reads);
 state.balances.set('user-0',100);await dispatchLiveChange({ns:{coll:'users'},documentKey:{_id:'user-0'},fullDocument:{_id:'user-0'},updateDescription:{updatedFields:{balanceNanos:100}}} as any);
 await vi.waitFor(()=>expect(tabs.filter(tab=>tab.events.some(event=>event.includes('"balanceNanos":100')))).toHaveLength(2));expect(state.reads-reads).toBe(1);
});
