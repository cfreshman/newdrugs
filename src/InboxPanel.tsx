import {TransientError} from './TransientError';
import {DeleteConfirmation} from './DeleteConfirmation';
import { useEffect, useRef, useState } from 'react';
import { AgentMarkdown } from './AgentMarkdown';
import { operation, errorText } from './api';
import { useRecordRefresh } from './useRecordRefresh';
import { usePanelVisible } from './PanelReadiness';
import type { InboxItem } from '../shared/inbox';
import type { Destination } from '../shared/navigation';
import {destinationPath} from '../shared/navigation';
import {NavLink} from './NavLink';
export function InboxPanel({ itemId, navigate, discuss }: { itemId?: string; navigate(destination: Destination): void; discuss(item: InboxItem): void }) {
  const [scope, setScope] = useState<'all'|'unread'|'archived'>('all'), [items, setItems] = useState<InboxItem[]>([]), [item, setItem] = useState<InboxItem>();
  const [cursor, setCursor] = useState<string|null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [removing, setRemoving] = useState(false);
  const visible = usePanelVisible(), generation = useRef(0);
  const load = async (before?: string) => {
    const ticket = ++generation.current; setLoading(true);
    try {
      if (itemId) { const update = await operation<InboxItem>('inbox.get', { itemId }); if (ticket === generation.current) setItem(update); }
      else { const page = await operation<{items:InboxItem[];nextCursor:string|null}>('inbox.list', {scope,...(before?{before}:{})}); if (ticket === generation.current) { setItems(prior=>before?[...prior,...page.items]:page.items);setCursor(page.nextCursor); } }
      if(ticket === generation.current)setError('');
    } catch (e) { if(ticket === generation.current)setError(errorText(e)); }
    finally { if(ticket === generation.current)setLoading(false); }
  };
  useEffect(()=>{if(visible)void load();return()=>{generation.current++;};},[itemId,scope,visible]);
  useRecordRefresh(['inbox'],()=>{if(visible)void load();});
  useEffect(()=>{if(itemId&&visible)void operation('inbox.mark_read',{itemId,read:true}).catch(e=>setError(errorText(e)));},[itemId,visible]);
  const archive = async () => { try { setItem(await operation<InboxItem>('inbox.archive',{itemId,archived:!item?.archived})); }catch(e){setError(errorText(e));} };
  if(itemId)return <>{item && <article className="agent-update"><h3>{item.title}</h3><p className="quiet small">{item.producer.name} · {new Date(item.createdAt).toLocaleString()}</p><AgentMarkdown text={item.body}/>{item.links.length>0&&<div className="delivery-links">{item.links.map(link=><AgentMarkdown key={link.url} text={`[${link.title.replace(/[\[\]\\]/g,'')}](${link.url.replace(/\)/g,'%29')})`}/>)}</div>}<div className="panel-actions"><button className="solid" disabled={item.unavailable} onClick={()=>discuss(item)}>Bring into chat</button><button onClick={()=>void operation<InboxItem>('inbox.mark_read',{itemId,read:!item.read}).then(setItem).catch(e=>setError(errorText(e)))}>{item.read?'Mark unread':'Mark read'}</button><button onClick={()=>void archive()}>{item.archived?'Restore':'Archive'}</button>{item.automationId&&<NavLink to={{view:'automations',resourceId:item.automationId}} navigate={navigate}>Automation</NavLink>}<button onClick={()=>setRemoving(true)}>Delete</button></div>{removing&&<DeleteConfirmation title="Delete this update?" detail="This can’t be undone." confirmLabel="Delete update" onCancel={()=>setRemoving(false)} onConfirm={()=>operation('inbox.delete',{itemId},{confirmed:true}).then(()=>navigate({view:'inbox'})).catch(e=>setError(errorText(e)))}/>}</article>}{error&&<p role="status" className="error">{error}</p>}{loading&&!item&&<p className="quiet">Loading…</p>}</>;
  return <><div className="panel-actions"><NavLink to={{view:'automations'}} navigate={navigate}>Automations</NavLink></div><nav className="view-tabs" aria-label="Inbox filter">{(['all','unread','archived'] as const).map(value=><button key={value} aria-pressed={scope===value} onClick={()=>setScope(value)}>{value==='all'?'Updates':value==='unread'?'Unread':'Archived'}</button>)}</nav><div className="inbox-items">{items.map(update=>{const destination:Destination={view:'inbox',resourceId:update.id};return <a className="inbox-row" href={destinationPath(destination)} key={update.id} data-read={update.read||undefined} onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey){event.preventDefault();navigate(destination);}}}><strong>{update.title}</strong><span className="quiet small">{update.producer.name} · {new Date(update.createdAt).toLocaleDateString()} · {update.read?'Read':'Unread'}</span><div className="inbox-preview"><AgentMarkdown text={update.body} preview/></div></a>;})}</div>{!loading&&!items.length&&<><p className="quiet">Useful updates from your automations and connected agents appear here.</p><NavLink className="text-link" to={{view:'automations'}} navigate={navigate}>Try an automation</NavLink></>}{cursor&&<button className="text-link chat-search-more" onClick={()=>void load(cursor)}>More updates</button>}{error&&<TransientError className="error" role="status">{error}</TransientError>}</>;
}
