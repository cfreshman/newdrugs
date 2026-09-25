import { useState } from 'react';
import type { RunView } from '../shared/types';
import { post, errorText } from './api';
export function RunProgress({ run, refresh, open }: { run: RunView; refresh(): Promise<void>; open(): void }) {
  const [saving, setSaving] = useState(false);
  const pending = run.approvals.filter(a => a.status === 'pending');
  const decide = async (ids: string[], approved: boolean) => {
    setSaving(true);
    try { await post(`/runs/${run.id}/decisions`, { revision: run.revision, decisions: ids.map(id => ({ id, approved })) }); await refresh(); }
    catch (e) { console.error('Review:', errorText(e)); await refresh(); }
    finally { setSaving(false); }
  };
  return <>
    {pending.length > 0 && <div className="action-review">
      {pending.map(action => <div className="review-action" key={action.id}>
        <p>{action.detail}</p>{action.target && <p className="review-target">{action.target}</p>}
        {Object.entries(action.input).filter(([key]) => !key.endsWith('Id')).map(([key, value]) => <p key={key} className="review-content">{key === 'text' || key === 'note' || key === 'reason' ? String(value) : `${key}: ${String(value)}`}</p>)}
        <div className="review-buttons"><button disabled={saving} onClick={() => void decide([action.id], false)}>Reject</button><button className="confirm" disabled={saving} onClick={() => void decide([action.id], true)}>Confirm</button></div>
      </div>)}
      {pending.length > 1 && <div className="review-buttons"><button disabled={saving} onClick={() => void decide(pending.map(a => a.id), false)}>Reject all</button><button className="confirm" disabled={saving} onClick={() => void decide(pending.map(a => a.id), true)}>Confirm all ({pending.length})</button></div>}
    </div>}
    {run.status === 'waiting_for_input' && <button className="open-surface" onClick={open}>Open {run.surface?.view === 'profile' ? 'profile editor' : run.surface?.view}</button>}
    {run.error && <article className="message assistant"><div className="bubble">{run.error}</div></article>}
  </>;
}
