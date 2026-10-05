import {TransientError} from './TransientError';
import {useEffect,useState,type FormEvent} from 'react';
import type {PublicKeyCredentialCreationOptionsJSON} from '@simplewebauthn/browser';
import {api,post,errorText} from './api';

interface SavedPasskey {id:string;createdAt:string;lastUsedAt:string|null}
type Action={kind:'add'}|{kind:'remove';id:string};

export function PasskeysSettings(){
 const [items,setItems]=useState<SavedPasskey[]>([]),[action,setAction]=useState<Action|null>(null),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const supported=typeof window!=='undefined'&&window.isSecureContext&&'PublicKeyCredential' in window;
 const load=async()=>setItems((await api<{items:SavedPasskey[]}>('/account/passkeys')).items);
 useEffect(()=>{void load().catch(error=>setError(errorText(error)));},[]);
 const choose=(next:Action)=>{setAction(next);setPassword('');setError('');setNotice('');};
 const save=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(!action||busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   if(action.kind==='add'){
    const options=await post<PublicKeyCredentialCreationOptionsJSON>('/account/passkeys/register/options',{currentPassword:password});
    const {startRegistration}=await import('@simplewebauthn/browser');
    const response=await startRegistration({optionsJSON:options});
    await post('/account/passkeys/register/complete',{response});
    setNotice('Passkey added.');
   }else{
    await post('/account/passkeys/remove',{id:action.id,currentPassword:password});
    setNotice('Passkey removed.');
   }
   await load();setAction(null);setPassword('');
  }catch(error){setError(errorText(error));}finally{setBusy(false);}
 };
 return <section className="passkey-settings"><h3>Passkeys</h3>
  {items.length>0?<div className="passkey-list">{items.map(item=><div className="passkey-row" key={item.id}><span>Added {new Date(item.createdAt).toLocaleDateString()}</span><button type="button" className="text-link" disabled={busy} onClick={()=>choose({kind:'remove',id:item.id})}>Remove</button></div>)}</div>:<p className="quiet small">Sign in with your device or password manager.</p>}
  {!action&&supported&&<button type="button" className="solid" disabled={busy} onClick={()=>choose({kind:'add'})}>Add passkey</button>}
  {action&&<form className="fields" onSubmit={event=>void save(event)}><label>Current password<input type="password" autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} required/></label><div className="panel-actions"><button type="button" disabled={busy} onClick={()=>{setAction(null);setPassword('');}}>Cancel</button><button className="solid" disabled={busy}>{action.kind==='add'?'Add passkey':'Remove passkey'}</button></div></form>}
  {notice&&<p role="status">{notice}</p>}{error&&<TransientError className="error" role="alert">{error}</TransientError>}
 </section>;
}
