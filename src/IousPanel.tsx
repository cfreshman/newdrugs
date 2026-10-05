import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ChatCircle} from '@phosphor-icons/react';
import type {Profile} from '../shared/types';
import type {Destination} from '../shared/navigation';
import type {IouEntry,IouLedger,IouSummary} from '../shared/ious';
import {operation,errorText} from './api';
import {avatarImageUrl} from './logImageCache';
import {NavLink} from './NavLink';
import {SearchField} from './SearchField';
import {ConversationHeader} from './ConversationHeader';
import {usePanelLoading,usePanelVisible} from './PanelReadiness';
import {useRecordRefresh} from './useRecordRefresh';

const usd=(cents:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(cents/100);
const compactAmount=(cents:number)=>new Intl.NumberFormat('en-US',{minimumFractionDigits:cents%100?2:0,maximumFractionDigits:2}).format(cents/100);
function cents(value:string){const match=/^\$?(\d{1,6})(?:\.(\d{1,2}))?$/.exec(value.trim());if(!match)return null;const amount=Number(BigInt(match[1])*100n+BigInt((match[2]||'').padEnd(2,'0')));return amount>=1&&amount<=10_000_000?amount:null;}
const balance=(value:number)=>value>0?`They owe you ${usd(value)}`:value<0?`You owe them ${usd(-value)}`:'Settled up';
interface ConnectionPage {items:{id:string;members:string[];status:string}[];people:Profile[];nextCursor:string|null}
interface IouPage {items:IouSummary[];nextCursor:string|null}
function IouAvatar({name,photoId}:{name:string;photoId?:string}){return <span className="message-avatar" aria-hidden="true">{photoId?<img src={avatarImageUrl(photoId)} alt=""/>:name.replace(/^@/,'').slice(0,1).toUpperCase()}</span>;}

export function IousPanel({user,personId,choosing,setChoosing,navigate}:{user:Profile;personId?:string;choosing:boolean;setChoosing(value:boolean):void;navigate(destination:Destination):void}){
 const visible=usePanelVisible(),[page,setPage]=useState<IouPage|null>(null),[ledger,setLedger]=useState<IouLedger|null>(null),[friends,setFriends]=useState<Profile[]>([]),[friendsCursor,setFriendsCursor]=useState<string|null>(null),[friendsLoaded,setFriendsLoaded]=useState(false),[friendQuery,setFriendQuery]=useState('');
 const [kind,setKind]=useState<'owe'|'settle'|'payment'>('owe'),[direction,setDirection]=useState<'me_to_them'|'them_to_me'>('them_to_me'),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef(0),intent=useRef<{signature:string;key:string}|null>(null);
 const load=async(before?:string)=>{const ticket=++request.current;try{
  if(personId){const next=await operation<IouLedger>('ious.get',{personId,...(before?{before}:{})});if(ticket!==request.current)return;setLedger(previous=>before&&previous?{...next,entries:[...previous.entries,...next.entries]}:next);}
  else{const next=await operation<IouPage>('ious.list',before?{before}:{});if(ticket!==request.current)return;setPage(previous=>before&&previous?{...next,items:[...previous.items,...next.items]}:next);}
  setError('');
 }catch(cause){if(ticket===request.current)setError(errorText(cause));}};
 useEffect(()=>{setPage(null);setLedger(null);setChoosing(false);return()=>{request.current++;};},[personId]);
 useEffect(()=>{if(visible)void load();},[personId,visible]);
 useRecordRefresh(['ious'],()=>{if(visible)void load();});
 usePanelLoading(visible&&!error&&!(personId?ledger:page));
 const loadFriends=async(before?:string)=>{try{const result=await operation<ConnectionPage>('connections.list',{limit:30,...(before?{before}:{})});setFriends(previous=>[...new Map([...(before?previous:[]),...result.people].map(person=>[person.id,person])).values()].filter(person=>person.id!==user.id&&(result.items.some(connection=>connection.status==='accepted'&&connection.members.includes(person.id))||Boolean(before&&previous.some(item=>item.id===person.id)))));setFriendsCursor(result.nextCursor);setFriendsLoaded(true);setError('');}catch(cause){setFriendsLoaded(true);setError(errorText(cause));}};
 useEffect(()=>{if(!personId&&visible&&!friendsLoaded)void loadFriends();},[personId,visible,friendsLoaded]);
 useEffect(()=>{if(!choosing)setFriendQuery('');},[choosing]);
 useRecordRefresh(['connections'],()=>{if(!personId&&visible)void loadFriends();});
 const submit=async(event:FormEvent)=>{event.preventDefault();if(!personId||busy)return;const amountCents=kind==='settle'?null:cents(amount);if(kind!=='settle'&&amountCents===null){setError('Enter an amount in dollars and cents.');return;}
  const input=kind==='owe'?{personId,kind,direction,amountCents:amountCents!,reason:reason.trim()}:kind==='payment'?{personId,kind,amountCents:amountCents!,reason:reason.trim()}:{personId,kind,revision:ledger?.revision,reason:reason.trim()},signature=JSON.stringify(input);if(intent.current?.signature!==signature)intent.current={signature,key:crypto.randomUUID()};setBusy(true);setError('');
  try{await operation('ious.record',input,{confirmed:true,key:intent.current.key});intent.current=null;setAmount('');setReason('');await load();window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:['ious','notifications']}));}
  catch(cause){setError(errorText(cause));}finally{setBusy(false);}
 };
 const name=ledger?.person.handle?`@${ledger.person.handle}`:ledger?.person.name||'This person';
 const signedChange=(entry:IouEntry)=>(entry.creditorId===user.id?1:-1)*(entry.kind==='owe'?1:-1)*entry.amountCents;
 if(personId)return <section className="ious-panel">
  {ledger&&<><ConversationHeader><div className="message-view-actions"><NavLink className="message-person" to={{view:'person',resourceId:ledger.person.id}} navigate={navigate}><IouAvatar name={ledger.person.name||name} photoId={ledger.person.photoId}/><span className="message-person-name"><strong>{ledger.person.name||name}</strong>{ledger.person.handle&&<span className="quiet">@{ledger.person.handle}</span>}</span></NavLink><NavLink className="call-start" to={{view:'messages',resourceId:[user.id,ledger.person.id].sort().join(':')}} navigate={navigate} aria-label={`Messages with ${name}`}><ChatCircle size={19}/><span className="call-start-label">Messages</span></NavLink></div></ConversationHeader><div className="ious-balance"><strong>{balance(ledger.balanceCents)}</strong></div>
   <form className="fields ious-form" onSubmit={submit}><div className="view-tabs" aria-label="IOU change"><button type="button" aria-pressed={kind==='owe'} onClick={()=>{setKind('owe');setDirection('them_to_me');}}>Add owed</button><button type="button" aria-pressed={kind==='settle'} disabled={!ledger.balanceCents} onClick={()=>setKind('settle')}>Settled up</button><button type="button" aria-pressed={kind==='payment'} disabled={Math.abs(ledger.balanceCents)<=1} onClick={()=>setKind('payment')}>Paid down</button></div>
    <div className="view-tabs ious-direction-tabs" aria-label={kind==='owe'?'Who owes':kind==='settle'?'Settlement amount':'Payment'}>{kind==='owe'?<><button type="button" aria-pressed={direction==='them_to_me'} onClick={()=>setDirection('them_to_me')}>{name} owes me</button><button type="button" aria-pressed={direction==='me_to_them'} onClick={()=>setDirection('me_to_them')}>I owe {name}</button></>:<button type="button" aria-pressed="true">{kind==='settle'?'Full balance':ledger.balanceCents>0?`${name} paid me`:`I paid ${name}`}</button>}</div>
    <label>Amount<input inputMode="decimal" type="text" placeholder="$0.00" value={kind==='settle'?(Math.abs(ledger.balanceCents)/100).toFixed(2):amount} readOnly={kind==='settle'} onChange={event=>setAmount(event.target.value)} maxLength={11}/></label>
    <label>Note<input value={reason} onChange={event=>setReason(event.target.value)} maxLength={240}/></label>
    <button className="solid" disabled={busy||(kind==='settle'?!ledger.balanceCents:cents(amount)===null||kind==='payment'&&cents(amount)!>=Math.abs(ledger.balanceCents))}>{busy?'Saving…':kind==='owe'?'Add to IOU':kind==='settle'?'Settle up':'Record paid down'}</button>
   </form>
   <section className="ious-history"><h2>History</h2>{ledger.entries.length?<ol className="ious-ledger-list" aria-label={`IOU changes with ${name}`}>{ledger.entries.map(entry=>{const delta=signedChange(entry),positive=delta>0,[whole,fraction]=compactAmount(Math.abs(delta)).split('.');return <li className="ious-ledger-row" key={entry.id}><span className="ious-ledger-amount" data-tone={positive?'success':'error'} aria-label={`Balance ${positive?'increased':'decreased'} by ${usd(entry.amountCents)}`}><span aria-hidden="true" className="ious-ledger-sign">{positive?'+':'−'}</span><span aria-hidden="true" className="ious-ledger-whole">{whole}</span><span aria-hidden="true" className="ious-ledger-fraction">{fraction?`.${fraction}`:''}</span></span><span className="ious-ledger-detail">{entry.reason&&<span>{entry.reason}</span>}<small>{entry.actorId===user.id?'You':name} · <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'2-digit'})}</time></small></span></li>;})}</ol>:<p className="quiet">No changes yet.</p>}{ledger.nextCursor&&<button className="text-link" onClick={()=>void load(ledger.nextCursor!)}>Older changes</button>}</section>
  </>}{error&&<p className="error" role="alert">{error}</p>}
 </section>;
 return <section className="ious-panel">
  {choosing?<section className="ious-picker"><SearchField label="Find a friend" value={friendQuery} onSearch={setFriendQuery}/><div className="ious-picker-list">{friends.filter(friend=>`${friend.name} ${friend.handle||''}`.toLowerCase().includes(friendQuery.toLowerCase())).map(friend=>{const destination:Destination={view:'ious',resourceId:friend.id};return <NavLink className="ious-person-row" key={friend.id} to={destination} navigate={()=>{setChoosing(false);navigate(destination);}}><IouAvatar name={friend.name||friend.handle||'?'} photoId={friend.photos?.[0]}/><span className="message-person-name"><strong>{friend.name||`@${friend.handle}`}</strong>{friend.name&&friend.handle&&<span className="quiet">@{friend.handle}</span>}</span></NavLink>;})}</div>{friendsLoaded&&!friends.length&&<p className="quiet">No friends to start an IOU with yet.</p>}{friendsLoaded&&Boolean(friends.length)&&!friends.some(friend=>`${friend.name} ${friend.handle||''}`.toLowerCase().includes(friendQuery.toLowerCase()))&&<p className="quiet">No matching friends.</p>}{friendsCursor&&<button className="text-link" onClick={()=>void loadFriends(friendsCursor)}>More friends</button>}</section>:
   <>{page&&<div className="ious-list">{page.items.map(item=>{const amount=item.balanceCents,personName=item.person.name||item.person.handle||'Member',destination:Destination={view:'ious',resourceId:item.person.id};return <NavLink className="ious-person-row ious-list-card" key={item.person.id} to={destination} navigate={navigate}><IouAvatar name={personName} photoId={item.person.photoId}/><span className="message-person-name"><strong>{personName}</strong>{item.person.handle&&personName!==item.person.handle&&<span className="quiet">@{item.person.handle}</span>}</span><span className="ious-list-balance" data-tone={amount>0?'success':amount<0?'error':undefined}><strong>{usd(Math.abs(amount))}</strong><small>{amount>0?'Owes you':amount<0?'You owe':'Settled up'}</small></span></NavLink>;})}{!page.items.length&&<p className="quiet">No IOUs yet.</p>}</div>}{page?.nextCursor&&<button className="text-link" onClick={()=>void load(page.nextCursor!)}>More IOUs</button>}</>}{error&&<p className="error" role="alert">{error}</p>}
 </section>;
}
