import {logDateLabel} from './logDate';
import {useEffect,useRef,useState} from 'react';
import QRCode from 'qrcode';
import QrScanner from 'qr-scanner';
import {CircleNotch} from '@phosphor-icons/react';
import type {Destination} from '../shared/navigation';
import {parseLogCode,type LogCode,type LogJoinPreview} from '../shared/logJoining';
import type {LogEntry} from '../shared/log';
import {operation,errorText} from './api';
import {usePanelLoading,usePanelVisible} from './PanelReadiness';

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
 return <section className="log-code log-task"><div className="log-task-content"><h2>Join this hangout</h2><p>Scan with New Drugs or your camera.</p>{qr?<button className="log-qr" onClick={()=>void share()} aria-label="Share hangout code"><img src={qr} alt="QR code to join this hangout"/></button>:!error&&<CircleNotch className="spin" size={24}/>}<p className="quiet small">Anyone with this code can join and see the hangout.</p>{error&&<p role="alert" className="error">{error}</p>}</div><div className="panel-actions log-task-footer"><button onClick={close}>{closeLabel}</button><button onClick={()=>navigate({view:'log_scan'})}>Scan</button><button disabled={!code} onClick={()=>void share()}>{copied?'Copied':'Share'}</button></div></section>;
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
 return <section className="log-scan log-task"><div className="log-task-content"><div className="log-camera"><video ref={video} muted playsInline/><span aria-hidden="true"/></div>{error?<p className="error" role="alert">{error}</p>:<p>Scan a New Drugs code.</p>}</div><div className="panel-actions log-task-footer"><button onClick={close}>Cancel</button></div></section>;
}
export function LogJoinPanel({code,navigate,close}:Props&{code:string}){
 const [preview,setPreview]=useState<LogJoinPreview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),key=useRef(crypto.randomUUID());
 useEffect(()=>{let alive=true;void operation<LogJoinPreview>('log.join_preview',{code}).then(result=>{if(alive)setPreview(result);}).catch(e=>{if(alive)setError(errorText(e));});return()=>{alive=false;};},[code]);
 usePanelLoading(!preview&&!error);
 const join=async()=>{if(busy||!preview)return;if(preview.joined){navigate({view:'log',resourceId:preview.entryId});return;}setBusy(true);setError('');try{const entry=await operation<LogEntry>('log.join',{code},{key:key.current,confirmed:true});changed();navigate({view:'log',resourceId:entry.id});}catch(e){setError(errorText(e));}finally{setBusy(false);}};
 return <section className="log-join log-task"><div className="log-task-content">{preview?<><h2>{preview.title||'(untitled)'}</h2><p>{logDateLabel(preview.date)}</p>{preview.place&&<p>{preview.place}</p>}<p>with {preview.people.map(person=>person.handle||person.name).join(', ')}</p><p className="quiet">Join to add your own note and photos.</p></>:!error&&<CircleNotch className="spin" size={24}/>} {error&&<p className="error" role="alert">{error}</p>}</div><div className="panel-actions log-task-footer"><button onClick={close}>Cancel</button><button className="solid" disabled={!preview||busy} onClick={()=>void join()}>{busy?'Joining…':preview?.joined?'Open hangout':'Join'}</button></div></section>;
}
