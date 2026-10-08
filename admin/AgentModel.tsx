import {useEffect,useState,type FormEvent} from 'react';
import {adminRequest} from './api';
import type {AgentModelSettings} from '../shared/agentModel';

export function AgentModel(){
 const [settings,setSettings]=useState<AgentModelSettings|null>(null),[model,setModel]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useEffect(()=>{let active=true;void adminRequest<AgentModelSettings>('/agent-model').then(value=>{if(active){setSettings(value);setModel(value.model);}}).catch(error=>{if(active)setError(error.message);});return()=>{active=false;};},[]);
 const save=async(event:FormEvent)=>{
  event.preventDefault();if(!settings)return;setError('');setSaved(false);setBusy(true);
  try{const next=await adminRequest<{model:string;revision:number}>('/agent-model',{model:model.trim(),revision:settings.revision});setSettings({...settings,...next});setModel(next.model);setSaved(true);}
  catch(error){setError(error instanceof Error?error.message:'Could not update the model.');}finally{setBusy(false);}
 };
 return <section>
  <h1>Agent model</h1>
  <p>Set a model for new chats and automation runs. OpenAI models use the direct connection. Other providers use OpenRouter. Tasks already in progress keep their model.</p>
  {settings?<form onSubmit={save}>
   <label>Model<input required maxLength={150} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={model} onChange={event=>{setModel(event.target.value);setSaved(false);}} disabled={busy}/></label>
   <button className="primary" disabled={busy||!settings.keyConfigured||!model.trim()||model.trim()===settings.model}>{busy?'Validating…':'Save'}</button>
   {!settings.keyConfigured&&<p className="note">The provider key is not configured for this environment.</p>}
   {saved&&<p role="status">Saved.</p>}
  </form>:!error&&<p role="status">Loading…</p>}
  {error&&<p className="error" role="alert">{error}</p>}
 </section>;
}
