import {avatarImageUrl} from './logImageCache';
import {useLogContacts} from './useLogContacts';
import {useOpenLogList} from './logSequence';
import {NavLink} from './NavLink';
import {useEffect,useState} from 'react';
import {CircleNotch,UserCircle} from '@phosphor-icons/react';
import {Temporal} from '@js-temporal/polyfill';
import type {Destination} from '../shared/navigation';
import type {LogContact} from '../shared/logJoining';
import type {BirthdayPerson} from '../shared/logBirthday';
import {recurrenceOn,type LogEntry,type LogPage} from '../shared/log';
import {operation,errorText} from './api';
import {useRecordRefresh} from './useRecordRefresh';
import {usePanelLoading,usePanelVisible} from './PanelReadiness';
type Props={closeLabel?:string;navigate(destination:Destination):void;close():void};
export function LogPeople({navigate,close,closeLabel='Close'}:Props){
 const visible=usePanelVisible(),contacts=useLogContacts('',visible),people=contacts.loaded?contacts.items:null,error=contacts.error;
 usePanelLoading(!people&&!error);
 return <section className="log-task"><div className="log-directory-body"><h2>Attendees</h2>{people?.map(person=><NavLink className="log-person-row" key={person.id} to={{view:'person',resourceId:person.id}} navigate={navigate}>{person.photoId?<img src={avatarImageUrl(person.photoId)} alt=""/>:<UserCircle size={38}/>}<span><strong>{person.name}</strong>{person.handle&&<span className="quiet"> @{person.handle}</span>}<small>{person.sharedHangouts?`${person.sharedHangouts} shared ${person.sharedHangouts===1?'hangout':'hangouts'}`:'No hangouts yet'}</small></span></NavLink>)}{contacts.nextCursor&&<button disabled={contacts.busy} onClick={()=>void contacts.more()}>More attendees</button>}{people&&!people.length&&!contacts.indexing&&!contacts.nextCursor&&<p className="quiet">Friends and people you’ve logged with appear here.</p>}{contacts.indexing&&<span className="quiet small">Updating shared hangouts...</span>}{!people&&!error&&<CircleNotch className="spin" size={22}/>} {error&&<p className="error" role="alert">{error}</p>}</div><footer className="panel-actions log-task-footer"><button onClick={close}>{closeLabel}</button></footer></section>;
}
function nextBirthday(month:number,day:number){const today=Temporal.Now.plainDateISO();let date=Temporal.PlainDate.from({year:today.year,month,day},{overflow:'constrain'});if(Temporal.PlainDate.compare(date,today)<0)date=Temporal.PlainDate.from({year:today.year+1,month,day},{overflow:'constrain'});return date.toString();}
export function LogDates({kind,navigate,close,closeLabel='Close'}:Props&{kind:'birthdays'|'anniversaries'}){
 const openList=useOpenLogList(navigate);
 const [dates,setDates]=useState<{id:string;title:string;date:string;destination:Destination;entry?:LogEntry}[]|null>(null),[error,setError]=useState(''),visible=usePanelVisible();
 const load=async()=>{try{let result:NonNullable<typeof dates>;
  if(kind==='birthdays'){const page=await operation<{items:BirthdayPerson[]}>('log.birthdays',{});result=page.items.map(person=>({id:person.personId,title:person.handle?`@${person.handle}`:person.name,date:nextBirthday(person.month,person.day),destination:{view:'person',resourceId:person.personId}}));}
  else{const entries:LogEntry[]=[];let before:string|undefined;do{const page=await operation<LogPage>('log.list',{recurring:true,scope:'all',limit:30,...(before?{before}:{})});entries.push(...page.items);before=page.nextCursor||undefined;}while(before);const today=Temporal.Now.plainDateISO();result=entries.filter(entry=>entry.recurrence==='anniversary').map(entry=>{let year=Math.max(today.year,Number(entry.date.slice(0,4))),date=recurrenceOn(entry,year)!;if(date<today.toString())date=recurrenceOn(entry,++year)!;return {entry,id:entry.id,title:entry.title||entry.place||'(untitled)',date,destination:{view:'log',resourceId:entry.id}};});}
  setDates(result.sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title)));setError('');
 }catch(e){setError(errorText(e));}};
 useEffect(()=>{if(visible)void load();},[kind,visible]);useRecordRefresh(['log','log_birthdays','people','connections'],()=>{if(visible)void load();});
 usePanelLoading(!dates&&!error);
 return <section className="log-task"><div className="log-directory-body"><h2>{kind==='birthdays'?'Birthdays':'Anniversaries'}</h2>{dates?.map(item=>{const destination=item.entry?{view:'log' as const,resourceId:item.entry.id}:item.destination;return <NavLink className="log-date-row" key={item.id} to={destination} navigate={()=>item.entry?openList(item.entry,dates.flatMap(row=>row.entry?[row.entry]:[])):navigate(item.destination)}><time dateTime={item.date}>{new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time><span>{item.title}</span></NavLink>;})}{dates&&!dates.length&&<p className="quiet">{kind==='birthdays'?'No saved birthdays yet.':'Mark an anniversary start in a hangout’s Uncommon section.'}</p>}{!dates&&!error&&<CircleNotch className="spin" size={22}/>} {error&&<p className="error" role="alert">{error}</p>}</div><footer className="panel-actions log-task-footer"><button onClick={close}>{closeLabel}</button></footer></section>;
}
