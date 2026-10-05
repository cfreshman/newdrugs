import {useEffect,useState,type FormEvent} from 'react';
import type {PaymentHandles} from '../shared/paymentHandles';
import {api,post,errorText} from './api';

export function PaymentHandlesSettings({userId}:{userId:string}){
 const [handles,setHandles]=useState<PaymentHandles|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{let active=true;setHandles(null);setError('');void api<PaymentHandles>('/account/payment-handles').then(value=>{if(active)setHandles(value);}).catch(cause=>{if(active)setError(errorText(cause));});return()=>{active=false;};},[userId]);
 const save=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(!handles||busy)return;
  const form=event.currentTarget,password=String(new FormData(form).get('currentPassword')||'');
  setBusy(true);setError('');setNotice('');
  try{const saved=await post<PaymentHandles>('/account/payment-handles',{...handles,currentPassword:password});setHandles(saved);form.reset();setNotice('Payment usernames saved.');}
  catch(cause){setError(errorText(cause));}
  finally{setBusy(false);}
 };
 return <section className="payment-handles-settings"><form className="fields" onSubmit={event=>void save(event)}>
  <label>Venmo username<input name="venmo-payment-handle" value={handles?.venmo||''} onChange={event=>setHandles(previous=>previous&&{...previous,venmo:event.target.value})} placeholder="@username" autoComplete="off" autoCapitalize="none" autoCorrect="off" disabled={!handles||busy}/></label>
  <label>Cash App $cashtag<input name="cash-app-payment-handle" value={handles?.cashApp||''} onChange={event=>setHandles(previous=>previous&&{...previous,cashApp:event.target.value})} placeholder="$cashtag" autoComplete="off" autoCapitalize="none" autoCorrect="off" disabled={!handles||busy}/></label>
  <label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required disabled={!handles||busy}/></label>
  <button className="solid" disabled={!handles||busy}>{busy?'Saving…':'Save payment apps'}</button>
  {notice&&<p role="status">{notice}</p>}{error&&<p role="alert" className="error">{error}</p>}
 </form></section>;
}
