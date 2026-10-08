import {TransientError} from './TransientError';
import {useRecordRefresh} from './useRecordRefresh';
import {useEffect,useState} from 'react';
import {CircleNotch} from '@phosphor-icons/react';
import type {Wallet} from '../shared/types';
import type {BillingActivityItem} from '../shared/billingActivity';
import {operation,money,errorText} from './api';
export function billingDateRange(startedAt:string,endedAt:string){
 const start=new Date(startedAt),end=new Date(endedAt),date=(value:Date)=>value.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}),time=(value:Date)=>value.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
 if(startedAt===endedAt)return date(start);
 return date(start)===date(end)?`${date(start)}, ${time(start)} - ${time(end)}`:`${date(start)} - ${date(end)}`;
}
export function BillingActivity({wallet}:{wallet:Wallet}){
 const [open,setOpen]=useState(false),[indexing,setIndexing]=useState(false),[items,setItems]=useState<BillingActivityItem[]|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0);
 useRecordRefresh(['billing_activity'],()=>{if(open)setRetry(value=>value+1);});
 useEffect(()=>{if(!open)return;const abort=new AbortController();setLoading(true);setError('');void operation<{items:BillingActivityItem[];indexing?:boolean}>('wallet.activity',{}, {signal:abort.signal}).then(result=>{if(!abort.signal.aborted){setItems(result.items);setIndexing(Boolean(result.indexing));}}).catch(reason=>{if(!abort.signal.aborted)setError(errorText(reason));}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();},[open,wallet.entries,retry]);
 return <details className="details" onToggle={event=>setOpen(event.currentTarget.open)}><summary>Activity</summary>
  <p className="small quiet">Charges follow reported AI usage and may arrive after a reply. Balances are shown in cents; smaller charges appear below. Hosting is paid by us.</p>
  <div aria-busy={loading||indexing}>{(!items||!items.length)&&(loading||indexing)&&<CircleNotch className="spin" size={20} aria-label="Loading activity"/>}<ul className="ledger">{items?.map(item=><li key={item.id}><div><span>{item.label}</span>{item.model&&<span className="ledger-model">{item.model}</span>}<span className="ledger-date">{billingDateRange(item.startedAt,item.endedAt)}</span></div><span>{item.amountNanos>0?'+':item.amountNanos<0?'−':''}{money(Math.abs(item.amountNanos),item.amountNanos<0)}</span></li>)}</ul>{items&&!items.length&&!indexing&&!loading&&<p className="quiet">No charges yet.</p>}</div>
  {indexing&&<p className="quiet small">Updating activity…</p>}
  {error&&<TransientError className="error" role="status">{error} <button type="button" onClick={()=>setRetry(value=>value+1)}>Retry</button></TransientError>}
 </details>;
}
