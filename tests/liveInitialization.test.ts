import {EventEmitter} from 'node:events';
import {it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({resolveUser:undefined as undefined|((value:any)=>void),closeWatch:()=>{}}));
vi.mock('../server/auth',()=>({browserActor:(req:any)=>req.actor,hash:(value:string)=>value,profile:(user:any)=>({id:user._id}),users:()=>({findOne:()=>new Promise(resolve=>{state.resolveUser=resolve;})})}));
vi.mock('../server/wallet',()=>({wallet:async()=>({entries:[]}),runs:()=>({findOne:async()=>null})}));
vi.mock('../server/agent',()=>({runView:(value:unknown)=>value}));
vi.mock('../server/operations',()=>({conversationPage:async()=>({items:[],nextCursor:null})}));
vi.mock('../server/notifications',()=>({notificationState:async()=>({unread:0,items:[]})}));
vi.mock('../server/liveSubscriptions',()=>({liveInstance:'node',recordKeys:()=>['log'],liveLeases:()=>({deleteOne:async()=>{},deleteMany:async()=>{},bulkWrite:async()=>{}}),acquireLiveLease:async()=>({_id:'channel',connectionId:'connection',instance:'node',keys:['log']})}));
vi.mock('../server/db',()=>({transaction:async(callback:Function)=>callback(undefined),rows:()=>({findOne:async()=>({expiresAt:new Date(Date.now()+60000)})}),db:()=>({watch:()=>({tryNext:async()=>null,close:async()=>state.closeWatch(),async *[Symbol.asyncIterator](){await new Promise<void>(resolve=>{state.closeWatch=resolve;});}})})}));
import {streamLiveState,stopLiveState} from '../server/liveState';
import {config} from '../server/config';
it('leaves no timers when the client disconnects during initial projection',async()=>{
 vi.useFakeTimers();
 try{
  const emitter=new EventEmitter();const response=Object.assign(emitter,{writableLength:0,writableEnded:false,status(){return this;},set(){return this;},flushHeaders(){},write(){return true;},end(){this.writableEnded=true;emitter.emit('close');}});
  const opening=streamLiveState({actor:{userId:'fixture',source:'browser'},cookies:{[config.SESSION_COOKIE]:'fixture'},query:{channel:'fixture',records:'log'}} as any,response as any);
  await vi.waitFor(()=>expect(state.resolveUser).toBeTypeOf('function'));
  emitter.emit('close');state.resolveUser!({_id:'fixture'});await opening;await stopLiveState();
  expect(vi.getTimerCount()).toBe(0);
 }finally{vi.clearAllTimers();vi.useRealTimers();}
});
