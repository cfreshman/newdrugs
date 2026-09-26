import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import type {AdminUserPage} from '../shared/adminUsers';
import {adminRequest} from './api';
const credit=(nanos:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Math.ceil(nanos/1e7)/100);
export function Users(){
  const [page,setPage]=useState<AdminUserPage|null>(null),[draft,setDraft]=useState(''),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const generation=useRef(0),inFlight=useRef(false);
  const load=useCallback(async(cursor?:string)=>{
    if(cursor&&inFlight.current)return;
    const ticket=++generation.current;inFlight.current=true;setBusy(true);setError('');
    try{const params=new URLSearchParams({query,limit:'25',...(cursor?{cursor}:{})});const next=await adminRequest<AdminUserPage>(`/users?${params}`);
      if(ticket===generation.current)setPage(previous=>cursor&&previous?{...next,items:[...new Map([...previous.items,...next.items].map(user=>[user.id,user])).values()]}:next);
    }catch(reason){if(ticket===generation.current)setError(reason instanceof Error?reason.message:'Could not load users.');}
    finally{if(ticket===generation.current){inFlight.current=false;setBusy(false);}}
  },[query]);
  useEffect(()=>{setPage(null);void load();return()=>{generation.current++;};},[load]);
  const search=(event:FormEvent)=>{event.preventDefault();const next=draft.trim();if(next===query)void load();else setQuery(next);};
  return <section className="admin-users" aria-busy={busy}>
    <div className="users-heading"><h1>Users</h1>{page&&<span>{page.total.toLocaleString()} {query?'matches':'registered'} · {page.stage==='production'?'Production':page.stage==='staging'?'Dev':'Development'}</span>}</div>
    <form className="user-search" role="search" onSubmit={search}><input aria-label="Search users" placeholder="Name or username" value={draft} maxLength={120} onChange={event=>setDraft(event.target.value)}/><button className="primary" type="submit" disabled={busy}>Search</button><button className="secondary" type="button" disabled={busy} onClick={()=>void load()}>Refresh</button></form>
    {page&&<><div className="users-table"><table><thead><tr><th>User</th><th>Created</th><th>Credit</th><th>Status</th></tr></thead><tbody>{page.items.map(user=><tr key={user.id}><td title={user.id}><strong>{user.name||`@${user.handle}`}</strong>{user.name&&<span className="user-handle">@{user.handle}</span>}</td><td><time dateTime={user.createdAt}>{new Date(user.createdAt).toLocaleDateString()}</time></td><td className="user-credit">{credit(user.balanceNanos)}{user.reservedNanos>0&&<small>{credit(user.reservedNanos)} held</small>}</td><td><span className={user.suspended?'user-suspended':''}>{user.suspended?'Suspended':'Active'}</span></td></tr>)}</tbody></table></div>{!page.items.length&&<p className="note">{query?'No users match that search.':'No registered users yet.'}</p>}{page.nextCursor&&<button className="secondary" type="button" disabled={busy} onClick={()=>void load(page.nextCursor!)}>More users</button>}</>}
    {busy&&!page&&<p role="status">Loading users…</p>}{error&&<p className="error" role="alert">{error}</p>}
  </section>;
}
