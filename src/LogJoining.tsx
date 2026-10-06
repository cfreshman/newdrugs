import {TransientError} from './TransientError';
import {LogMedia} from './LogMedia';
import {useLogMediaDetail,LogNoteDetailLink} from './LogMediaDetail';
import {AgentMarkdown} from './AgentMarkdown';
import {LinkPreviews} from './LinkPreview';
import {useRecordRefresh} from './useRecordRefresh';
import {PostPhotos} from './PostPhotos';
import {Temporal} from '@js-temporal/polyfill';
import {logDateLabel} from './logDate';
import {useCallback,useEffect,useRef,useState} from 'react';
import QRCode from 'qrcode';
import QrScanner from 'qr-scanner';
import {CircleNotch} from '@phosphor-icons/react';
import type {Destination} from '../shared/navigation';
import {parseLogCode,type LogCode,type LogJoinPreview} from '../shared/logJoining';
import type {LogEntry} from '../shared/log';
import {api,operation,errorText} from './api';
import {PanelVisibilityContext,usePanelLoading,usePanelVisible} from './PanelReadiness';
import {NavLink} from './NavLink';

type Props={closeLabel?:string;navigate(destination:Destination):void;close():void};
const changed=()=>window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:['log','people']}));
export function LogCodePanel({entryId,navigate,close,closeLabel='Close'}:Props&{entryId:string}){
 const [code,setCode]=useState<LogCode|null>(null),[qr,setQr]=useState(''),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const key=useRef(crypto.randomUUID());
 useEffect(()=>{let alive=true;void operation<LogCode>('log.code',{entryId},{key:key.current}).then(async result=>{
  const url=new URL(`/log/join/${result.code}`,location.origin).href,image=await QRCode.toDataURL(url,{width:600,margin:2,errorCorrectionLevel:'M'});
  if(alive){setCode({...result,url});setQr(image);}
 }).catch(e=>{if(alive)setError(errorText(e));});return()=>{alive=false;};},[entryId]);
 usePanelLoading(!code&&!error);
 const share=async()=>{if(!code)return;try{if(navigator.share)await navigator.share({title:'Join hangout',url:code.url});else{await navigator.clipboard.writeText(code.url);setCopied(true);}}catch(e){if(!(e instanceof DOMException&&e.name==='AbortError'))setError(errorText(e));}};
 return <section className="log-code log-task"><div className="log-task-content"><h2>Join this hangout</h2><p>Scan with New Drugs or your camera.</p>{qr?<button className="log-qr" onClick={()=>void share()} aria-label="Share hangout code"><img src={qr} alt="QR code to join this hangout"/></button>:!error&&<CircleNotch className="spin" size={24}/>}<p className="quiet small">Anyone with this code can see and join the hangout.</p>{error&&<TransientError role="alert" className="error">{error}</TransientError>}</div><div className="panel-actions log-task-footer"><button onClick={close}>{closeLabel}</button><NavLink to={{view:'log_scan'}} navigate={navigate}>Scan</NavLink><button disabled={!code} onClick={()=>void share()}>{copied?'Copied':'Share'}</button></div></section>;
}
export function LogScanPanel({navigate,close}:Props){
 const visible=usePanelVisible(),video=useRef<HTMLVideoElement>(null),scanner=useRef<QrScanner|null>(null),[error,setError]=useState(''),scanned=useRef(false);
 const visibleRef=useRef(visible);visibleRef.current=visible;const aliveRef=useRef(true);useEffect(()=>{aliveRef.current=true;return()=>{aliveRef.current=false;};},[]);
 const accept=(text:string)=>{if(!visibleRef.current||!aliveRef.current)return;const code=parseLogCode(text,location.origin);if(!code){setError('Use a New Drugs hangout code.');return;}if(scanned.current)return;scanned.current=true;scanner.current?.stop();navigate({view:'log_join',resourceId:code});};
 const acceptRef=useRef(accept);acceptRef.current=accept;
 useEffect(()=>{
  if(!visible||!video.current)return;if(!navigator.mediaDevices?.getUserMedia){setError('Camera unavailable in this browser.');return;}let alive=true;scanned.current=false;
  const reader=new QrScanner(video.current,result=>acceptRef.current(result.data),{preferredCamera:'environment',maxScansPerSecond:8,returnDetailedScanResult:true,onDecodeError:()=>{}});scanner.current=reader;
  const start=()=>{if(document.hidden||scanned.current)return;void reader.start().catch(()=>{if(alive)setError('Allow camera access in your browser settings to scan.');});};
  const visibility=()=>{if(document.hidden)reader.stop();else start();};start();document.addEventListener('visibilitychange',visibility);
  return()=>{alive=false;document.removeEventListener('visibilitychange',visibility);reader.destroy();if(scanner.current===reader)scanner.current=null;};
 },[visible]);
 return <section className="log-scan log-task"><div className="log-task-content"><div className="log-camera"><video ref={video} muted playsInline/><span aria-hidden="true"/></div>{error?<TransientError className="error" role="alert">{error}</TransientError>:<p>Scan a New Drugs code.</p>}</div><div className="panel-actions log-task-footer"><button onClick={close}>Cancel</button></div></section>;
}
export function LogJoinPanel({code,navigate,close,registered=true,onAccount,onJoined}:Props&{code:string;registered?:boolean;onAccount?():void;onJoined?(entryId:string):void}){
 const visible=usePanelVisible();
 const openEntry=(entryId:string)=>onJoined?onJoined(entryId):navigate({view:'log',resourceId:entryId});
 const [preview,setPreview]=useState<LogJoinPreview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),key=useRef(crypto.randomUUID());
 const media=useLogMediaDetail(preview?{id:preview.entryId,title:preview.title,contributors:preview.contributors,coverId:preview.photos[0]?.id}:null,visible,navigate,close);
 const generation=useRef(0);
 const load=useCallback(async()=>{if(!visible)return;const request=++generation.current;try{const result=await (registered?operation<LogJoinPreview>('log.join_preview',{code}):api<LogJoinPreview>(`/log-invites/${encodeURIComponent(code)}`));if(request===generation.current){setPreview(result);setError('');}}catch(e){if(request===generation.current){setPreview(null);setError(errorText(e));}}},[code,registered,visible]);
 useEffect(()=>{void load();return()=>{generation.current++;};},[load]);useRecordRefresh(['log'],load);
 usePanelLoading(!preview&&!error);
 useEffect(()=>{if(visible&&registered&&preview?.joined)openEntry(preview.entryId);},[visible,registered,preview?.joined,preview?.entryId]);
 const join=async()=>{if(busy||!preview)return;if(!registered){onAccount?.();return;}if(preview.joined){openEntry(preview.entryId);return;}setBusy(true);setError('');try{const entry=await operation<LogEntry>('log.join',{code},{key:key.current,confirmed:true});changed();openEntry(entry.id);}catch(e){setError(errorText(e));}finally{setBusy(false);}};
 return <PanelVisibilityContext.Provider value={visible&&!media.open}><section ref={media.anchor} className="log-join log-detail log-task"><div className="log-detail-body">{preview?<><h2>{preview.title||'(untitled)'}</h2>
  <div className="log-photo-strip"><PostPhotos log horizontal onOpen={media.photo} photos={preview.photos||[]}/></div><div className="log-entry-facts"><p>{preview.date>Temporal.Now.plainDateISO().toString()?'plan for':'hung out'} {logDateLabel(preview.date)}</p>{preview.place&&<p>at {preview.place}</p>}<p>with {[...preview.people.map(person=>person.handle||person.name),...(preview.historicalPeople||[])].join(', ')}</p></div>{preview.recurrence&&preview.recurrence!=='none'&&<span className="log-recurrence-label">{preview.recurrence==='birthday'?'Birthday':'Anniversary'}</span>}
  <div className="log-contributions">{(preview.contributors||[]).filter(person=>person.note.trim()||person.files.some(file=>!file.mime.startsWith('image/'))).map(person=><section className="log-contribution" key={person.userId}><span className="log-author">{person.handle||person.name}</span><div className="log-note-content">{person.note.trim()&&<LogNoteDetailLink name={person.handle||person.name} open={element=>media.note(person.userId,element)}><AgentMarkdown text={person.note}/></LogNoteDetailLink>}<LogMedia files={person.files.filter(file=>!file.mime.startsWith('image/'))}/></div></section>)}</div><div className="log-entry-links">{(preview.links||[]).map(url=><LinkPreviews key={url} text="" links={[url]}/>)}</div></>:!error&&<CircleNotch className="spin" size={24}/>} {error&&<TransientError className="error" role="alert">{error}</TransientError>}</div>
  <footer className="log-detail-footer"><div className="panel-actions log-entry-actions"><button onClick={close}>Cancel</button><button className="solid" disabled={!preview||busy} onClick={()=>void join()}>{busy?'Joining…':preview?.joined?'Open hangout':'Join hangout'}</button></div></footer>{media.detail}
 </section></PanelVisibilityContext.Provider>;
}
