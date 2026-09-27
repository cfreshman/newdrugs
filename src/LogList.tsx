import {logDateLabel} from './logDate';
import {Users} from '@phosphor-icons/react';
import type {LogEntry} from '../shared/log';
import {logCover} from './logCalendarModel';
import './log.css';
export function LogList({entries,open}:{entries:LogEntry[];open(entry:LogEntry):void}){
 return <div className="log-list">{entries.map(entry=><button key={entry.id} onClick={()=>open(entry)}>{logCover(entry)?<img src={logCover(entry)!.url} alt=""/>:<span className="log-list-date">{entry.date.slice(8)}<small>{new Date(`${entry.date}T12:00:00`).toLocaleDateString(undefined,{month:'short'})}</small></span>}<span><strong>{entry.title||'(untitled)'}</strong><span className="quiet small">{logDateLabel(entry.date)}{entry.place?` · ${entry.place}`:''}</span><span className="log-list-preview">{entry.contributors.map(person=>person.note).filter(Boolean).join(' · ')}</span></span>{entry.membership==='invited'?<span className="log-invited-tag">Invited</span>:entry.contributors.length>1?<Users size={18}/>:null}</button>)}</div>;
}
