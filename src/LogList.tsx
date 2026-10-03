import {primeLogEntry} from './logEntryCache';
import {logImageUrl} from './logImageCache';
import {logDateLabel} from './logDate';
import type {LogEntry,LogCalendarTile} from '../shared/log';
import {logCover} from './logCalendarModel';
import {NavLink} from './NavLink';
import './log.css';
export function LogList<T extends LogEntry|LogCalendarTile>({entries,open}:{entries:T[];open(entry:T):void}){
 return <div className="log-list">{entries.map(entry=>{const people='contributors' in entry?[...entry.contributors.map(person=>person.name),...(entry.historicalPeople||[])].filter(Boolean).join(', '):'';return <NavLink key={entry.id} to={{view:'log',resourceId:entry.id}} navigate={()=>{if("contributors" in entry)primeLogEntry(entry);open(entry);}}>{logCover(entry)?<img src={logImageUrl(logCover(entry)!.url)} alt=""/>:<span className="log-list-date">{entry.date.slice(8)}<small>{new Date(`${entry.date}T12:00:00`).toLocaleDateString(undefined,{month:'short'})}</small></span>}<span><strong>{entry.title||'(untitled)'}</strong><span className="quiet small">{logDateLabel(entry.date)}</span><span className="log-list-people">{people||'\u00a0'}</span></span>{'membership' in entry&&entry.membership==='invited'&&<span className="log-invited-tag">Invited</span>}</NavLink>;})}</div>;
}
