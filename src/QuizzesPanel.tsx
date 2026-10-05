import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ChatCircle,PushPin,Star} from '@phosphor-icons/react';
import type {Profile} from '../shared/types';
import type {Destination} from '../shared/navigation';
import {quizCategories,type Quiz,type QuizAnswers} from '../shared/quizzes';
import {operation,errorText} from './api';
import {avatarImageUrl} from './logImageCache';
import {NavLink} from './NavLink';
import {SearchField} from './SearchField';
import {ConversationHeader} from './ConversationHeader';
import {usePanelLoading,usePanelVisible} from './PanelReadiness';
import {useRecordRefresh} from './useRecordRefresh';
import {TransientError} from './TransientError';

interface QuizPage{items:Quiz[];nextCursor:string|null}
interface FriendPage{items:{id:string;members:string[];status:string}[];people:Profile[];nextCursor:string|null}
type QuizPerson=Quiz['people'][number];
const displayName=(person:QuizPerson)=>person.name||person.handle&&`@${person.handle}`||'Member';
const answerCount=(quiz:Quiz)=>Object.values(quiz.answers).reduce((total,answers)=>total+Object.values(answers).filter(Boolean).length,0);
const compareQuizzes=(a:Quiz,b:Quiz)=>Number(b.bff)-Number(a.bff)||Number(b.pinned)-Number(a.pinned)||Number(b.myAnswered&&b.otherAnswered)-Number(a.myAnswered&&a.otherAnswered)||answerCount(b)-answerCount(a)||b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id);
function QuizAvatar({person}:{person:QuizPerson}){return <span className="message-avatar" aria-hidden="true">{person.photoId?<img src={avatarImageUrl(person.photoId)} alt=""/>:displayName(person).replace(/^@/,'').slice(0,1).toUpperCase()}</span>;}

export function QuizzesPanel({user,personId,choosing,setChoosing,navigate,cancel}:{user:Profile;personId?:string;choosing:boolean;setChoosing(value:boolean):void;navigate(destination:Destination):void;cancel():void}){
 const visible=usePanelVisible(),[page,setPage]=useState<QuizPage|null>(null),[detail,setDetail]=useState<{person:QuizPerson;quiz:Quiz|null}|null>(null),[friends,setFriends]=useState<Profile[]>([]),[friendsCursor,setFriendsCursor]=useState<string|null>(null),[friendsLoaded,setFriendsLoaded]=useState(false),[query,setQuery]=useState('');
 const [editing,setEditing]=useState(false),[answers,setAnswers]=useState<QuizAnswers>({}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [pendingPins,setPendingPins]=useState<Record<string,boolean>>({});
 const request=useRef(0),intent=useRef<{signature:string;key:string}|null>(null),pinRequests=useRef(new Set<string>());
 const load=async(before?:string)=>{const ticket=++request.current;try{
  if(personId){const next=await operation<{person:QuizPerson;quiz:Quiz|null}>('quizzes.get',{personId});if(ticket!==request.current)return;setDetail(next);if(!before){setEditing(!next.quiz?.myAnswered);setAnswers(next.quiz?.answers[user.id]||{});}}
  else{const next=await operation<QuizPage>('quizzes.list',before?{before}:{});if(ticket!==request.current)return;setPage(previous=>before&&previous?{...next,items:[...new Map([...previous.items,...next.items].map(item=>[item.id,item])).values()]}:next);}
  setError('');
 }catch(cause){if(ticket===request.current)setError(errorText(cause));}};
 useEffect(()=>{setPage(null);setDetail(null);setEditing(false);setAnswers({});setPendingPins({});pinRequests.current.clear();setError('');intent.current=null;return()=>{request.current++;};},[personId]);
 useEffect(()=>{if(visible)void load();},[personId,visible]);
 useRecordRefresh(['quizzes','connections'],()=>{if(visible)void load();});
 usePanelLoading(visible&&!error&&!(personId?detail:page));
 const loadFriends=async(before?:string)=>{try{const result=await operation<FriendPage>('connections.list',{limit:30,...(before?{before}:{})});const accepted=new Set(result.items.filter(connection=>connection.status==='accepted').flatMap(connection=>connection.members));setFriends(previous=>[...new Map([...(before?previous:[]),...result.people.filter(person=>person.id!==user.id&&accepted.has(person.id))].map(person=>[person.id,person])).values()]);setFriendsCursor(result.nextCursor);setFriendsLoaded(true);setError('');}catch(cause){setFriendsLoaded(true);setError(errorText(cause));}};
 useEffect(()=>{if(!personId&&choosing&&visible&&!friendsLoaded)void loadFriends();},[personId,choosing,visible,friendsLoaded]);
 useEffect(()=>{if(!choosing)setQuery('');},[choosing]);
 const save=async(event:FormEvent)=>{event.preventDefault();if(!personId||busy)return;const cleaned=Object.fromEntries(Object.entries(answers).map(([key,value])=>[key,value?.trim()||'']).filter(([,value])=>value)) as QuizAnswers;
  if(!detail?.quiz&&!Object.values(cleaned).some(Boolean)){setError('Answer at least one prompt to start a quiz.');return;}
  const input=detail?.quiz?{personId,revision:detail.quiz.revision,answers:cleaned}:{personId,answers:cleaned},name=detail?.quiz?'quizzes.answer':'quizzes.create',signature=JSON.stringify([name,input]);
  if(intent.current?.signature!==signature)intent.current={signature,key:crypto.randomUUID()};setBusy(true);setError('');
  try{const quiz=await operation<Quiz>(name,input,{confirmed:true,key:intent.current.key});intent.current=null;setDetail(previous=>previous?{...previous,quiz}:previous);setEditing(false);window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:['quizzes','notifications']}));}
  catch(cause){setError(errorText(cause));}finally{setBusy(false);}
 };
 const togglePin=async(quiz:Quiz,otherId:string)=>{if(busy||quiz.bff||pinRequests.current.has(quiz.id))return;const pinned=!quiz.pinned;pinRequests.current.add(quiz.id);setPendingPins(previous=>({...previous,[quiz.id]:pinned}));setError('');try{await operation('quizzes.pin',{personId:otherId,pinned});setPage(previous=>previous?{...previous,items:previous.items.map(item=>item.id===quiz.id?{...item,pinned}:item)}:previous);}catch(cause){setError(errorText(cause));}finally{pinRequests.current.delete(quiz.id);setPendingPins(previous=>{const next={...previous};delete next[quiz.id];return next;});}};
 const displayedQuizzes=page?.items.map(quiz=>Object.hasOwn(pendingPins,quiz.id)?{...quiz,pinned:pendingPins[quiz.id]}:quiz).sort(compareQuizzes)||[];
 if(personId){const other=detail?.person,quiz=detail?.quiz,me=quiz?.people.find(person=>person.id===user.id)||{id:user.id,name:user.name,handle:user.handle},named=other?displayName(other):'Friend';
  const ordered=editing?[...quizCategories]:[...quizCategories].sort((a,b)=>Number(Boolean(quiz?.answers[me.id]?.[b.key]))+Number(Boolean(quiz?.answers[other?.id||'']?.[b.key]))-Number(Boolean(quiz?.answers[me.id]?.[a.key]))-Number(Boolean(quiz?.answers[other?.id||'']?.[a.key])));
  return <section className="quiz-panel quiz-detail">{other&&<ConversationHeader><div className="message-view-actions"><NavLink className="message-person" to={{view:'person',resourceId:other.id}} navigate={navigate}><QuizAvatar person={other}/><span className="message-person-name"><strong>{named}</strong>{other.handle&&<span className="quiet">@{other.handle}</span>}</span></NavLink><NavLink className="call-start" to={{view:'messages',resourceId:[user.id,other.id].sort().join(':')}} navigate={navigate} aria-label={`Messages with ${named}`}><ChatCircle size={19}/><span className="call-start-label">Messages</span></NavLink></div></ConversationHeader>}
   {detail&&<><div className="quiz-intro"><h2>What ___ reminds you of them?</h2>{quiz&&!editing&&<button className="text-action" type="button" onClick={()=>{setAnswers(quiz.answers[user.id]||{});setEditing(true);}}>Edit</button>}</div>
    {editing?<form className="fields quiz-form" onSubmit={event=>void save(event)}>{quizCategories.map(({key,label})=><label key={key}>{label}<input value={answers[key]||''} maxLength={120} onChange={event=>setAnswers(previous=>({...previous,[key]:event.target.value}))}/></label>)}<div className="panel-actions button-row"><button type="button" className="text-action" onClick={()=>{if(quiz){setAnswers(quiz.answers[user.id]||{});setEditing(false);}else cancel();}}>Cancel</button><button className="solid" disabled={busy||!quiz&&!Object.values(answers).some(value=>value?.trim())}>{busy?'Saving…':quiz?'Save answers':'Send quiz'}</button></div></form>
    :<><div className="quiz-answer-head"><NavLink to={{view:'person',resourceId:me.id}} navigate={navigate}><strong>{displayName(me)}</strong> <span>said</span></NavLink><NavLink to={{view:'person',resourceId:other!.id}} navigate={navigate}><strong>{named}</strong> <span>said</span></NavLink></div>{ordered.map(({key,label})=><section className="quiz-answer-row" key={key}><h3>{label}</h3><div className="quiz-answer-grid"><span>{quiz?.answers[me.id]?.[key]||'—'}</span><span>{quiz?.answers[other?.id||'']?.[key]||'—'}</span></div></section>)}</>}
   </>}{error&&<TransientError className="error" role="alert">{error}</TransientError>}</section>;
 }
 return <section className="quiz-panel">{choosing?<><SearchField label="Find a friend" value={query} onSearch={setQuery}/><div className="ious-picker-list">{friends.filter(friend=>`${friend.name} ${friend.handle||''}`.toLowerCase().includes(query.toLowerCase())).map(friend=>{const destination:Destination={view:'quizzes',resourceId:friend.id},person={id:friend.id,name:friend.name,handle:friend.handle,photoId:friend.photos?.[0]};return <NavLink className="ious-person-row" key={friend.id} to={destination} navigate={()=>{setChoosing(false);navigate(destination);}}><QuizAvatar person={person}/><span className="message-person-name"><strong>{displayName(person)}</strong>{friend.handle&&<span className="quiet">@{friend.handle}</span>}</span></NavLink>;})}</div>{friendsLoaded&&!friends.length&&<p className="quiet">No friends to start a quiz with yet.</p>}{friendsCursor&&<button className="text-link" onClick={()=>void loadFriends(friendsCursor)}>More friends</button>}</>:<>{page&&<div className="ious-list">{displayedQuizzes.map(quiz=>{const other=quiz.people.find(person=>person.id!==user.id)!;return <article className="quiz-list-row" key={quiz.id}><NavLink className="quiz-list-open" to={{view:'quizzes',resourceId:other.id}} navigate={navigate}><QuizAvatar person={other}/><span className="message-person-name"><strong>{displayName(other)}</strong>{other.handle&&<span className="quiet">@{other.handle}</span>}</span>{!(quiz.myAnswered&&quiz.otherAnswered)&&<small className="quiz-list-status">{quiz.myAnswered?'Waiting for them':'Your turn'}</small>}</NavLink>{quiz.bff?<span className="quiz-list-star" role="img" aria-label="BFF" title="BFF"><Star size={20} weight="fill"/></span>:<button type="button" className="quiz-list-pin" aria-label={quiz.pinned?`Unpin quiz with ${displayName(other)}`:`Pin quiz with ${displayName(other)}`} aria-pressed={quiz.pinned} disabled={busy||pinRequests.current.has(quiz.id)} onClick={()=>void togglePin(quiz,other.id)}><PushPin size={20} weight={quiz.pinned?'fill':'regular'}/></button>}</article>;})}{!page.items.length&&!page.nextCursor&&<p className="quiet">No quizzes yet.</p>}</div>}{page?.nextCursor&&<button className="text-link" onClick={()=>void load(page.nextCursor!)}>More quizzes</button>}</>}{error&&<TransientError className="error" role="alert">{error}</TransientError>}</section>;
}
