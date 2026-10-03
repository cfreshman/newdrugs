// @vitest-environment jsdom
import {act,createElement} from 'react';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {useTalkSession} from '../src/TalkSession';
import {setupDOM} from './dom';

const mocks=vi.hoisted(()=>({operation:vi.fn(),post:vi.fn(),sound:vi.fn(),rooms:[] as unknown[]}));
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),operation:mocks.operation,post:mocks.post}));
vi.mock('../src/talkSounds',()=>({playTalkSound:mocks.sound,unlockTalkSounds:vi.fn()}));
vi.mock('livekit-client',()=>{
 class Room{
 localParticipant={identity:'me',name:'Me',isMicrophoneEnabled:false,audioTrackPublications:new Map(),setMicrophoneEnabled:async(value:boolean)=>{this.localParticipant.isMicrophoneEnabled=value;}};
 remoteParticipants=new Map();
  events=new Map<string,(reason?:number)=>void>();
  constructor(){mocks.rooms.push(this);}
  async connect(){}async startAudio(){}async disconnect(){}on(name:string,handler:(reason?:number)=>void){this.events.set(name,handler);return this;}removeAllListeners(){this.events.clear();}
 }
 return {Room,RoomEvent:{ParticipantConnected:'connected',ParticipantDisconnected:'disconnected',ParticipantPermissionsChanged:'permissions',ActiveSpeakersChanged:'speaking',TrackSubscribed:'subscribed',TrackUnsubscribed:'unsubscribed',Disconnected:'closed'},DisconnectReason:{CLIENT_INITIATED:1,DUPLICATE_IDENTITY:2,PARTICIPANT_REMOVED:4,ROOM_DELETED:5,ROOM_CLOSED:10},Track:{Kind:{Audio:'audio'}}};
});
let dom:ReturnType<typeof setupDOM>;
const id='b0ff874d-3725-4630-a441-f0d32b8fd92f';
const space={id,title:'Night walks',description:'',hostId:'me',hostName:'@me',status:'live',revision:1,createdAt:'2026-10-01T00:00:00Z',speakerIds:['me'],speakers:[],myRole:'host'};
function Harness(){const talk=useTalkSession('me');return createElement('div',null,createElement('span',{'data-space':''},talk.space?.id||''),createElement('span',{'data-mic':''},talk.mic?'on':'off'),createElement('button',{onClick:()=>void talk.refresh()},'Refresh'),createElement('div',{ref:talk.audioHost,hidden:true}));}
let refreshedSpace:typeof space&{hostOffer?:{id:string;toId:string;expiresAt:string}};
beforeEach(()=>{dom=setupDOM();sessionStorage.clear();mocks.rooms.length=0;mocks.sound.mockReset();refreshedSpace=space;mocks.post.mockReset().mockResolvedValue({url:'wss://media.invalid',token:'token',space});mocks.operation.mockReset().mockImplementation(async(name:string)=>name==='spaces.get'?refreshedSpace:{items:[]});});
afterEach(()=>{dom.cleanup();sessionStorage.clear();});
it('rejoins the saved Talk space with its microphone state after a refresh',async()=>{
 sessionStorage.setItem('nd-talk-space:me',JSON.stringify({id,mic:true}));
 await act(async()=>dom.root.render(createElement(Harness)));
 expect(mocks.post).toHaveBeenCalledWith(`/spaces/${id}/token`);
 expect(dom.container.querySelector('[data-space]')?.textContent).toBe(id);
 expect(dom.container.querySelector('[data-mic]')?.textContent).toBe('on');
 await act(async()=>dom.root.render(null));
 await act(async()=>dom.root.render(createElement(Harness)));
 expect(mocks.post).toHaveBeenCalledTimes(2);
 expect(dom.container.querySelector('[data-space]')?.textContent).toBe(id);
});
it('rejoins the saved Talk space after a hard media disconnect',async()=>{
 sessionStorage.setItem('nd-talk-space:me',JSON.stringify({id,mic:true}));
 await act(async()=>{dom.root.render(createElement(Harness));await new Promise(resolve=>setTimeout(resolve,10));});
 expect(mocks.post).toHaveBeenCalledTimes(1);
 await act(async()=>{(mocks.rooms[0] as {events:Map<string,(reason?:number)=>void>}).events.get('closed')?.();await new Promise(resolve=>setTimeout(resolve,10));});
 expect(mocks.post).toHaveBeenCalledTimes(2);
 expect(dom.container.querySelector('[data-space]')?.textContent).toBe(id);
});
it('does not fight another tab after a duplicate-identity disconnect',async()=>{
 sessionStorage.setItem('nd-talk-space:me',JSON.stringify({id,mic:true}));
 await act(async()=>dom.root.render(createElement(Harness)));
 await act(async()=>{(mocks.rooms[0] as {events:Map<string,(reason?:number)=>void>}).events.get('closed')?.(2);});
 expect(sessionStorage.getItem('nd-talk-space:me')).toBeNull();
 expect(mocks.post).toHaveBeenCalledTimes(1);
});
it('plays the speaking-request cue once for a new host offer to this participant',async()=>{
 sessionStorage.setItem('nd-talk-space:me',JSON.stringify({id,mic:false}));
 const speaker={...space,hostId:'other',myRole:'speaker' as const};
 mocks.post.mockResolvedValue({url:'wss://media.invalid',token:'token',space:speaker});
 refreshedSpace={...speaker,hostOffer:{id:'offer-1',toId:'me',expiresAt:'2026-10-04T00:00:00Z'}};
 await act(async()=>dom.root.render(createElement(Harness)));
 const refresh=dom.container.querySelector<HTMLButtonElement>('button')!;
 await act(async()=>refresh.click());
 expect(mocks.sound).toHaveBeenCalledTimes(1);
 expect(mocks.sound).toHaveBeenCalledWith('request');
 await act(async()=>refresh.click());
 expect(mocks.sound).toHaveBeenCalledTimes(1);
 refreshedSpace={...speaker,hostOffer:{id:'offer-2',toId:'other',expiresAt:'2026-10-04T00:00:00Z'}};
 await act(async()=>refresh.click());
 expect(mocks.sound).toHaveBeenCalledTimes(1);
});
