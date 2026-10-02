import {createContext,useCallback,useContext,useEffect,useRef,useState,type RefObject} from 'react';
import type {Room,Participant,RemoteTrack} from 'livekit-client';
import type {Space} from '../shared/spaces';
import {ApiError,errorText,operation,post} from './api';
import {useRecordRefresh} from './useRecordRefresh';
import {playTalkSound,unlockTalkSounds} from './talkSounds';

interface TalkSession {
 space:Space|null;room:Room|null;members:Participant[];speaking:Set<string>;requests:{personId:string;name:string}[];
 mic:boolean;audioBlocked:boolean;expanded:boolean;busy:boolean;error:string;copied:boolean;audioHost:RefObject<HTMLDivElement|null>;
 setExpanded(value:boolean):void;create(title:string,description:string):Promise<void>;join(id:string,unmute?:boolean):Promise<void>;
 leave():Promise<void>;end():Promise<void>;toggleMic():Promise<void>;request():Promise<void>;
 respond(personId:string,approve:boolean):Promise<void>;revoke(personId:string):Promise<void>;remove(personId:string):Promise<void>;share():Promise<void>;refresh():Promise<void>;startAudio():Promise<void>;
 offerHost(personId:string):Promise<void>;cancelHostOffer():Promise<void>;acceptHost():Promise<void>;declineHost():Promise<void>;
}
export const TalkContext=createContext<TalkSession|null>(null);
export const useTalk=()=>useContext(TalkContext);
const changed=()=>window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:['spaces']}));
const sessionKey=(userId:string)=>`nd-talk-space:${userId}`;
function readSession(userId:string){try{const value=JSON.parse(sessionStorage.getItem(sessionKey(userId))||'null');return value&&typeof value.id==='string'&&/^[0-9a-f-]{36}$/i.test(value.id)?{id:value.id,mic:value.mic===true}:null;}catch{return null;}}
function rememberSession(userId:string,id:string,mic:boolean){try{sessionStorage.setItem(sessionKey(userId),JSON.stringify({id,mic}));}catch{}}
function forgetSession(userId?:string){if(!userId)return;try{sessionStorage.removeItem(sessionKey(userId));}catch{}}

export function useTalkSession(userId?:string):TalkSession{
 const [space,setSpace]=useState<Space|null>(null),[room,setRoom]=useState<Room|null>(null),[members,setMembers]=useState<Participant[]>([]),[speaking,setSpeaking]=useState<Set<string>>(new Set()),[requests,setRequests]=useState<{personId:string;name:string}[]>([]);
 const [mic,setMic]=useState(false),[audioBlocked,setAudioBlocked]=useState(false),[expanded,setExpanded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const [reconnectAttempt,setReconnectAttempt]=useState(0);
 const audioHost=useRef<HTMLDivElement>(null),activeSession=useRef<{id:string;role:Space['myRole'];requests:Set<string>}|null>(null),generation=useRef(0),livekit=useRef<typeof import('livekit-client')|null>(null);
 const refresh=useCallback(async()=>{
  const session=activeSession.current;if(!session)return;const ticket=++generation.current;
  try{
   const next=await operation<Space>('spaces.get',{spaceId:session.id});
   if(ticket!==generation.current||activeSession.current!==session)return;
   if(next.status==='ended'){forgetSession(userId);void room?.disconnect();activeSession.current=null;setSpace(null);setRoom(null);return;}
   if(session.role==='listener'&&next.myRole==='speaker')playTalkSound('approved');
   const becameHost=session.role!=='host'&&next.myRole==='host';
   session.role=next.myRole;setSpace(next);
   if(next.myRole==='host'){
    const pending=(await operation<{items:{personId:string;name:string}[]}>('spaces.requests',{spaceId:session.id})).items;
    if(ticket!==generation.current||activeSession.current!==session)return;
    if(!becameHost&&pending.some(item=>!session.requests.has(item.personId)))playTalkSound('request');
    session.requests=new Set(pending.map(item=>item.personId));setRequests(pending);
   }else{session.requests.clear();setRequests([]);}
  }catch(cause){if(ticket===generation.current)setError(errorText(cause));}
 },[room,userId]);
 useRecordRefresh(['spaces'],refresh);
 useEffect(()=>{if(!space)return;const timer=setInterval(()=>void refresh(),10000);return()=>clearInterval(timer);},[space?.id,refresh]);
 useEffect(()=>{if(!room||!livekit.current)return;const {RoomEvent,Track,DisconnectReason}=livekit.current;
  const sync=()=>setMembers([room.localParticipant,...room.remoteParticipants.values()]);
  const audio=(track:RemoteTrack)=>{if(track.kind!==Track.Kind.Audio||!audioHost.current)return;const element=track.attach();audioHost.current.append(element);sync();};
  const remove=(track:RemoteTrack)=>{for(const element of track.detach())element.remove();sync();};
  room.on(RoomEvent.ParticipantConnected,sync).on(RoomEvent.ParticipantDisconnected,sync).on(RoomEvent.ParticipantPermissionsChanged,()=>{sync();void refresh();}).on(RoomEvent.ActiveSpeakersChanged,people=>setSpeaking(new Set(people.map(person=>person.identity)))).on(RoomEvent.TrackSubscribed,audio).on(RoomEvent.TrackUnsubscribed,remove).on(RoomEvent.TrackPublished,sync).on(RoomEvent.TrackUnpublished,sync).on(RoomEvent.TrackMuted,sync).on(RoomEvent.TrackUnmuted,sync).on(RoomEvent.LocalTrackPublished,sync).on(RoomEvent.LocalTrackUnpublished,sync);
  room.on(RoomEvent.Disconnected,reason=>{if([DisconnectReason.CLIENT_INITIATED,DisconnectReason.DUPLICATE_IDENTITY,DisconnectReason.PARTICIPANT_REMOVED,DisconnectReason.ROOM_DELETED,DisconnectReason.ROOM_CLOSED].some(value=>value===reason))forgetSession(userId);activeSession.current=null;setRoom(null);setSpace(null);setMic(false);});
  document.addEventListener('pointerdown',unlockTalkSounds,{passive:true});
  sync();for(const participant of room.remoteParticipants.values())for(const publication of participant.audioTrackPublications.values())if(publication.track)audio(publication.track);
  return()=>{document.removeEventListener('pointerdown',unlockTalkSounds);room.removeAllListeners();for(const element of audioHost.current?.children||[])element.remove();void room.disconnect();};
 },[room,refresh]);
 useEffect(()=>{if(!userId){activeSession.current=null;void room?.disconnect();setRoom(null);setSpace(null);return;}if(room||activeSession.current)return;const saved=readSession(userId);if(!saved)return;const attempt=()=>void join(saved.id,saved.mic).catch(()=>setReconnectAttempt(value=>value+1));if(!reconnectAttempt){attempt();return;}const timer=setTimeout(attempt,Math.min(reconnectAttempt*1000,10000));return()=>clearTimeout(timer);},[userId,room,reconnectAttempt]);
 const join=async(id:string,unmute=false)=>{
  if(room){if(space?.id===id){setExpanded(true);return;}throw Error('Leave the current Talk space before joining another.');}
  unlockTalkSounds();setBusy(true);setError('');let next:Room|null=null;
  try{
   const access=await post<{url:string;token:string;space:Space}>(`/spaces/${id}/token`),media=livekit.current||await import('livekit-client');
   livekit.current=media;next=new media.Room({adaptiveStream:true,dynacast:true});await next.connect(access.url,access.token);
   let initialRequests:{personId:string;name:string}[]=[];
   if(access.space.myRole==='host')try{initialRequests=(await operation<{items:{personId:string;name:string}[]}>('spaces.requests',{spaceId:id})).items;}catch{}
   activeSession.current={id,role:access.space.myRole,requests:new Set(initialRequests.map(item=>item.personId))};
   setRequests(initialRequests);setRoom(next);setSpace(access.space);setExpanded(false);setReconnectAttempt(0);
   try{await next.startAudio();setAudioBlocked(false);}catch{setAudioBlocked(true);}
   if(unmute&&access.space.myRole==='host')try{await next.localParticipant.setMicrophoneEnabled(true);setMic(next.localParticipant.isMicrophoneEnabled);}catch(cause){setError(`Microphone: ${errorText(cause)}`);}
   if(userId)rememberSession(userId,id,next.localParticipant.isMicrophoneEnabled);
  }catch(cause){void next?.disconnect();if(cause instanceof ApiError&&[403,404,409].includes(cause.status))forgetSession(userId);setError(errorText(cause));throw cause;}
  finally{setBusy(false);}
 };
 const create=async(title:string,description:string)=>{if(room)throw Error('Leave the current Talk space before opening another.');unlockTalkSounds();setBusy(true);setError('');try{const saved=await operation<Space>('spaces.create',{title,description},{confirmed:true});changed();setBusy(false);await join(saved.id,true);}catch(cause){setError(errorText(cause));throw cause;}finally{setBusy(false);}};
 const leave=async()=>{if(!room)return;if(space?.myRole==='host'){await end();return;}forgetSession(userId);activeSession.current=null;setRoom(null);setSpace(null);setMic(false);await room.disconnect();};
 const end=async()=>{if(!space)return;setBusy(true);setError('');try{await operation('spaces.end',{spaceId:space.id,revision:space.revision},{confirmed:true});forgetSession(userId);activeSession.current=null;const current=room;setRoom(null);setSpace(null);setMic(false);await current?.disconnect();changed();}catch(cause){setError(errorText(cause));throw cause;}finally{setBusy(false);}};
 const toggleMic=async()=>{if(!room||busy)return;setBusy(true);setError('');try{await room.localParticipant.setMicrophoneEnabled(!mic);const live=room.localParticipant.isMicrophoneEnabled;setMic(live);if(userId&&space)rememberSession(userId,space.id,live);}catch(cause){setError(errorText(cause));throw cause;}finally{setBusy(false);}};
 const request=async()=>{if(!space)return;unlockTalkSounds();setBusy(true);setError('');try{await operation(space.myRequest==='pending'?'spaces.cancel_request':'spaces.request_speak',{spaceId:space.id});await refresh();}catch(cause){setError(errorText(cause));throw cause;}finally{setBusy(false);}};
 const respond=async(personId:string,approve:boolean)=>{if(!space)return;setBusy(true);setError('');try{const value=await operation<{space:Space}>('spaces.respond_speaker',{spaceId:space.id,revision:space.revision,personId,approve},{confirmed:true});setSpace(value.space);await refresh();}catch(cause){setError(errorText(cause));throw cause;}finally{setBusy(false);}};
 const revoke=async(personId:string)=>{if(!space)return;setBusy(true);setError('');try{const value=await operation<{space:Space}>('spaces.revoke_speaker',{spaceId:space.id,revision:space.revision,personId});setSpace(value.space);}catch(cause){setError(errorText(cause));throw cause;}finally{setBusy(false);}};
 const remove=async(personId:string)=>{if(!space)return;setBusy(true);setError('');try{const value=await operation<{space:Space}>('spaces.remove_person',{spaceId:space.id,revision:space.revision,personId},{confirmed:true});setSpace(value.space);}catch(cause){setError(errorText(cause));throw cause;}finally{setBusy(false);}};
 const hostAction=async(name:'spaces.offer_host'|'spaces.cancel_host_offer'|'spaces.accept_host'|'spaces.decline_host',extra:Record<string,string>={})=>{if(!space)return;setBusy(true);setError('');try{const value=await operation<Space>(name,{spaceId:space.id,revision:space.revision,...extra},{confirmed:name==='spaces.accept_host'});setSpace(value);await refresh();changed();}catch(cause){setError(errorText(cause));await refresh();throw cause;}finally{setBusy(false);}};
 const offerHost=(personId:string)=>hostAction('spaces.offer_host',{personId});
 const cancelHostOffer=()=>space?.hostOffer?hostAction('spaces.cancel_host_offer',{offerId:space.hostOffer.id}):Promise.resolve();
 const acceptHost=()=>space?.hostOffer?hostAction('spaces.accept_host',{offerId:space.hostOffer.id}):Promise.resolve();
 const declineHost=()=>space?.hostOffer?hostAction('spaces.decline_host',{offerId:space.hostOffer.id}):Promise.resolve();
 const share=async()=>{if(!space)return;const url=new URL(`/spaces/${space.id}`,location.origin).href;try{if(navigator.share)await navigator.share({title:space.title,url});else{await navigator.clipboard.writeText(url);setCopied(true);setTimeout(()=>setCopied(false),2000);}}catch(cause){if((cause as Error).name!=='AbortError')setError(errorText(cause));}};
 const startAudio=async()=>{if(!room)return;try{await room.startAudio();setAudioBlocked(false);}catch(cause){setError(errorText(cause));}};
 return {space,room,members,speaking,requests,mic,audioBlocked,expanded,busy,error,copied,audioHost,setExpanded,create,join,leave,end,toggleMic,request,respond,revoke,remove,offerHost,cancelHostOffer,acceptHost,declineHost,share,refresh,startAudio};
}
