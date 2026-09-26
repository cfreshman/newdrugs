import { AutomationSummary } from './AutomationsPanel';
import { operation } from './api';
import { useState } from 'react';
import type { RunView } from '../shared/types';
import { post, errorText } from './api';
import { PostPhotos } from './PostPhotos';
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
    {run.status === 'sleeping' && run.sleep && <div className="sleep-status"><p>{run.sleep.reason}</p><p className="quiet small">Resumes {new Date(run.sleep.until).toLocaleString()}. No AI runs while asleep.</p><div className="panel-actions"><button onClick={() => void operation('runs.wake', { runId: run.id }).then(refresh).catch(e => console.error(errorText(e)))}>Wake now</button><button onClick={() => void operation('runs.cancel', { runId: run.id }).then(refresh).catch(e => console.error(errorText(e)))}>Cancel</button></div></div>}
    {pending.length > 0 && <div className="action-review">
      {pending.map(action => <div className="review-action" key={action.id}>
        <p>{action.detail}</p>{action.automation && <AutomationSummary value={action.automation} />}{action.target && <p className="review-target">{action.target}</p>}
        {!action.automation && Object.entries(action.input).filter(([key]) => !key.endsWith('Id') && key !== 'fileIds').map(([key, value]) => <p key={key} className="review-content">{key === 'text' || key === 'note' || key === 'reason' ? String(value) : `${key}: ${String(value)}`}</p>)}
        {Array.isArray(action.input.fileIds) && <PostPhotos photos={action.input.fileIds.filter((id): id is string => typeof id === 'string').map((id, index) => ({ id, name: `Photo ${index + 1}`, url: `/api/files/${encodeURIComponent(id)}` }))} />}
        <div className="review-buttons"><button disabled={saving} onClick={() => void decide([action.id], false)}>Reject</button><button className="confirm" disabled={saving} onClick={() => void decide([action.id], true)}>Confirm</button></div>
      </div>)}
      {pending.length > 1 && <div className="review-buttons"><button disabled={saving} onClick={() => void decide(pending.map(a => a.id), false)}>Reject all</button><button className="confirm" disabled={saving} onClick={() => void decide(pending.map(a => a.id), true)}>Confirm all ({pending.length})</button></div>}
      <p className="quiet small">Or send a message to reject {pending.length > 1 ? 'these actions' : 'this action'} and change the request.</p>
    </div>}
    {run.status === 'waiting_for_input' && <button className="open-surface" onClick={open}>Open {run.surface?.view === 'profile' ? 'profile editor' : run.surface?.view}</button>}
    {run.error && <article className="message assistant"><div className="bubble">{run.error}</div></article>}
  </>;
}
