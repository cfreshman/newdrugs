import {logImageUrl} from './logImageCache';
import {logDateLabel as dateLabel} from './logDate';
import {LogList} from './LogList';
import {LogTodayCards} from './LogTodayCards';
import {addedLogLinks} from '../shared/logLinks';
import {compactUrlLabel} from '../shared/links';
import {cachedLogEntry,cacheLogEntry,clearLogEntries,preloadLogPhotos} from './logEntryCache';
import {LogFloaters} from './LogChrome';
import type {LogContact} from '../shared/logJoining';
import {logCover as cover} from './logCalendarModel';
import {LogCalendar} from './LogCalendar';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {CalendarDots,SquaresFour,List,Plus,LinkSimple,CaretLeft,CaretRight,LockSimple,Users,Image,Microphone,Stop,DownloadSimple,DotsThree,X,CircleNotch} from '@phosphor-icons/react';
import {Temporal} from '@js-temporal/polyfill';
import {logFields,logPlainText,rebaseLogDraft,type LogEntry,type LogFields,type LogPreferences,type LogPage} from '../shared/log';
import type {Profile} from '../shared/types';
import type {Destination} from '../shared/navigation';
import {operation,errorText,ApiError} from './api';
import {uploadFile} from './uploads';
import type {UploadRef} from '../shared/uploads';
import {useRecordRefresh} from './useRecordRefresh';
import {usePanelLoading,usePanelVisible} from './PanelReadiness';
import {AgentMarkdown} from './AgentMarkdown';
import {PostPhotos} from './PostPhotos';
import {LinkPreviews} from './LinkPreview';
import {AudioPlayer} from './AudioPlayer';
import {DeleteConfirmation} from './DeleteConfirmation';
import './log.css';

type Navigate=(destination:Destination)=>void;
const today=()=>Temporal.Now.plainDateISO().toString();

const fields=(entry:LogEntry):LogFields=>({date:entry.date,title:entry.title,place:entry.place,links:entry.links,recurrence:entry.recurrence,coverFileId:entry.coverFileId});
const emit=()=>{clearLogEntries();window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:['log','storage']}));};
const emptyPreferences:LogPreferences={arrangement:'calendar',views:[],todayPresentation:'full'};

function LogTile({entry,open,compact=false,anniversary=false}:{entry:LogEntry;open():void;compact?:boolean;anniversary?:boolean}){
 const photo=cover(entry);
 return <button className={`log-tile ${compact?'log-tile-compact':''}`} onClick={open} title={entry.title||entry.contributors[0]?.note||'Open entry'}>
  {photo?<img src={logImageUrl(photo.url)} alt="" loading="lazy"/>:<div className="log-tile-note">{entry.contributors.map(person=>person.note).filter(Boolean).join(' · ')||entry.title||entry.place||'(untitled)'}</div>}
  <span className="log-tile-caption">{anniversary?'↻ ':''}{entry.title||entry.place||'Untitled'}</span>
  {entry.contributors.length>1&&<span className="log-tile-shared"><Users size={12}/>{entry.contributors.length}</span>}
 </button>;
}
function LogVideo({src}:{src:string}){const visible=usePanelVisible(),ref=useRef<HTMLVideoElement>(null);useEffect(()=>{if(!visible)ref.current?.pause();},[visible]);return <video ref={ref} className="log-video" src={src} controls playsInline preload="metadata" controlsList="nodownload"/>;}
function LogMedia({files}:{files:LogEntry['contributors'][number]['files']}){
 const visible=usePanelVisible();return <div className="log-media"><PostPhotos log photos={files.filter(f=>f.mime.startsWith('image/'))}/>{files.filter(f=>f.mime.startsWith('audio/')).map(file=><div key={file.id}><span className="quiet small">{file.name}</span><AudioPlayer src={file.url} active={visible}/></div>)}{files.filter(f=>f.mime.startsWith('video/')).map(file=><LogVideo key={file.id} src={file.url}/>)}</div>;
}
function Recorder({add,error,disabled,change}:{add(file:File):Promise<void>;error(message:string):void;disabled:boolean;change(recording:boolean):void}){
 const visible=usePanelVisible(),alive=useRef(true),visibleRef=useRef(visible);visibleRef.current=visible;
 const [recording,setRecording]=useState(false),[seconds,setSeconds]=useState(0),recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),discard=useRef(false);
 useEffect(()=>()=>{alive.current=false;discard.current=true;if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(track=>track.stop());},[]);
 useEffect(()=>{change(recording);},[recording]);
 useEffect(()=>{if(!visible&&recorder.current?.state==='recording')recorder.current.stop();},[visible]);
 useEffect(()=>{if(seconds>=300&&recorder.current?.state==='recording')recorder.current.stop();},[seconds]);
 useEffect(()=>{if(!recording)return;const timer=setInterval(()=>setSeconds(value=>value+1),1000);return()=>clearInterval(timer);},[recording]);
 const start=async()=>{try{
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw Error('Recording is unavailable in this browser. You can attach an audio file.');
  stream.current=await navigator.mediaDevices.getUserMedia({audio:true});if(!alive.current||!visibleRef.current){stream.current.getTracks().forEach(track=>track.stop());return;}discard.current=false;const mime=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(value=>MediaRecorder.isTypeSupported(value));
  const rec=new MediaRecorder(stream.current,mime?{mimeType:mime}:undefined),parts:Blob[]=[];let size=0;recorder.current=rec;
  rec.ondataavailable=event=>{parts.push(event.data);size+=event.data.size;if(size>10*1024*1024&&rec.state==='recording')rec.stop();};
  rec.onstop=()=>{stream.current?.getTracks().forEach(track=>track.stop());setRecording(false);if(discard.current)return;const type=rec.mimeType,ext=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'weba';void add(new File(parts,`Recording.${ext}`,{type}));};
  rec.start(1000);setSeconds(0);setRecording(true);
 }catch(e){stream.current?.getTracks().forEach(track=>track.stop());error(errorText(e));}};
 return recording?<div className="log-recording"><span role="timer">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span><button type="button" aria-label="Cancel recording" onClick={()=>{discard.current=true;recorder.current?.stop();}}><X size={18}/></button><button type="button" aria-label="Use recording" onClick={()=>recorder.current?.stop()}><Stop size={18} weight="fill"/></button></div>:<button type="button" disabled={disabled} onClick={()=>void start()}><Microphone size={19}/>record voice note</button>;
}

export function LogEditor({user,entry,date,onSaved,cancel,onRemoved}:{user:Profile;entry?:LogEntry;date?:string;onSaved(entry:LogEntry):void;cancel():void;onRemoved?():void}){
 const [previewLoaded,setPreviewLoaded]=useState<string|null>(null);
 const [removing,setRemoving]=useState(false),removeIntent=useRef<{revision:number;key:string}|null>(null);
 const [base,setBase]=useState(entry),[conflict,setConflict]=useState<LogEntry|null>(null);
 const own=entry?.contributors.find(p=>p.userId===user.id);
 const [draft,setDraft]=useState<LogFields>(entry?fields(entry):logFields.parse({date:date||today()})),[note,setNote]=useState(own?.note||''),[files,setFiles]=useState<LogEntry['contributors'][number]['files']>(own?.files||[]),[link,setLink]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[recording,setRecording]=useState(false);
 const [contacts,setContacts]=useState<LogContact[]>([]),[selectedPeople,setSelectedPeople]=useState<LogContact[]>([]),[choosingPeople,setChoosingPeople]=useState(false),[contactQuery,setContactQuery]=useState('');
 const saveProgress=useRef<{signature:string;entry:LogEntry}|null>(null),addIntents=useRef(new Map<string,string>());
 useEffect(()=>{let alive=true;void (async()=>{let before:string|undefined;const people:LogContact[]=[];do{const page=await operation<{items:LogContact[];nextCursor:string|null}>('log.contacts',{limit:30,...(before?{before}:{})});people.push(...page.items);before=page.nextCursor||undefined;}while(before);if(alive)setContacts(people);})().catch(e=>{if(alive)setError(errorText(e));});return()=>{alive=false;};},[]);
 const fileInput=useRef<HTMLInputElement>(null),intent=useRef<{signature:string;key:string}|null>(null),staged=useRef<string[]>([]),committed=useRef(false);
 useEffect(()=>()=>{if(!committed.current)for(const fileId of staged.current)void operation('files.discard',{fileId}).catch(()=>{});},[]);
 const addFile=async(file:File)=>{setUploading(true);setError('');try{if(files.length>=8)throw Error('An entry can hold eight attachments per person.');const saved=await uploadFile(file,'log_media');staged.current.push(saved.id);setFiles(previous=>[...previous,saved as Required<UploadRef>].slice(0,8));}catch(e){setError(errorText(e));}finally{setUploading(false);}};
 const save=async(event:FormEvent)=>{event.preventDefault();if(busy||uploading||recording)return;setBusy(true);setError('');try{
  const links=link.trim()?addedLogLinks(draft.links,link):draft.links;
  const input={...(base?{entryId:base.id,revision:base.revision}:{}),entry:{...draft,links},contribution:{note,fileIds:files.map(file=>file.id)}},signature=JSON.stringify(input);
  if(intent.current?.signature!==signature)intent.current={signature,key:crypto.randomUUID()};
  const contentSignature=JSON.stringify([input.entry,input.contribution]);
  let saved=saveProgress.current?.signature===contentSignature?saveProgress.current.entry:await operation<LogEntry>(base?'log.update':'log.create',input,{key:intent.current.key});
  committed.current=true;setBase(saved);saveProgress.current={signature:contentSignature,entry:saved};emit();
  for(const person of selectedPeople){if(saved.contributors.some(p=>p.userId===person.id))continue;
   const add={entryId:saved.id,revision:saved.revision,personId:person.id},signature=JSON.stringify(add);if(!addIntents.current.has(signature))addIntents.current.set(signature,crypto.randomUUID());
   saved=await operation<LogEntry>('log.add_person',add,{key:addIntents.current.get(signature),confirmed:true});saveProgress.current.entry=saved;setBase(saved);emit();
  }
  if(!entry){setBase(undefined);saveProgress.current=null;intent.current=null;addIntents.current.clear();setDraft(logFields.parse({date:draft.date}));setNote('');setFiles([]);setSelectedPeople([]);setLink('');staged.current=[];committed.current=false;}
  onSaved(saved);
 }catch(e){setError(errorText(e));if((base||saveProgress.current?.entry)&&e instanceof ApiError&&e.code==='log_changed'){try{setConflict(await operation<LogEntry>('log.get',{entryId:(base||saveProgress.current!.entry).id}));}catch(latestError){setError(errorText(latestError));}}}finally{setBusy(false);}};
 const addLink=()=>{try{setDraft({...draft,links:addedLogLinks(draft.links,link)});setLink('');setError('');}catch(e){setError(errorText(e));}};
 const previewPhoto=files.find(file=>file.id===draft.coverFileId&&file.mime.startsWith('image/'))||files.find(file=>file.mime.startsWith('image/'));
 return <form className="log-editor fields" onSubmit={save}><fieldset className="log-editor-body" disabled={busy}>
  <div className="log-editor-media"><div className="log-editor-preview" onLoadCapture={event=>{if(event.target instanceof HTMLImageElement)setPreviewLoaded(previewPhoto?.url||null);}} onErrorCapture={event=>{if(event.target instanceof HTMLImageElement)setPreviewLoaded(previewPhoto?.url||null);}}>{previewPhoto?<PostPhotos log photos={[previewPhoto]}/>:<button type="button" onClick={()=>fileInput.current?.click()}>image</button>}{(uploading||previewPhoto&&previewLoaded!==previewPhoto.url)&&<span className="log-media-loading" role="status" aria-label={uploading?'Uploading media':'Loading image'}><CircleNotch className="spin" size={26}/></span>}</div><div className="log-editor-media-actions"><button type="button" disabled={uploading||files.length>=8} onClick={()=>fileInput.current?.click()}>upload</button><button type="button" className={!previewPhoto?'log-media-action-hidden':undefined} disabled={!previewPhoto} aria-hidden={!previewPhoto||undefined} onClick={()=>{if(!previewPhoto)return;setFiles(previous=>previous.filter(file=>file.id!==previewPhoto.id));if(draft.coverFileId===previewPhoto.id)setDraft({...draft,coverFileId:null});}}>remove</button><button type="button" className={!previewPhoto||draft.coverFileId===previewPhoto.id?'log-media-action-hidden':undefined} disabled={!previewPhoto||draft.coverFileId===previewPhoto.id} aria-hidden={!previewPhoto||draft.coverFileId===previewPhoto.id||undefined} onClick={()=>{if(previewPhoto)setDraft({...draft,coverFileId:previewPhoto.id});}}>set cover</button><input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,image/webp,audio/*,video/mp4,video/webm" onChange={e=>{const file=e.target.files?.[0];if(file)void addFile(file);e.currentTarget.value='';}}/></div></div>
  {files.length>0&&(!previewPhoto||files.length>1)&&<div className="log-editor-files">{files.map(file=><div key={file.id} className="log-editor-file">{file.mime.startsWith('image/')?<img src={logImageUrl(file.url)} alt={file.name}/>:<span>{file.name}</span>}<div><button type="button" aria-label={`Remove ${file.name}`} onClick={()=>{setFiles(previous=>previous.filter(f=>f.id!==file.id));if(draft.coverFileId===file.id)setDraft({...draft,coverFileId:null});}}><X size={17}/></button>{file.mime.startsWith('image/')&&<button type="button" aria-pressed={draft.coverFileId===file.id} onClick={()=>setDraft({...draft,coverFileId:draft.coverFileId===file.id?null:file.id})}>Cover</button>}</div></div>)}</div>}
  {entry&&entry.contributors.filter(person=>person.userId!==user.id).some(person=>person.files.some(file=>file.mime.startsWith('image/')))&&<div className="log-cover-choices"><span className="quiet small">Other shared photos</span>{entry.contributors.filter(person=>person.userId!==user.id).flatMap(person=>person.files).filter(file=>file.mime.startsWith('image/')).map(file=><button type="button" key={file.id} aria-label={`Use ${file.name} as cover`} aria-pressed={draft.coverFileId===file.id} onClick={()=>setDraft({...draft,coverFileId:file.id})}><img src={logImageUrl(file.url)} alt={file.name}/></button>)}</div>}
  <input className="log-title-input" aria-label="Title" placeholder="title" maxLength={160} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/>
  <input aria-label="Place" placeholder="location" maxLength={160} value={draft.place} onChange={e=>setDraft({...draft,place:e.target.value})}/>
  <input aria-label="Entry date" type="date" required value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/>
  <div className="log-editor-people">{(base?.contributors||[{userId:user.id,name:user.name,handle:user.handle}]).map(person=><span key={person.userId}>{person.handle||person.name}</span>)}{selectedPeople.filter(person=>!base?.contributors.some(p=>p.userId===person.id)).map(person=><button type="button" key={person.id} onClick={()=>setSelectedPeople(previous=>previous.filter(p=>p.id!==person.id))}>{person.handle||person.name}<X size={14}/></button>)}<button type="button" aria-expanded={choosingPeople} onClick={()=>setChoosingPeople(value=>!value)}><Plus size={16}/>people</button></div>
  {choosingPeople&&<div className="log-contact-picker"><input aria-label="Find people to add" placeholder="find a friend" value={contactQuery} onChange={e=>setContactQuery(e.target.value)}/><div>{contacts.filter(person=>!base?.contributors.some(p=>p.userId===person.id)&&!selectedPeople.some(p=>p.id===person.id)&&`${person.name} ${person.handle||''}`.toLowerCase().includes(contactQuery.toLowerCase())).map(person=><button type="button" key={person.id} onClick={()=>{setSelectedPeople(previous=>[...previous,person]);setChoosingPeople(false);setContactQuery('');}}>{person.photoId&&<img src={`/api/files/${person.photoId}`} alt=""/>}<span>{person.name}{person.handle&&<small>@{person.handle}</small>}</span><Plus size={16}/></button>)}</div>{!contacts.length&&<p className="quiet small">People from past hangouts and your New Drugs friends appear here. For someone new, save the hangout and show its code.</p>}</div>}
  <label className="sr-only" htmlFor={`log-note-${entry?.id||'new'}`}>Your note</label><textarea id={`log-note-${entry?.id||'new'}`} aria-label="Your note" className="log-note-input" placeholder="your note" maxLength={10000} value={note} onChange={e=>setNote(e.target.value)}/>
  <div className="log-attachment-tools"><Recorder change={setRecording} disabled={uploading||files.length>=8} add={addFile} error={setError}/></div>
  <section className="log-links-editor" aria-label="Links"><div className="log-link-add"><LinkSimple size={20} aria-hidden="true"/><input aria-label="Link" type="text" inputMode="url" autoCapitalize="none" autoComplete="off" spellCheck={false} maxLength={2048} placeholder="Paste a link" value={link} onChange={e=>setLink(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(link.trim())addLink();}}}/><button type="button" className="solid" disabled={!link.trim()||draft.links.length>=8} onClick={addLink}>Add</button></div>{draft.links.map(url=><div className="log-link-card" key={url}><div className="log-link-card-actions"><a href={url} target="_blank" rel="noreferrer">{compactUrlLabel(url)}</a><button type="button" aria-label={`Remove ${compactUrlLabel(url)}`} onClick={()=>setDraft({...draft,links:draft.links.filter(value=>value!==url)})}><X size={18}/></button></div><LinkPreviews text="" links={[url]} draft/></div>)}</section>
  <div className="log-uncommon"><span className="quiet small">Uncommon</span><button type="button" aria-pressed={draft.recurrence==='anniversary'} onClick={()=>setDraft({...draft,recurrence:draft.recurrence==='anniversary'?'none':'anniversary'})}>{draft.recurrence==='anniversary'?'An anniversary start':'Set as anniversary start'}</button>{draft.recurrence==='birthday'&&<button type="button" aria-pressed="true" onClick={()=>setDraft({...draft,recurrence:'none'})}>Birthday reminder</button>}{base&&<button type="button" className="log-remove-self" onClick={()=>setRemoving(value=>!value)}>Remove me entirely</button>}</div>
  {removing&&base&&<DeleteConfirmation title="Remove you from this hangout?" detail="Your note and attached media are permanently deleted. Other people keep theirs." confirmLabel="Remove me entirely" busy={busy} onCancel={()=>setRemoving(false)} onConfirm={async()=>{if(busy)return;setBusy(true);setError('');try{if(removeIntent.current?.revision!==base.revision)removeIntent.current={revision:base.revision,key:crypto.randomUUID()};await operation('log.leave',{entryId:base.id,revision:base.revision},{confirmed:true,key:removeIntent.current.key});emit();if(onRemoved)onRemoved();else cancel();}catch(e){setError(errorText(e));}finally{setBusy(false);}}}/>}
  {error&&<p className="error" role="alert">{error}</p>}
  {conflict&&base&&<section className="log-conflict"><strong>This entry changed elsewhere.</strong><p>Your draft is still here. Keeping your changes also picks up fields you haven’t edited.</p><details open><summary>Latest version</summary><p>{conflict.title||'Untitled'} · {conflict.date}{conflict.place?` · ${conflict.place}`:''}</p><p className="small">{conflict.contributors.map(person=>person.name).join(', ')}</p><AgentMarkdown text={conflict.contributors.find(person=>person.userId===user.id)?.note||'No note'}/>{conflict.links.map(url=><p key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></p>)}</details><div className="panel-actions"><button type="button" onClick={()=>{const own=conflict.contributors.find(person=>person.userId===user.id);setDraft(fields(conflict));setNote(own?.note||'');setFiles(own?.files||[]);setBase(conflict);saveProgress.current=null;setConflict(null);setError('');}}>Discard my draft</button><button type="button" className="solid" onClick={()=>{const merged=rebaseLogDraft(base,conflict,user.id,draft,note,files);setDraft(merged.entry);setNote(merged.note);setFiles(merged.files);setBase(conflict);saveProgress.current=null;setConflict(null);setError('');}}>Keep my changes</button></div></section>}
  {selectedPeople.some(person=>!base?.contributors.some(p=>p.userId===person.id))&&<p className="quiet small">Saving adds the selected people to this shared hangout.</p>}
  </fieldset>
  <div className="panel-actions log-editor-footer"><button type="button" onClick={cancel} disabled={busy}>Cancel</button><button className="solid" disabled={busy||uploading||recording||Boolean(conflict)}>{busy?'Saving…':'Save entry'}</button></div>
 </form>;
}

export function LogDetail({entryId,user,navigate,onSaved,onCancel,onClose,onAdjacent,closeLabel='Close'}:{entryId:string;closeLabel?:string;onAdjacent?(entryId:string):void;user:Profile;navigate:Navigate;onSaved?(entry:LogEntry):void;onCancel?():void;onClose?():void}){
 const [entry,setEntry]=useState<LogEntry|null>(()=>cachedLogEntry(user.id,entryId)),[error,setError]=useState(''),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[neighbors,setNeighbors]=useState<{previous:LogEntry|null;next:LogEntry|null}>({previous:null,next:null});
 const swipe=useRef<{x:number;y:number;time:number}|null>(null);
 const visible=usePanelVisible(),intent=useRef<{signature:string;key:string}|null>(null);
 const load=async()=>{try{const saved=await operation<LogEntry>('log.get',{entryId});cacheLogEntry(user.id,saved);setEntry(saved);setError('');}catch(e){clearLogEntries(user.id);setError(errorText(e));setEntry(null);}};
 const preload=async()=>{try{const adjacent=await operation<{previous:LogEntry|null;next:LogEntry|null}>('log.neighbors',{entryId});for(const item of [adjacent.previous,adjacent.next])if(item){cacheLogEntry(user.id,item);preloadLogPhotos(item);}setNeighbors(adjacent);}catch{setNeighbors({previous:null,next:null});}};
 useEffect(()=>{if(visible){void load();void preload();}},[entryId,visible]);useRecordRefresh(['log','people'],()=>{clearLogEntries(user.id);if(visible){if(!editing)void load();void preload();}});
 const act=async(name:string,input:Record<string,unknown>={},confirmed=false)=>{if(!entry||busy)return;setBusy(true);setError('');try{const data={entryId:entry.id,...(name==='log.join'?{}:{revision:entry.revision}),...input},signature=JSON.stringify([name,data]);if(intent.current?.signature!==signature)intent.current={signature,key:crypto.randomUUID()};const result=await operation<LogEntry>(name,data,{confirmed,key:intent.current.key});intent.current=null;emit();if(['log.leave','log.delete'].includes(name)||name==='log.respond'&&!input.accept){onCancel?.();navigate({view:'log'});}else setEntry(result);}catch(e){setError(errorText(e));}finally{setBusy(false);}};

 usePanelLoading(!entry&&!error);
 if(!entry)return <section className="log-task"><div className="log-task-content">{error?<p className="error" role="alert">{error}</p>:null}</div><footer className="panel-actions log-task-footer"><button onClick={()=>{if(onClose)onClose();else navigate({view:'log'});}}>{closeLabel}</button></footer></section>;
 const visitAdjacent=(entry:LogEntry)=>onAdjacent?onAdjacent(entry.id):navigate({view:'log',resourceId:entry.id});
 if(editing)return <LogEditor user={user} entry={entry} onRemoved={()=>{onCancel?.();if(onClose)onClose();else navigate({view:'log'});}} onSaved={saved=>{cacheLogEntry(user.id,saved);setEntry(saved);setEditing(false);onSaved?.(saved);}} cancel={()=>{setEditing(false);onCancel?.();void load();}}/>;

 return <article className="log-detail" onPointerDown={event=>{if(event.pointerType!=='touch'||(event.target as HTMLElement).closest('button,a,input,textarea,video,audio,.log-photo-strip,.audio-player'))return;swipe.current={x:event.clientX,y:event.clientY,time:Date.now()};}} onPointerCancel={()=>{swipe.current=null;}} onPointerUp={event=>{const start=swipe.current;swipe.current=null;if(!start||Date.now()-start.time>700)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.abs(dx)<70||Math.abs(dx)<Math.abs(dy)*2)return;const adjacent=dx<0?neighbors.next:neighbors.previous;if(adjacent)visitAdjacent(adjacent);}}>
  <div className="log-detail-body"><h2>{entry.title||'(untitled)'}</h2>
  <div className="log-photo-strip"><PostPhotos log photos={entry.contributors.flatMap(person=>person.files).filter(file=>file.mime.startsWith('image/')).sort((a,b)=>Number(b.id===entry.coverFileId)-Number(a.id===entry.coverFileId))}/></div>
  <div className="log-entry-facts"><p>{entry.date>today()?'plan for':'hung out'} {dateLabel(entry.date)}</p>{entry.place&&<p>at {entry.place}</p>}<p className="log-with">with {entry.contributors.map((person,index)=><span key={person.userId}>{index>0?', ':''}<button disabled={person.profileVisible===false} onClick={()=>navigate({view:'person',resourceId:person.userId})}>{person.handle||person.name}</button></span>)}{entry.historicalPeople?.length?<span>, {entry.historicalPeople.join(', ')}</span>:null}</p></div>
  {entry.recurrence!=='none'&&<span className="log-recurrence-label">{entry.recurrence==='birthday'?'Birthday':'Anniversary'}</span>}
  {entry.membership==='invited'?<div className="log-invite-review"><p>You’re invited to share this entry. Join to add your own note and media.</p><div className="panel-actions"><button disabled={busy} onClick={()=>void act('log.respond',{accept:false})}>Decline</button><button className="solid" disabled={busy} onClick={()=>void act('log.join',{},true)}>Join entry</button></div></div>:null}

  {error&&<p className="error" role="alert">{error}</p>}
  <div className="log-contributions">{entry.membership==='member'&&!entry.title.trim()&&!entry.place.trim()&&!entry.links.length&&entry.recurrence==='none'&&entry.contributors.length===1&&entry.contributors.some(person=>person.userId===user.id&&!person.note.trim()&&!person.files.length)&&<section className="log-contribution log-empty-contribution"><button className="log-author" onClick={()=>navigate({view:'person',resourceId:user.id})}>{user.handle||user.name}</button><button className="log-add-note" onClick={()=>setEditing(true)}>tap to add log</button></section>}{entry.contributors.filter(person=>person.note.trim()||person.files.some(file=>!file.mime.startsWith('image/'))).map(person=><section key={person.userId} className="log-contribution"><button className="log-author" disabled={person.profileVisible===false} onClick={()=>navigate({view:'person',resourceId:person.userId})}>{person.handle||person.name}</button>{person.note.trim()&&<div className="log-note-content"><AgentMarkdown text={person.note}/></div>}{person.files.some(file=>!file.mime.startsWith('image/'))&&<LogMedia files={person.files.filter(file=>!file.mime.startsWith('image/'))}/>}</section>)}</div>
  <div className="log-entry-links">{entry.links.map(url=><LinkPreviews key={url} text="" links={[url]}/>)}</div>
  </div><footer className="log-detail-footer">


   <div className="log-adjacent"><button aria-label="Previous entry" disabled={!neighbors.previous} onClick={()=>neighbors.previous&&visitAdjacent(neighbors.previous)}><CaretLeft size={18}/><span>Older</span></button><button aria-label="Next entry" disabled={!neighbors.next} onClick={()=>neighbors.next&&visitAdjacent(neighbors.next)}><span>Newer</span><CaretRight size={18}/></button></div>
   <div className="panel-actions log-entry-actions">{entry.membership==='member'&&<button onClick={()=>navigate({view:'log_code',resourceId:entry.id})}>Code</button>}<button onClick={()=>onClose?onClose():navigate({view:'log'})}>{closeLabel}</button>{entry.membership==='member'&&<button onClick={()=>setEditing(true)}>Edit</button>}</div>
  </footer>
 </article>;
}

export function LogPanel({user,navigate,initialQuery='',logMonth,logScope,personId:initialPerson,onStateChange}:{user:Profile;navigate:Navigate;initialQuery?:string;logMonth?:string;logScope?:Destination['logScope'];personId?:string;onStateChange?(context:Partial<Destination>):void}){
 const [optionsOpen,setOptionsOpen]=useState(false);
 const [todayEntries,setTodayEntries]=useState<LogEntry[]>([]),[preferences,setPreferences]=useState<LogPreferences>(emptyPreferences),[scope,setScope]=useState<'all'|'private'|'shared'|'invitations'>(logScope||'all'),[applied,setApplied]=useState(initialQuery),[personId,setPersonId]=useState<string|undefined>(initialPerson),[items,setItems]=useState<LogEntry[]>([]),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const prefsQueue=useRef<Promise<unknown>>(Promise.resolve()),prefsGeneration=useRef(0);
 const sequence=useRef(0),listPending=useRef(false),listEdge=useRef<HTMLDivElement>(null),visible=usePanelVisible();
 useEffect(()=>{setApplied(initialQuery||'');},[initialQuery]);
 useEffect(()=>setScope(logScope||'all'),[logScope]);
 useEffect(()=>setPersonId(initialPerson),[initialPerson]);
 const stateChange=(next:Partial<Destination>)=>onStateChange?.({query:applied||undefined,logScope:scope,personId,logMonth,...next});
 const calendar=preferences.arrangement==='calendar'&&scope!=='invitations';
 const load=async(append=false)=>{if(calendar||append&&(listPending.current||!cursor))return;const ticket=++sequence.current;listPending.current=true;setBusy(true);setError('');try{
  const input={scope,...(applied?{query:applied}:{}),...(personId?{personId}:{}),limit:30,...(append&&cursor?{before:cursor}:{})};
  const page=await operation<LogPage>('log.list',input);
  if(!append)while(page.nextCursor&&page.items.length<items.length){const more=await operation<LogPage>('log.list',{...input,before:page.nextCursor});if(ticket!==sequence.current)return;page.items.push(...more.items);page.nextCursor=more.nextCursor;}
  if(ticket!==sequence.current)return;setItems(previous=>append?[...previous,...page.items]:page.items);setCursor(page.nextCursor);

 }catch(e){if(ticket===sequence.current)setError(errorText(e));}finally{if(ticket===sequence.current){listPending.current=false;setBusy(false);}}};
 useEffect(()=>{void operation<LogPreferences>('log.preferences').then(setPreferences).catch(e=>setError(errorText(e)));},[]);
 useEffect(()=>{void load();return()=>{sequence.current++;};},[scope,applied,personId,preferences.arrangement]);
 const loadToday=async()=>{try{const entries:LogEntry[]=[];let before:string|undefined;do{const page=await operation<LogPage>('log.list',{from:new Date().getHours()<8?Temporal.Now.plainDateISO().subtract({days:1}).toString():today(),through:today(),scope:'all',limit:30,...(before?{before}:{})});entries.push(...page.items);before=page.nextCursor||undefined;}while(before);setTodayEntries(entries.reverse());}catch{/* Calendar errors are shown in their own view. */}};
 useEffect(()=>{void loadToday();},[]);
 useRecordRefresh(['log'],()=>{void loadToday();void load();});
 useEffect(()=>{const target=listEdge.current,scroller=target?.closest<HTMLElement>('.composer-view');if(calendar||!visible||busy||error||!cursor||!target||!scroller||typeof IntersectionObserver==='undefined')return;const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))void load(true);},{root:scroller,rootMargin:'0px 0px 150px 0px'});observer.observe(target);return()=>observer.disconnect();},[calendar,visible,busy,error,cursor]);
 useRecordRefresh(['log_preferences'],()=>{void operation<LogPreferences>('log.preferences').then(setPreferences).catch(()=>{});});
 const prefs=async(value:LogPreferences)=>{const generation=++prefsGeneration.current;setPreferences(value);const next=prefsQueue.current.then(()=>operation<LogPreferences>('log.preferences_update',value));prefsQueue.current=next.catch(()=>{});try{const saved=await next;if(generation===prefsGeneration.current)setPreferences(saved);}catch(e){if(generation===prefsGeneration.current)setError(errorText(e));}};

 return <div className="log-browser">

  {error&&<p className="error" role="alert">{error}</p>}
  {calendar?<LogCalendar key={JSON.stringify([logMonth,scope,applied,personId])} month={logMonth} scope={scope as 'all'|'private'|'shared'} query={applied} personId={personId} jump={value=>stateChange({logMonth:value})} create={date=>navigate({view:'log_compose',date})} open={entry=>navigate({view:'log',resourceId:entry.id})} openPerson={personId=>navigate({view:'person',resourceId:personId})}/>:preferences.arrangement==='gallery'&&scope!=='invitations'?<div className="log-gallery">{items.map((entry,index)=><div key={entry.id}><LogTile entry={entry} open={()=>navigate({view:'log',resourceId:entry.id})}/>{(!index||items[index-1].date!==entry.date)&&<time>{Number(entry.date.slice(8))}{!index||items[index-1].date.slice(0,7)!==entry.date.slice(0,7)?` - ${new Date(`${entry.date}T12:00:00`).toLocaleDateString(undefined,{month:'short'})}`:''}</time>}</div>)}</div>:<LogList entries={items} open={entry=>navigate({view:'log',resourceId:entry.id})}/>}

  {busy&&!calendar&&<div className="log-loading" role="status" aria-label="Loading entries"><CircleNotch className="spin" size={22}/></div>}
  {!busy&&!items.length&&!calendar&&<div className="log-empty"><p>{scope==='invitations'?'No pending invitations.':applied?'No entries match this view.':'No entries yet.'}</p></div>}
  {!calendar&&<div ref={listEdge}>{cursor&&<button className="more-messages" disabled={busy} onClick={()=>void load(true)}>More entries</button>}</div>}
  <LogFloaters><div className="log-home-footer">{todayEntries.length>0&&<LogTodayCards entries={todayEntries} presentation={preferences.todayPresentation||'full'} change={todayPresentation=>void prefs({...preferences,todayPresentation})} open={entry=>navigate({view:'log',resourceId:entry.id})}/>}<div className="log-options log-quick-settings" hidden={!optionsOpen}><div className="view-tabs" aria-label="Log view">{([{value:'calendar',label:'Calendar',Icon:CalendarDots},{value:'gallery',label:'Grid',Icon:SquaresFour},{value:'list',label:'List',Icon:List}] as const).map(({value,label,Icon})=><button key={value} type="button" aria-pressed={preferences.arrangement===value} onClick={()=>{void prefs({...preferences,arrangement:value});}}><Icon size={18}/>{label}</button>)}</div><button className="log-more-settings" onClick={()=>{setOptionsOpen(false);navigate({view:'log_settings'});}}>More settings</button></div><div className="log-home-actions"><button className="log-scan-button" onClick={()=>navigate({view:'log_scan'})}>scan</button><button className="log-outline-button" onClick={()=>navigate({view:'log_compose'})}>log new event</button><button className="log-options-toggle" aria-label="Log view options" aria-expanded={optionsOpen} onClick={()=>setOptionsOpen(value=>!value)}><DotsThree size={22}/></button></div></div></LogFloaters>

 </div>;
}
