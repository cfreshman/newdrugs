import {useLogContacts} from './useLogContacts';
import {LogMedia} from './LogMedia';
import {useOpenLogList} from './logSequence';
import {useLogNeighbors} from './useLogNeighbors';
import {logImageUrl} from './logImageCache';
import {logDateLabel as dateLabel} from './logDate';
import {LogList} from './LogList';
import {LogTodayCards} from './LogTodayCards';
import {addedLogLinks} from '../shared/logLinks';
import {compactUrlLabel} from '../shared/links';
import {cachedLogEntry,cacheLogEntry,readCachedLogEntry,forgetLogEntry,primeLogEntry} from './logEntryCache';
import {LogFloaters} from './LogChrome';
import {isEditableLogTarget} from './LogModal';
import type {LogContact} from '../shared/logJoining';
import {logCover as cover} from './logCalendarModel';
import {LogCalendar} from './LogCalendar';
import {useEffect,useLayoutEffect,useRef,useState,useMemo,type FormEvent} from 'react';
import {CalendarDots,SquaresFour,List,Plus,LinkSimple,CaretLeft,CaretRight,LockSimple,Users,Image,Microphone,DownloadSimple,DotsThree,X,CircleNotch} from '@phosphor-icons/react';
import {Temporal} from '@js-temporal/polyfill';
import {logFields,logPlainText,rebaseLogDraft,type LogEntry,type LogCalendarTile,type LogFields,type LogPreferences,type LogPage} from '../shared/log';
import type {Profile} from '../shared/types';
import type {Destination,LogSequence} from '../shared/navigation';
import {operation,errorText,ApiError} from './api';
import {uploadFile} from './uploads';
import type {UploadRef} from '../shared/uploads';
import {useRecordRefresh,useRecordRefreshDetails} from './useRecordRefresh';
import {PanelVisibilityContext,usePanelLoading,usePanelVisible} from './PanelReadiness';
import {AgentMarkdown} from './AgentMarkdown';
import {PostPhotos} from './PostPhotos';
import {LinkPreviews} from './LinkPreview';
import {AudioPlayer} from './AudioPlayer';
import {LogPhotoEditor} from './LogPhotoEditor';
import {LogVoiceRecorder} from './LogVoiceRecorder';
import {DeleteConfirmation} from './DeleteConfirmation';
import {NavLink} from './NavLink';
import './log.css';

type Navigate=(destination:Destination)=>void;
const today=()=>Temporal.Now.plainDateISO().toString();

const fields=(entry:LogEntry):LogFields=>({date:entry.date,title:entry.title,place:entry.place,links:entry.links,recurrence:entry.recurrence,coverFileId:entry.coverFileId});
const emit=()=>{window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:['log','storage']}));};
const emptyPreferences:LogPreferences={arrangement:'calendar',views:[],todayPresentation:'full'};

function LogTile({entry,open,compact=false,anniversary=false}:{entry:LogEntry|LogCalendarTile;open():void;compact?:boolean;anniversary?:boolean}){
 const photo=cover(entry),contributors='contributors' in entry?entry.contributors:[],place='place' in entry?entry.place:'';
 return <NavLink className={`log-tile ${compact?'log-tile-compact':''}`} to={{view:'log',resourceId:entry.id}} navigate={()=>{if("contributors" in entry)primeLogEntry(entry);open();}} title={entry.title||contributors[0]?.note||'Open entry'}>
  {photo?<img src={logImageUrl(photo.url)} alt="" loading="lazy"/>:<div className="log-tile-note">{contributors.map(person=>person.note).filter(Boolean).join(' · ')||entry.title||place||'(untitled)'}</div>}
  <span className="log-tile-caption">{anniversary?'↻ ':''}{entry.title||place||'Untitled'}</span>
  {contributors.length>1&&<span className="log-tile-shared"><Users size={12}/>{contributors.length}</span>}
 </NavLink>;
}

export function LogEditor({user,entry,date,onSaved,cancel,onRemoved}:{user:Profile;entry?:LogEntry;date?:string;onSaved(entry:LogEntry):void;cancel():void;onRemoved?():void}){
 const visible=usePanelVisible();
 const [photo,setPhoto]=useState<File|null>(null),editorBody=useRef<HTMLFieldSetElement>(null),editorScroll=useRef(0);
 useLayoutEffect(()=>{if(!photo&&editorBody.current)editorBody.current.scrollTop=editorScroll.current;},[photo]);
 const [previewLoaded,setPreviewLoaded]=useState<string|null>(null);
 const [removing,setRemoving]=useState(false),removeIntent=useRef<{revision:number;key:string}|null>(null);
 const [base,setBase]=useState(entry),[conflict,setConflict]=useState<LogEntry|null>(null);
 const own=entry?.contributors.find(p=>p.userId===user.id);
 const [draft,setDraft]=useState<LogFields>(entry?fields(entry):logFields.parse({date:date||today()})),[note,setNote]=useState(own?.note||''),[files,setFiles]=useState<LogEntry['contributors'][number]['files']>(own?.files||[]),[link,setLink]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[uploadingVisual,setUploadingVisual]=useState(false),[recording,setRecording]=useState(false);
 const [selectedPeople,setSelectedPeople]=useState<LogContact[]>([]),[choosingPeople,setChoosingPeople]=useState(false),[contactQuery,setContactQuery]=useState('');
 const saveProgress=useRef<{signature:string;entry:LogEntry}|null>(null),addIntents=useRef(new Map<string,string>());
 const contactPage=useLogContacts(contactQuery,visible),contacts=contactPage.items;
 const fileInput=useRef<HTMLInputElement>(null),intent=useRef<{signature:string;key:string}|null>(null),staged=useRef<string[]>([]),committed=useRef(false),editorAlive=useRef(true);
 useEffect(()=>{editorAlive.current=true;return()=>{editorAlive.current=false;if(!committed.current)for(const fileId of staged.current)void operation('files.discard',{fileId}).catch(()=>{});};},[]);
 const addFile=async(file:File)=>{setUploading(true);setUploadingVisual(!file.type.startsWith('audio/'));setError('');try{if(files.length>=8)throw Error('An entry can hold eight attachments per person.');const saved=await uploadFile(file,'log_media');if(!editorAlive.current){await operation('files.discard',{fileId:saved.id}).catch(()=>{});return;}staged.current.push(saved.id);setFiles(previous=>[...previous,saved as Required<UploadRef>].slice(0,8));}catch(e){if(editorAlive.current)setError(errorText(e));}finally{if(editorAlive.current){setUploading(false);setUploadingVisual(false);}}};
 const save=async(event:FormEvent)=>{event.preventDefault();if(busy||uploading||recording||photo)return;setBusy(true);setError('');try{
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
  if(!entry){setBase(undefined);saveProgress.current=null;intent.current=null;addIntents.current.clear();setDraft(logFields.parse({date:date||today()}));setNote('');setFiles([]);setSelectedPeople([]);setLink('');staged.current=[];committed.current=false;}
  onSaved(saved);
 }catch(e){setError(errorText(e));if((base||saveProgress.current?.entry)&&e instanceof ApiError&&e.code==='log_changed'){try{setConflict(await operation<LogEntry>('log.get',{entryId:(base||saveProgress.current!.entry).id}));}catch(latestError){setError(errorText(latestError));}}}finally{setBusy(false);}};
 const addLink=()=>{try{setDraft({...draft,links:addedLogLinks(draft.links,link)});setLink('');setError('');}catch(e){setError(errorText(e));}};
 const visualFiles=files.filter(file=>!file.mime.startsWith('audio/')),voiceFiles=files.filter(file=>file.mime.startsWith('audio/'));
 const previewPhoto=files.find(file=>file.id===draft.coverFileId&&file.mime.startsWith('image/'))||files.find(file=>file.mime.startsWith('image/'));
 return <><PanelVisibilityContext.Provider value={visible&&!photo}><form className="log-editor fields" hidden={Boolean(photo)} inert={Boolean(photo)} onSubmit={save}><fieldset ref={editorBody} className="log-editor-body" disabled={busy}>
  <div className="log-editor-media"><div className="log-editor-preview" onLoadCapture={event=>{if(event.target instanceof HTMLImageElement)setPreviewLoaded(previewPhoto?.url||null);}} onErrorCapture={event=>{if(event.target instanceof HTMLImageElement)setPreviewLoaded(previewPhoto?.url||null);}}>{previewPhoto?<PostPhotos log photos={[previewPhoto]}/>:<button type="button" onClick={()=>fileInput.current?.click()}>image</button>}{(uploadingVisual||previewPhoto&&previewLoaded!==previewPhoto.url)&&<span className="log-media-loading" role="status" aria-label={uploadingVisual?'Uploading media':'Loading image'}><CircleNotch className="spin" size={26}/></span>}</div><div className="log-editor-media-actions"><button type="button" disabled={uploading||files.length>=8} onClick={()=>fileInput.current?.click()}>upload</button><button type="button" className={!previewPhoto?'log-media-action-hidden':undefined} disabled={!previewPhoto} aria-hidden={!previewPhoto||undefined} onClick={()=>{if(!previewPhoto)return;setFiles(previous=>previous.filter(file=>file.id!==previewPhoto.id));if(draft.coverFileId===previewPhoto.id)setDraft({...draft,coverFileId:null});}}>remove</button><button type="button" className={!previewPhoto||draft.coverFileId===previewPhoto.id?'log-media-action-hidden':undefined} disabled={!previewPhoto||draft.coverFileId===previewPhoto.id} aria-hidden={!previewPhoto||draft.coverFileId===previewPhoto.id||undefined} onClick={()=>{if(previewPhoto)setDraft({...draft,coverFileId:previewPhoto.id});}}>set cover</button><input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,image/webp,audio/*,video/mp4,video/webm" onChange={e=>{const file=e.target.files?.[0];if(file){if(file.type.startsWith('image/')){editorScroll.current=editorBody.current?.scrollTop||0;setPhoto(file);}else void addFile(file);}e.currentTarget.value='';}}/></div></div>
  {visualFiles.length>0&&(!previewPhoto||visualFiles.length>1)&&<div className="log-editor-files">{visualFiles.map(file=><div key={file.id} className="log-editor-file">{file.mime.startsWith('image/')?<img src={logImageUrl(file.url)} alt={file.name}/>:<span>{file.name}</span>}<div><button type="button" aria-label={`Remove ${file.name}`} onClick={()=>{setFiles(previous=>previous.filter(f=>f.id!==file.id));if(draft.coverFileId===file.id)setDraft({...draft,coverFileId:null});}}><X size={17}/></button>{file.mime.startsWith('image/')&&<button type="button" aria-pressed={draft.coverFileId===file.id} onClick={()=>setDraft({...draft,coverFileId:draft.coverFileId===file.id?null:file.id})}>Cover</button>}</div></div>)}</div>}
  <input className="log-title-input" aria-label="Title" placeholder="title" maxLength={160} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/>
  <input aria-label="Place" placeholder="location" maxLength={160} value={draft.place} onChange={e=>setDraft({...draft,place:e.target.value})}/>
  <label className="log-date-field"><input aria-label="Entry date" type="date" required value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/></label>
  <div className="log-editor-people">{(base?.contributors||[{userId:user.id,name:user.name,handle:user.handle}]).map(person=><span key={person.userId}>{person.handle||person.name}</span>)}{selectedPeople.filter(person=>!base?.contributors.some(p=>p.userId===person.id)).map(person=><button type="button" key={person.id} onClick={()=>setSelectedPeople(previous=>previous.filter(p=>p.id!==person.id))}>{person.handle||person.name}<X size={14}/></button>)}<button type="button" aria-expanded={choosingPeople} onClick={()=>setChoosingPeople(value=>!value)}><Plus size={16}/>people</button></div>
  {choosingPeople&&<div className="log-contact-picker"><input aria-label="Find people to add" placeholder="find a friend" value={contactQuery} onChange={e=>setContactQuery(e.target.value)}/><div>{contacts.filter(person=>!base?.contributors.some(p=>p.userId===person.id)&&!selectedPeople.some(p=>p.id===person.id)&&`${person.name} ${person.handle||''}`.toLowerCase().includes(contactQuery.toLowerCase())).map(person=><button type="button" key={person.id} onClick={()=>{setSelectedPeople(previous=>[...previous,person]);setChoosingPeople(false);setContactQuery('');}}>{person.photoId&&<img src={`/api/files/${person.photoId}`} alt=""/>}<span>{person.name}{person.handle&&<small>@{person.handle}</small>}</span><Plus size={16}/></button>)}</div>{contactPage.nextCursor&&<button type="button" disabled={contactPage.busy} onClick={()=>void contactPage.more()}>More people</button>}{contactPage.error&&<p className="error">{contactPage.error}</p>}{!contacts.length&&!contactPage.busy&&!contactPage.indexing&&!contactPage.nextCursor&&<p className="quiet small">People from past hangouts and your New Drugs friends appear here. For someone new, save the hangout and show its code.</p>}</div>}
  <label className="sr-only" htmlFor={`log-note-${entry?.id||'new'}`}>Your note</label><textarea id={`log-note-${entry?.id||'new'}`} aria-label="Your note" className="log-note-input" placeholder="your note" maxLength={10000} value={note} onChange={e=>setNote(e.target.value)}/>
  <section className="log-voice-notes" aria-label="Voice note">{voiceFiles.map(file=><div className="log-voice-row" key={file.id}><AudioPlayer src={file.url} active={visible} voiceNote editor/><button type="button" aria-label={`Remove voice note ${file.name}`} onClick={()=>setFiles(previous=>previous.filter(item=>item.id!==file.id))}>Remove</button></div>)}{!voiceFiles.length&&<LogVoiceRecorder change={setRecording} disabled={uploading||files.length>=8} add={addFile} error={setError}/>}</section>
  <section className="log-links-editor" aria-label="Links"><div className="log-link-add"><LinkSimple size={20} aria-hidden="true"/><input aria-label="Link" type="text" inputMode="url" autoCapitalize="none" autoComplete="off" spellCheck={false} maxLength={2048} placeholder="Paste a link" value={link} onChange={e=>setLink(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(link.trim())addLink();}}}/><button type="button" className="solid" disabled={!link.trim()||draft.links.length>=8} onClick={addLink}>Add</button></div>{draft.links.map(url=><div className="log-link-card" key={url}><div className="log-link-card-actions"><a href={url} target="_blank" rel="noreferrer">{compactUrlLabel(url)}</a><button type="button" aria-label={`Remove ${compactUrlLabel(url)}`} onClick={()=>setDraft({...draft,links:draft.links.filter(value=>value!==url)})}><X size={18}/></button></div><LinkPreviews text="" links={[url]} draft/></div>)}</section>
  <div className="log-uncommon"><span className="quiet small">Uncommon</span><button type="button" aria-pressed={draft.recurrence==='anniversary'} onClick={()=>setDraft({...draft,recurrence:draft.recurrence==='anniversary'?'none':'anniversary'})}>{draft.recurrence==='anniversary'?'An anniversary start':'Set as anniversary start'}</button>{draft.recurrence==='birthday'&&<button type="button" aria-pressed="true" onClick={()=>setDraft({...draft,recurrence:'none'})}>Birthday reminder</button>}{base&&<button type="button" className="log-remove-self" onClick={()=>setRemoving(value=>!value)}>Remove me entirely</button>}</div>
  {removing&&base&&<DeleteConfirmation title="Remove you from this hangout?" detail="Your note and attached media are permanently deleted. Other people keep theirs." confirmLabel="Remove me entirely" busy={busy} onCancel={()=>setRemoving(false)} onConfirm={async()=>{if(busy)return;setBusy(true);setError('');try{if(removeIntent.current?.revision!==base.revision)removeIntent.current={revision:base.revision,key:crypto.randomUUID()};await operation('log.leave',{entryId:base.id,revision:base.revision},{confirmed:true,key:removeIntent.current.key});emit();if(onRemoved)onRemoved();else cancel();}catch(e){setError(errorText(e));}finally{setBusy(false);}}}/>}
  {error&&<p className="error" role="alert">{error}</p>}
  {conflict&&base&&<section className="log-conflict"><strong>This entry changed elsewhere.</strong><p>Your draft is still here. Keeping your changes also picks up fields you haven’t edited.</p><details open><summary>Latest version</summary><p>{conflict.title||'Untitled'} · {conflict.date}{conflict.place?` · ${conflict.place}`:''}</p><p className="small">{conflict.contributors.map(person=>person.name).join(', ')}</p><AgentMarkdown text={conflict.contributors.find(person=>person.userId===user.id)?.note||'No note'}/>{conflict.links.map(url=><p key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></p>)}</details><div className="panel-actions"><button type="button" onClick={()=>{const own=conflict.contributors.find(person=>person.userId===user.id);setDraft(fields(conflict));setNote(own?.note||'');setFiles(own?.files||[]);setBase(conflict);saveProgress.current=null;setConflict(null);setError('');}}>Discard my draft</button><button type="button" className="solid" onClick={()=>{const merged=rebaseLogDraft(base,conflict,user.id,draft,note,files);setDraft(merged.entry);setNote(merged.note);setFiles(merged.files);setBase(conflict);saveProgress.current=null;setConflict(null);setError('');}}>Keep my changes</button></div></section>}
  {selectedPeople.some(person=>!base?.contributors.some(p=>p.userId===person.id))&&<p className="quiet small">Saving adds the selected people to this shared hangout.</p>}
  </fieldset>
  <div className="panel-actions log-editor-footer"><button type="button" onClick={cancel} disabled={busy}>Cancel</button><button className="solid" disabled={busy||uploading||recording||Boolean(conflict)}>{busy?'One sec...':'Save entry'}</button></div>
 </form></PanelVisibilityContext.Provider>{photo&&<LogPhotoEditor file={photo} cancel={()=>setPhoto(null)} save={file=>{setPhoto(null);void addFile(file);}}/>}</>;
}

export function LogDetail({entryId,user,navigate,onSaved,onCancel,onClose,onAdjacent,logSequence,closeLabel='Close'}:{entryId:string;closeLabel?:string;logSequence?:LogSequence;onAdjacent?(entryId:string,sequence?:LogSequence):void;user:Profile;navigate:Navigate;onSaved?(entry:LogEntry):void;onCancel?():void;onClose?():void}){
 const [entry,setEntry]=useState<LogEntry|null>(()=>cachedLogEntry(user.id,entryId)),[error,setError]=useState(''),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false);
 const swipe=useRef<{x:number;y:number;time:number}|null>(null),request=useRef(0),settled=useRef(0);
 const [fresh,setFresh]=useState(false);
 const visible=usePanelVisible(),intent=useRef<{signature:string;key:string}|null>(null);
 const load=async()=>{const ticket=++request.current;setFresh(false);try{const saved=await operation<LogEntry>('log.get',{entryId});if(ticket!==request.current)return;cacheLogEntry(user.id,saved);setEntry(saved);setFresh(true);setError('');}catch(e){if(ticket!==request.current)return;setError(errorText(e));if(e instanceof ApiError&&[401,403,404,410].includes(e.status)){forgetLogEntry(user.id,entryId);setEntry(null);}}finally{if(ticket===request.current)settled.current=ticket;}};
 const adjacent=useLogNeighbors({entryId,userId:user.id,visible,context:logSequence}),neighbors=adjacent.neighbors;
 const closeDetail=()=>{if(onClose)onClose();else navigate({view:'log'});};
 useLayoutEffect(()=>{if(visible){setFresh(false);setEntry(previous=>previous?.id===entryId?cachedLogEntry(user.id,entryId)||previous:cachedLogEntry(user.id,entryId));setError('');}},[user.id,entryId,visible]);
 useEffect(()=>{if(!visible)return;void load();const ticket=request.current;void readCachedLogEntry(user.id,entryId).then(saved=>{if(saved&&request.current===ticket&&settled.current!==ticket)setEntry(previous=>previous||saved);});return()=>{request.current++;};},[user.id,entryId,visible]);
 useRecordRefresh(['log','people'],()=>{if(visible&&!editing)void load();});
 const act=async(name:string,input:Record<string,unknown>={},confirmed=false)=>{if(!entry||busy)return;setBusy(true);setError('');try{const data={entryId:entry.id,...(name==='log.join'?{}:{revision:entry.revision}),...input},signature=JSON.stringify([name,data]);if(intent.current?.signature!==signature)intent.current={signature,key:crypto.randomUUID()};const result=await operation<LogEntry>(name,data,{confirmed,key:intent.current.key});intent.current=null;emit();if(['log.leave','log.delete'].includes(name)||name==='log.respond'&&!input.accept){onCancel?.();navigate({view:'log'});}else {request.current++;cacheLogEntry(user.id,result);setEntry(result);setFresh(true);}}catch(e){setError(errorText(e));}finally{setBusy(false);}};

 usePanelLoading(!entry&&!error);
 if(!entry)return <section className="log-task"><div className="log-task-content">{error?<p className="error" role="alert">{error}</p>:null}</div><footer className="panel-actions log-task-footer"><button onClick={closeDetail}>{closeLabel}</button></footer></section>;
 const visitAdjacent=(entry:LogEntry)=>{cacheLogEntry(user.id,entry);if(onAdjacent)onAdjacent(entry.id,adjacent.sequence());else navigate({view:'log',resourceId:entry.id,logSequence:adjacent.sequence()});};
 if(editing)return <LogEditor user={user} entry={entry} onRemoved={()=>{onCancel?.();if(onClose)onClose();else navigate({view:'log'});}} onSaved={saved=>{request.current++;cacheLogEntry(user.id,saved);setEntry(saved);setFresh(true);setEditing(false);onSaved?.(saved);}} cancel={()=>{setEditing(false);onCancel?.();void load();}}/>;

 return <article className="log-detail" onKeyDown={event=>{if(event.defaultPrevented||event.metaKey||event.ctrlKey||event.altKey||isEditableLogTarget(event.target))return;const target=event.key==='ArrowLeft'?neighbors.previous:event.key==='ArrowRight'?neighbors.next:null;if(target){event.preventDefault();event.stopPropagation();visitAdjacent(target);}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeDetail();}}} onPointerDown={event=>{if(event.pointerType!=='touch'||(event.target as HTMLElement).closest('button,a,input,textarea,video,audio,.log-photo-strip,.audio-player'))return;swipe.current={x:event.clientX,y:event.clientY,time:Date.now()};}} onPointerCancel={()=>{swipe.current=null;}} onPointerUp={event=>{const start=swipe.current;swipe.current=null;if(!start||Date.now()-start.time>700)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.abs(dx)<70||Math.abs(dx)<Math.abs(dy)*2)return;const adjacent=dx<0?neighbors.next:neighbors.previous;if(adjacent)visitAdjacent(adjacent);}}>
  <div className="log-detail-body"><h2>{entry.title||'(untitled)'}</h2>
  <div className="log-photo-strip"><PostPhotos log horizontal photos={entry.contributors.flatMap(person=>person.files).filter(file=>file.mime.startsWith('image/')).sort((a,b)=>Number(b.id===entry.coverFileId)-Number(a.id===entry.coverFileId))}/></div>
  <div className="log-entry-facts"><p>{entry.date>today()?'plan for':'hung out'} {dateLabel(entry.date)}</p>{entry.place&&<p>at {entry.place}</p>}<p className="log-with">with {entry.contributors.map((person,index)=><span key={person.userId}>{index>0?', ':''}{person.profileVisible===false?<span className="quiet">{person.handle||person.name}</span>:<NavLink to={{view:'person',resourceId:person.userId}} navigate={navigate}>{person.handle||person.name}</NavLink>}</span>)}{entry.historicalPeople?.length?<span>, {entry.historicalPeople.join(', ')}</span>:null}</p></div>
  {entry.recurrence!=='none'&&<span className="log-recurrence-label">{entry.recurrence==='birthday'?'Birthday':'Anniversary'}</span>}
  {entry.membership==='invited'?<div className="log-invite-review"><p>You’re invited to share this entry. Join to add your own note and media.</p><div className="panel-actions"><button disabled={busy||!fresh} onClick={()=>void act('log.respond',{accept:false})}>Decline</button><button className="solid" disabled={busy||!fresh} onClick={()=>void act('log.join',{},true)}>Join entry</button></div></div>:null}

  {error&&<p className="error" role="alert">{error}</p>}
  <div className="log-contributions">{entry.membership==='member'&&!entry.title.trim()&&!entry.place.trim()&&!entry.links.length&&entry.recurrence==='none'&&entry.contributors.length===1&&entry.contributors.some(person=>person.userId===user.id&&!person.note.trim()&&!person.files.length)&&<section className="log-contribution log-empty-contribution"><NavLink className="log-author" to={{view:'person',resourceId:user.id}} navigate={navigate}>{user.handle||user.name}</NavLink><button className="log-add-note" disabled={!fresh} onClick={()=>setEditing(true)}>tap to add log</button></section>}{entry.contributors.filter(person=>person.note.trim()||person.files.some(file=>!file.mime.startsWith('image/'))).map(person=><section key={person.userId} className="log-contribution">{person.profileVisible===false?<span className="log-author quiet">{person.handle||person.name}</span>:<NavLink className="log-author" to={{view:'person',resourceId:person.userId}} navigate={navigate}>{person.handle||person.name}</NavLink>}<div className="log-note-content">{person.note.trim()&&<AgentMarkdown text={person.note}/>}<LogMedia files={person.files.filter(file=>!file.mime.startsWith('image/'))}/></div></section>)}</div>
  <div className="log-entry-links">{entry.links.map(url=><LinkPreviews key={url} text="" links={[url]}/>)}</div>
  </div><footer className="log-detail-footer">


   <div className="log-adjacent"><button aria-label="Previous entry" aria-busy={adjacent.pending||undefined} disabled={!neighbors.previous} onClick={()=>neighbors.previous&&visitAdjacent(neighbors.previous)}><CaretLeft size={18}/><span>{adjacent.list?'Previous':'Older'}</span></button><button aria-label="Next entry" aria-busy={adjacent.pending||undefined} disabled={!neighbors.next} onClick={()=>neighbors.next&&visitAdjacent(neighbors.next)}><span>{adjacent.list?'Next':'Newer'}</span><CaretRight size={18}/></button></div>
   <div className="panel-actions log-entry-actions">{entry.membership==='member'&&(fresh?<NavLink to={{view:'log_code',resourceId:entry.id}} navigate={navigate}>Code</NavLink>:<button disabled>Code</button>)}<button onClick={closeDetail}>{closeLabel}</button>{entry.membership==='member'&&<button disabled={!fresh} onClick={()=>setEditing(true)}>Edit</button>}</div>
  </footer>
 </article>;
}

export function LogPanel({user,navigate,initialQuery='',logMonth,logScope,personId:initialPerson,onStateChange}:{user:Profile;navigate:Navigate;initialQuery?:string;logMonth?:string;logScope?:Destination['logScope'];personId?:string;onStateChange?(context:Partial<Destination>):void}){
 const openList=useOpenLogList(navigate);
 const [optionsOpen,setOptionsOpen]=useState(false),[previews,setPreviews]=useState<LogCalendarTile[]>([]),[listLoaded,setListLoaded]=useState(false);
 const browserRoot=useRef<HTMLDivElement>(null),positions=useRef<Record<string,number>>({}),activeArrangement=useRef<LogPreferences['arrangement']>('calendar');
 const [todayEntries,setTodayEntries]=useState<LogEntry[]>([]),[preferences,setPreferences]=useState<LogPreferences>(emptyPreferences),[scope,setScope]=useState<'all'|'private'|'shared'|'invitations'>(logScope||'all'),[applied,setApplied]=useState(initialQuery),[personId,setPersonId]=useState<string|undefined>(initialPerson),[items,setItems]=useState<LogEntry[]>([]),[cursor,setCursor]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const applyPreferences=(value:LogPreferences)=>{if(value.arrangement!==activeArrangement.current){const scroller=browserRoot.current?.closest<HTMLElement>('.composer-view');if(scroller)positions.current[activeArrangement.current]=scroller.scrollTop;activeArrangement.current=value.arrangement;}setPreferences(value);};
 const prefsQueue=useRef<Promise<unknown>>(Promise.resolve()),prefsGeneration=useRef(0),prefsPending=useRef(0),prefsRead=useRef(0);
 const sequence=useRef(0),listPending=useRef(false),listEdge=useRef<HTMLDivElement>(null),visible=usePanelVisible();
 useEffect(()=>{setApplied(initialQuery||'');},[initialQuery]);
 useEffect(()=>setScope(logScope||'all'),[logScope]);
 useEffect(()=>setPersonId(initialPerson),[initialPerson]);
 const stateChange=(next:Partial<Destination>)=>onStateChange?.({query:applied||undefined,logScope:scope,personId,logMonth,...next});
 const calendar=preferences.arrangement==='calendar'&&scope!=='invitations';
 const load=async(append=false)=>{if(calendar||listPending.current||append&&!cursor)return;const ticket=++sequence.current;listPending.current=true;setBusy(true);setError('');try{
  const input={scope,...(applied?{query:applied}:{}),...(personId?{personId}:{}),limit:30,...(append&&cursor?{before:cursor}:{})};
  const page=await operation<LogPage>('log.list',input);
  if(!append)while(page.nextCursor&&page.items.length<items.length){const more=await operation<LogPage>('log.list',{...input,before:page.nextCursor});if(ticket!==sequence.current)return;page.items.push(...more.items);page.nextCursor=more.nextCursor;}
  if(ticket!==sequence.current)return;setItems(previous=>append?[...previous,...page.items]:page.items);setCursor(page.nextCursor);setListLoaded(true);

 }catch(e){if(ticket===sequence.current)setError(errorText(e));}finally{if(ticket===sequence.current){listPending.current=false;setBusy(false);}}};
 const loadPreferences=async()=>{if(prefsPending.current)return;const generation=prefsGeneration.current,ticket=++prefsRead.current;try{const value=await operation<LogPreferences>('log.preferences');if(ticket===prefsRead.current&&generation===prefsGeneration.current&&!prefsPending.current)applyPreferences(value);}catch(error){if(ticket===prefsRead.current&&!prefsPending.current)setError(errorText(error));}};
 useEffect(()=>{void loadPreferences();},[]);
 useEffect(()=>{sequence.current++;listPending.current=false;setItems([]);setPreviews([]);setCursor(null);setListLoaded(false);},[scope,applied,personId]);
 useEffect(()=>{if(!calendar&&!listLoaded)void load();},[calendar,listLoaded,scope,applied,personId]);
 useEffect(()=>()=>{sequence.current++;},[]);
 useLayoutEffect(()=>{const scroller=browserRoot.current?.closest<HTMLElement>('.composer-view');if(!scroller)return;const view=preferences.arrangement;scroller.scrollTop=positions.current[view]||0;},[preferences.arrangement]);
 const loadToday=async()=>{try{const entries:LogEntry[]=[];let before:string|undefined;do{const page=await operation<LogPage>('log.list',{from:new Date().getHours()<8?Temporal.Now.plainDateISO().subtract({days:1}).toString():today(),through:today(),scope:'all',limit:30,...(before?{before}:{})});entries.push(...page.items);before=page.nextCursor||undefined;}while(before);setTodayEntries(entries.reverse());}catch{/* Calendar errors are shown in their own view. */}};
 useEffect(()=>{void loadToday();},[]);
 useRecordRefreshDetails(['log'],change=>{const ids=new Set(change?.log?.map(item=>item.id));setPreviews(previous=>ids.size?previous.filter(item=>!ids.has(item.id)):[]);void loadToday();void load();});
 useEffect(()=>{const target=listEdge.current,scroller=target?.closest<HTMLElement>('.composer-view');if(calendar||!visible||busy||error||!cursor||!target||!scroller||typeof IntersectionObserver==='undefined')return;const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))void load(true);},{root:scroller,rootMargin:'0px 0px 150px 0px'});observer.observe(target);return()=>observer.disconnect();},[calendar,visible,busy,error,cursor]);
 useRecordRefresh(['log_preferences'],()=>loadPreferences());
 const prefs=async(value:LogPreferences)=>{const generation=++prefsGeneration.current;prefsRead.current++;prefsPending.current++;applyPreferences(value);const next=prefsQueue.current.then(()=>operation<LogPreferences>('log.preferences_update',value));prefsQueue.current=next.catch(()=>{});try{const saved=await next;if(generation===prefsGeneration.current)applyPreferences(saved);}catch(e){if(generation===prefsGeneration.current)setError(errorText(e));}finally{prefsPending.current--;if(!prefsPending.current)void loadPreferences();}};

 const displayItems=useMemo(()=>{const order=(a:LogCalendarTile|LogEntry,b:LogCalendarTile|LogEntry)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id),last=items.at(-1);const uncovered=!listLoaded?previews:cursor&&last?previews.filter(item=>order(item,last)>0):[];return [...new Map([...uncovered,...items].map(entry=>[entry.id,entry])).values()].sort(order);},[previews,items,listLoaded,cursor]);
 return <div ref={browserRoot} className="log-browser">

  {error&&<p className="error" role="alert">{error}</p>}
  {scope!=='invitations'&&<div className="log-retained-calendar" hidden={!calendar}><PanelVisibilityContext.Provider value={visible&&calendar}><LogCalendar key={JSON.stringify([logMonth,scope,applied,personId])} month={logMonth} scope={scope as 'all'|'private'|'shared'} query={applied} personId={personId} jump={value=>stateChange({logMonth:value})} create={date=>navigate({view:'log_compose',date})} onPreviews={setPreviews} seedEntries={items} open={(entry,list,query,cursor)=>list?openList(entry,list,query,cursor):navigate({view:'log',resourceId:entry.id})} openPerson={personId=>navigate({view:'person',resourceId:personId})}/></PanelVisibilityContext.Provider></div>}
  {!calendar&&(preferences.arrangement==='gallery'&&scope!=='invitations'?<div className="log-gallery">{displayItems.map((entry,index)=><div key={entry.id}><LogTile entry={entry} open={()=>openList(entry,displayItems,{scope,...(applied?{query:applied}:{}),...(personId?{personId}:{})},cursor)}/>{(!index||displayItems[index-1].date!==entry.date)&&<time>{Number(entry.date.slice(8))}{!index||displayItems[index-1].date.slice(0,7)!==entry.date.slice(0,7)?` - ${new Date(`${entry.date}T12:00:00`).toLocaleDateString(undefined,{month:'short'})}`:''}</time>}</div>)}</div>:<LogList entries={displayItems} open={entry=>openList(entry,displayItems,{scope,...(applied?{query:applied}:{}),...(personId?{personId}:{})},cursor)}/>)}
  {busy&&!calendar&&!displayItems.length&&<div className="log-loading" role="status" aria-label="Loading entries"><CircleNotch className="spin" size={22}/></div>}
  {!busy&&!displayItems.length&&!calendar&&listLoaded&&<div className="log-empty"><p>{scope==='invitations'?'No pending invitations.':applied?'No entries match this view.':'No entries yet.'}</p></div>}
  {!calendar&&<div ref={listEdge}>{cursor&&<button className="more-messages" disabled={busy} onClick={()=>void load(true)}>More entries</button>}</div>}

  <LogFloaters><div className="log-home-footer">{todayEntries.length>0&&<LogTodayCards entries={todayEntries} presentation={preferences.todayPresentation||'full'} change={todayPresentation=>void prefs({...preferences,todayPresentation})} open={entry=>openList(entry,todayEntries)}/>}<div className="log-options log-quick-settings" hidden={!optionsOpen}><div className="view-tabs" aria-label="Log view">{([{value:'calendar',label:'Calendar',Icon:CalendarDots},{value:'gallery',label:'Grid',Icon:SquaresFour},{value:'list',label:'List',Icon:List}] as const).map(({value,label,Icon})=><button key={value} type="button" aria-pressed={preferences.arrangement===value} onClick={()=>{void prefs({...preferences,arrangement:value});}}><Icon size={18}/>{label}</button>)}</div><NavLink className="log-more-settings" to={{view:'log_settings'}} navigate={navigate} onClick={()=>setOptionsOpen(false)}>More settings</NavLink></div><div className="log-home-actions"><NavLink className="log-scan-button" to={{view:'log_scan'}} navigate={navigate}>Scan</NavLink><NavLink className="log-outline-button" to={{view:'log_compose'}} navigate={navigate}>Log new event</NavLink><button className="log-options-toggle" aria-label="Log view options" aria-expanded={optionsOpen} onClick={()=>setOptionsOpen(value=>!value)}><DotsThree size={22}/></button></div></div></LogFloaters>

 </div>;
}
