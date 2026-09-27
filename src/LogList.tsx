import {primeLogEntry} from './logEntryCache';
import {logImageUrl} from './logImageCache';
import {logDateLabel} from './logDate';
import {Users} from '@phosphor-icons/react';
import type {LogEntry,LogCalendarTile} from '../shared/log';
import {logCover} from './logCalendarModel';
import './log.css';
export function LogList<T extends LogEntry|LogCalendarTile>({entries,open}:{entries:T[];open(entry:T):void}){
 return <div className="log-list">{entries.map(entry=><button key={entry.id} onClick={()=>{if("contributors" in entry)primeLogEntry(entry);open(entry);}}>{logCover(entry)?<img src={logImageUrl(logCover(entry)!.url)} alt=""/>:<span className="log-list-date">{entry.date.slice(8)}<small>{new Date(`${entry.date}T12:00:00`).toLocaleDateString(undefined,{month:'short'})}</small></span>}<span><strong>{entry.title||'(untitled)'}</strong><span className="quiet small">{logDateLabel(entry.date)}{'place' in entry&&entry.place?` - ${entry.place}`:''}</span><span className="log-list-preview">{('contributors' in entry?entry.contributors:[]).map(person=>person.note).filter(Boolean).join(' · ')}</span></span>{'membership' in entry&&entry.membership==='invited'?<span className="log-invited-tag">Invited</span>:'contributors' in entry&&entry.contributors.length>1?<Users size={18}/>:null}</button>)}</div>;
}
