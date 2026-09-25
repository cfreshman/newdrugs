import { CircleNotch } from '@phosphor-icons/react';
import { AgentMarkdown } from './AgentMarkdown';
import type { RunView } from '../shared/types';
import { agentStatusLabel } from '../shared/agentUi';
import { useProgressiveText } from './useProgressiveText';

// Matches Wayfinder's live message: content and a status row in the same bubble.
export function AgentLiveMessage({ run }: { run?: RunView | null }) {
  const label=agentStatusLabel({status:run?.status||'queued',phase:run?.phase,preamble:run?.preamble,cancelRequested:run?.cancelRequested});
  const animate=Boolean(run?.preamble)&&!run?.draft&&!run?.cancelRequested&&['queued','running'].includes(run?.status||'queued')&&(!run?.phase||['thinking','reading','discovering'].includes(run.phase));
  const statusText=useProgressiveText(label,animate,run?.id||'submitting');
  const draftText=useProgressiveText(run?.draft||'',Boolean(run)&&['queued','running'].includes(run!.status)&&!run?.cancelRequested&&!run?.outputComplete,`${run?.id||'submitting'}:draft`);
  return <article className="message assistant agent-live">
    <div className="bubble">
      {run?.draft && <AgentMarkdown text={draftText} />}
      {!run?.outputComplete && <div className={`agent-status ${run?.draft ? 'after-content' : ''}`} role="status" aria-label={label}>
        <CircleNotch className="agent-spinner" size={14} weight="bold" aria-hidden="true" />
        <span aria-hidden="true">{statusText}</span>
      </div>}
    </div>
  </article>;
}
