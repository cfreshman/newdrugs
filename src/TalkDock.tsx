import {useEffect,useState,type MouseEvent} from 'react';
import {CaretDown,CaretUp,Hand,Info,Microphone,MicrophoneSlash,PhoneDisconnect,ShareNetwork,Waveform} from '@phosphor-icons/react';
import {useTalk} from './TalkSession';
import {NavLink,plainLinkClick} from './NavLink';
import './spaces.css';

const avatar=(name:string,photoId?:string)=><span className="space-avatar">{photoId?<img src={`/api/files/${encodeURIComponent(photoId)}`} alt=""/>:name.replace(/^@/,'').slice(0,1).toUpperCase()}</span>;
const photo=(metadata?:string)=>{try{const value=JSON.parse(metadata||'{}');return typeof value.photoId==='string'?value.photoId:undefined;}catch{return undefined;}};
function TalkElapsedTime({startedAt}:{startedAt:string}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const seconds=Math.max(0,Math.floor((now-Date.parse(startedAt))/1000))||0,minutes=Math.floor(seconds/60),hours=Math.floor(minutes/60);
 const clock=hours?`${hours}:${String(minutes%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`:`${minutes}:${String(seconds%60).padStart(2,'0')}`;
 return <time className="talk-live-time" dateTime={startedAt}>Live {clock}</time>;
}
export function TalkDock(){
 const talk=useTalk(),[infoOpen,setInfoOpen]=useState(false),[selected,setSelected]=useState<{id:string;name:string;speaker:boolean}|null>(null);
 if(!talk?.space||!talk.room)return null;
 const {space,members,speaking,requests,mic,audioBlocked,expanded,busy,error,copied}=talk,role=space.myRole||'listener',canSpeak=role==='host'||role==='speaker';
 const participants=members.filter(person=>person.identity),speakers=participants.filter(person=>space.speakerIds.includes(person.identity)),listeners=participants.filter(person=>!space.speakerIds.includes(person.identity));
 const profileIds=new Set(space.profileIds||[]);
 const microphoneOn=(person:typeof members[number])=>[...person.audioTrackPublications.values()].some(publication=>Boolean(publication.track)&&!publication.isMuted);
 const action=(work:Promise<unknown>)=>void work.catch(()=>{});
 const openProfile=(event:MouseEvent<HTMLAnchorElement>)=>{if(plainLinkClick(event)){setSelected(null);talk.setExpanded(false);}};
 const profileTo=(id:string)=>({view:'person' as const,resourceId:id});
 const personAvatar=(person:typeof members[number],speaker:boolean)=>{
  const name=person.name||'Member',picture=avatar(name,photo(person.metadata));
  if(role==='host'&&person.identity!==space.hostId)return <button type="button" className="space-avatar-button" aria-label={`Manage ${person.name|| (speaker?'speaker':'listener')}`} onClick={()=>setSelected({id:person.identity,name,speaker})}>{picture}</button>;
  return profileIds.has(person.identity)?<NavLink className="space-avatar-button" aria-label={`Open ${name} profile`} to={profileTo(person.identity)} onClick={openProfile}>{picture}</NavLink>:picture;
 };
 const personName=(person:typeof members[number])=>profileIds.has(person.identity)?<NavLink className="space-person-name" to={profileTo(person.identity)} onClick={openProfile}>{person.name||'Member'}</NavLink>:<strong>{person.name||'Member'}</strong>;
 const personMenu=()=>selected&&role==='host'?<div className="space-person-menu"><strong>{selected.name}</strong><div className="space-person-actions">{profileIds.has(selected.id)&&<NavLink to={profileTo(selected.id)} onClick={openProfile}>View profile</NavLink>}{selected.speaker&&!space.hostOffer&&<button type="button" disabled={busy} onClick={()=>{action(talk.offerHost(selected.id));setSelected(null);}}>Offer host</button>}{selected.speaker&&<button type="button" disabled={busy} onClick={()=>{action(talk.revoke(selected.id));setSelected(null);}}>Remove mic</button>}<button type="button" disabled={busy} onClick={()=>{action(talk.remove(selected.id));setSelected(null);}}>Remove from talk</button><button type="button" onClick={()=>setSelected(null)}>Close</button></div></div>:null;
 return <section className="talk-dock" data-expanded={expanded||undefined} aria-label={`Talk space: ${space.title}`}>
  <div className="talk-dock-bar"><button className="talk-dock-title" type="button" aria-expanded={expanded} onClick={()=>talk.setExpanded(!expanded)}><Waveform size={20}/><span><strong>{space.title}</strong>{!expanded&&(space.hostOffer?.toId===talk.room.localParticipant.identity?<small className="talk-host-notice">Host offer · Open to respond</small>:<small className="talk-compact-presence"><span className="talk-presence-group"><span className="talk-compact-avatars">{speakers.slice(0,3).map(person=><span key={person.identity} title={person.name||'Speaker'}>{avatar(person.name||'Member',photo(person.metadata))}</span>)}</span><span>{speakers.length} speaking</span></span>{listeners.length>0&&<span className="talk-presence-group"><span className="talk-compact-avatars">{listeners.slice(0,3).map(person=><span key={person.identity} title={person.name||'Listener'}>{avatar(person.name||'Member',photo(person.metadata))}</span>)}</span><span>{listeners.length} listening</span></span>}</small>)}</span></button>
   {audioBlocked&&<button type="button" className="talk-dock-audio" onClick={()=>action(talk.startAudio())}>Hear audio</button>}
   <button type="button" className="talk-dock-icon talk-hangup" aria-label={role==='host'?'End talk space':'Leave talk space'} disabled={busy} onClick={()=>action(role==='host'?talk.end():talk.leave())}><PhoneDisconnect size={21}/></button>
   {canSpeak?<button type="button" className="talk-dock-icon talk-mic" data-mic-active={mic||undefined} aria-label={mic?'Mic on. Mute microphone':'Mic off. Unmute microphone'} disabled={busy} onClick={()=>action(talk.toggleMic())}>{mic?<Microphone size={21}/>:<MicrophoneSlash size={21}/>}</button>:<button type="button" className="talk-dock-icon" aria-label={space.myRequest==='pending'?'Cancel speaking request':'Request to speak'} aria-pressed={space.myRequest==='pending'} disabled={busy} onClick={()=>action(talk.request())}><Hand size={21} weight={space.myRequest==='pending'?'fill':'regular'}/></button>}
   <button type="button" className="talk-dock-icon" aria-label={expanded?'Collapse talk space':'Expand talk space'} aria-expanded={expanded} onClick={()=>talk.setExpanded(!expanded)}>{expanded?<CaretDown size={21}/>:<CaretUp size={21}/>}</button>
  </div>
  {expanded&&<div className="talk-dock-body">{space.hostOffer&&<div className="talk-host-offer"><span>{role==='host'?`Host offer sent to ${members.find(person=>person.identity===space.hostOffer?.toId)?.name||space.speakers.find(person=>person.id===space.hostOffer?.toId)?.name||'speaker'}`:'Become host?'}</span>{role==='host'?<button type="button" disabled={busy} onClick={()=>action(talk.cancelHostOffer())}>Cancel offer</button>:<><button type="button" disabled={busy} onClick={()=>action(talk.acceptHost())}>Accept</button><button type="button" disabled={busy} onClick={()=>action(talk.declineHost())}>Decline</button></>}</div>}{space.description&&<div className="talk-dock-heading"><button type="button" aria-label="Talk space description" aria-expanded={infoOpen} onClick={()=>setInfoOpen(value=>!value)}><Info size={21}/></button></div>}
    {infoOpen&&space.description&&<div className="talk-info-panel"><p>{space.description}</p></div>}
    <div className="talk-dock-people"><h3>Speakers</h3><div className="space-avatar-grid">{speakers.map(person=>{const live=microphoneOn(person);return <div className={`space-person ${speaking.has(person.identity)?'speaking':''}`} key={person.identity}>{personAvatar(person,true)}{!live&&<span className="talk-person-mic" role="img" aria-label={`${person.name||'Speaker'} muted`} title="Muted"><MicrophoneSlash size={13}/></span>}{personName(person)}<small>{person.identity===space.hostId?'Host':'Speaker'}</small></div>;})}</div>{selected?.speaker&&personMenu()}
     {role==='host'&&requests.length>0&&<div className="space-requests"><h3>Requests to speak</h3>{requests.map(item=><div key={item.personId}><span>{item.name}</span><button type="button" disabled={busy} onClick={()=>action(talk.respond(item.personId,true))}>Accept</button><button type="button" disabled={busy} onClick={()=>action(talk.respond(item.personId,false))}>Decline</button></div>)}</div>}
     <h3>Listeners</h3><div className="space-avatar-grid">{listeners.length?listeners.map(person=><div className="space-person" key={person.identity}>{personAvatar(person,false)}{personName(person)}</div>):<p>No listeners yet.</p>}</div>{selected&&!selected.speaker&&personMenu()}
    </div>{error&&<p className="error" role="alert">{error}</p>}
    <footer className="talk-dock-footer">{copied?<span className="quiet small">Link copied</span>:<TalkElapsedTime startedAt={space.createdAt}/>}<button type="button" aria-label="Share talk space" onClick={()=>action(talk.share())}><ShareNetwork size={21}/></button></footer>
   </div>}
 </section>;
}
