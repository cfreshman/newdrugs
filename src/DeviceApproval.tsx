import {TransientError} from './TransientError';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {api,post,errorText} from './api';
import {normalizeUserCode,type DevicePreview} from '../shared/agentAccess';
import {NavLink} from './NavLink';
export function DeviceApproval({initialCode='',registered,handle,onAccount}:{initialCode?:string;registered:boolean;handle?:string;onAccount():void}){
 const [code,setCode]=useState(initialCode),[request,setRequest]=useState<DevicePreview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[expiry,setExpiry]=useState('');
 const lookup=useRef(0);
 const load=async(value:string)=>{const normalized=normalizeUserCode(value);if(!normalized){setError('Enter the code shown by your agent.');return;}const revision=++lookup.current;setBusy(true);setRequest(null);setError('');try{const next=await api<DevicePreview>(`/agent-login/device?code=${encodeURIComponent(normalized)}`);if(revision===lookup.current){setRequest(next);setCode(normalized);}}catch(e){if(revision===lookup.current)setError(errorText(e));}finally{if(revision===lookup.current)setBusy(false);}};
 useEffect(()=>{if(initialCode&&registered)void load(initialCode);return()=>{lookup.current++;};},[initialCode,registered]);
 const approve=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!request||busy)return;setBusy(true);setError('');const form=new FormData(event.currentTarget);try{setRequest(await post<DevicePreview>('/agent-login/approve',{userCode:request.userCode,access:{name:form.get('name'),scope:form.get('scope'),expiresInDays:expiry==='custom'?Number(form.get('customExpiry')):expiry?Number(expiry):null}}));}catch(e){setError(errorText(e));}finally{setBusy(false);}};
 const deny=async()=>{if(!request||busy)return;setBusy(true);setError('');try{setRequest(await post<DevicePreview>('/agent-login/deny',{userCode:request.userCode}));}catch(e){setError(errorText(e));}finally{setBusy(false);}};
 return <div className="device-approval">
  <p>Connect the agent that showed you this code. Its credentials will be saved on that computer.</p>
  {registered&&handle&&<p>Signed in as @{handle}.</p>}
  {!registered?<NavLink className="solid wide" to={{view:'agents',resourceId:'device',query:normalizeUserCode(code)||undefined}} navigate={onAccount}>Sign in or save your account</NavLink>:<>
   {!request?<form className="fields" onSubmit={event=>{event.preventDefault();void load(code);}}><label>Approval code<input aria-label="Approval code" value={code} onChange={event=>setCode(event.target.value)} maxLength={32} autoCapitalize="characters" autoComplete="off"/></label><button type="submit" className="solid" disabled={busy}>Continue</button></form>:<>
    <p><strong>{request.userCode}</strong></p>
    {request.status==='pending'?<form className="fields" onSubmit={approve}>
     <label>Connection name<input name="name" defaultValue={request.name} maxLength={60}/></label>
     <label>Access<select name="scope" defaultValue={request.scope}><option value="write">Read and take actions for me</option><option value="read">Read only</option></select></label>
     <label>Expires<select value={expiry} onChange={event=>setExpiry(event.target.value)}><option value="">No expiry</option><option value="7">After 7 days</option><option value="30">After 30 days</option><option value="90">After 90 days</option><option value="365">After one year</option><option value="custom">Choose a number of days</option></select></label>
     {expiry==='custom'&&<label>Days until expiry<input name="customExpiry" type="number" min={1} max={3650} required defaultValue={30}/></label>}
     <p className="quiet small">Connected agents can read your private chat and, with write access, act for you. Revoke access in Connected agents whenever you want.</p>
     <div className="panel-actions"><button type="button" onClick={()=>void deny()} disabled={busy}>Deny</button><button className="solid" type="submit" disabled={busy}>Approve</button></div>
    </form>:<p role="status">{request.status==='approved'?'Approved. Your agent can finish connecting.':'Denied. No access was granted.'}</p>}
   </>}
  </>}
  {error&&<TransientError className="error" role="alert">{error}</TransientError>}
 </div>;
}
