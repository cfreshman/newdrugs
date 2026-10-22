import { useEffect, useRef, useState, type FormEvent } from 'react';
import { DotsThree } from '@phosphor-icons/react';
import { ARTIFACT_MAX_INSTRUCTION_LENGTH, ARTIFACT_MAX_TITLE_LENGTH, type ArtifactDetail, type ArtifactSummary } from '../shared/artifacts';
import { operation, errorText } from './api';
import { DeleteConfirmation } from './DeleteConfirmation';
import { TransientError } from './TransientError';
import { useEdgeAwareMenu } from './useEdgeAwareMenu';
import './artifactControls.css';

export type ArtifactEditKind = 'title' | 'instruction' | 'delete';
interface ArtifactMenuProps {
  artifact: ArtifactDetail; refreshDisabled: boolean; historical?:boolean;
  onRefresh(): void | Promise<void>; onDiscuss(): void | Promise<void>; onEdit(kind: ArtifactEditKind): void;
  onChanged(value: ArtifactDetail): void; onError(message: string): void;
}
export function ArtifactMenu({ artifact, refreshDisabled, historical=false, onRefresh, onDiscuss, onEdit, onChanged, onError }: ArtifactMenuProps) {
  const menu = useRef<HTMLDetailsElement>(null), selected = useRef(artifact.id); selected.current = artifact.id;
  const pending = useRef(new Set<string>()), intent = useRef<{ signature: string; key: string } | null>(null);
  const [working, setWorking] = useState<string | null>(null), busy = working === artifact.id;
  useEdgeAwareMenu(menu, true);
  const close = () => { menu.current?.removeAttribute('open'); };
  const restoreFocus = () => menu.current?.querySelector('summary')?.focus({ preventScroll: true });
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (menu.current?.open && event.target instanceof Node && !menu.current.contains(event.target)) close(); };
    document.addEventListener('pointerdown', outside); return () => document.removeEventListener('pointerdown', outside);
  }, []);
  useEffect(() => { close(); }, [artifact.id]);
  const choose = (action: () => void | Promise<void>) => {
    close(); restoreFocus();
    try { void Promise.resolve(action()).catch(cause => onError(errorText(cause))); } catch (cause) { onError(errorText(cause)); }
  };
  const toggleLibrary = async () => {
    if (pending.current.has(artifact.id)) return;
    const source = artifact, input = { artifactId: source.id, revision: source.revision, ephemeral: !source.ephemeral }, signature = JSON.stringify(input);
    if (intent.current?.signature !== signature) intent.current = { signature, key: crypto.randomUUID() };
    const current = intent.current; pending.current.add(source.id); setWorking(source.id); close(); restoreFocus(); onError('');
    try {
      const summary = await operation<ArtifactSummary>('artifacts.update', input, { key: current.key });
      if (intent.current === current) intent.current = null;
      onChanged({ ...source, ...summary });
    } catch (cause) { if (selected.current === source.id) onError(errorText(cause)); }
    finally { pending.current.delete(source.id); setWorking(previous => previous === source.id ? null : previous); }
  };
  return <details className="conversation-menu profile-menu artifact-menu" data-artifact-menu="" ref={menu} onKeyDown={event => {
    if (event.key === 'Escape' && menu.current?.open) { event.preventDefault(); event.stopPropagation(); close(); restoreFocus(); }
  }}>
    <summary className="close artifact-menu-trigger" aria-label="Artifact actions"><DotsThree size={23} weight="regular" /></summary>
    <div>{!historical&&artifact.refreshInstruction && <button type="button" disabled={busy || refreshDisabled} onClick={() => choose(onRefresh)}>Refresh</button>}
      <button type="button" disabled={busy} onClick={() => choose(onDiscuss)}>Bring into chat</button>
      {!historical&&<><button type="button" disabled={busy} onClick={() => choose(() => onEdit('title'))}>Rename</button>
      <button type="button" disabled={busy} onClick={() => choose(() => onEdit('instruction'))}>Refresh instructions</button>
      <button type="button" disabled={busy} onClick={() => void toggleLibrary()}>{artifact.ephemeral ? 'Save to Artifacts' : 'Hide from Artifacts'}</button>
      <button type="button" disabled={busy} onClick={() => choose(() => onEdit('delete'))}>Delete</button></>}
    </div>
  </details>;
}

interface ArtifactEditorProps { artifact: ArtifactDetail; kind: ArtifactEditKind; cancel(): void; saved(value: ArtifactDetail): void; deleted(): void }
export function ArtifactEditor(props: ArtifactEditorProps) { return <ArtifactEditorForm key={`${props.artifact.id}:${props.kind}`} {...props} />; }
function ArtifactEditorForm({ artifact, kind, cancel, saved, deleted }: ArtifactEditorProps) {
  // Keep the exact starting revision and human draft across live metadata reads.
  const [base] = useState(artifact), [draft, setDraft] = useState(kind === 'title' ? artifact.title : artifact.refreshInstruction || '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = useRef(false), intent = useRef<{ signature: string; key: string } | null>(null);
  const perform = async (input: Record<string, unknown>, remove = false) => {
    if (pending.current) return;
    const signature = JSON.stringify({ remove, input });
    if (intent.current?.signature !== signature) intent.current = { signature, key: crypto.randomUUID() };
    pending.current = true; setBusy(true); setError('');
    try {
      if (remove) { await operation('artifacts.delete', input, { confirmed: true, key: intent.current.key }); deleted(); }
      else {
        const summary = await operation<ArtifactSummary>('artifacts.update', input, { key: intent.current.key });
        saved({ ...base, ...summary, ...(kind === 'instruction' ? { refreshInstruction: draft.trim() || null } : {}) });
      }
      intent.current = null;
    } catch (cause) { setError(errorText(cause)); }
    finally { pending.current = false; setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (kind === 'title' && !draft.trim()) return; void perform({ artifactId: base.id, revision: base.revision, ...(kind === 'title' ? { title: draft } : { refreshInstruction: draft.trim() ? draft : null }) }); };
  if (kind === 'delete') return <div className="artifact-editor">
    <DeleteConfirmation title="Delete this artifact?" detail="Its HTML, data and refresh instructions will be permanently removed. Original uploaded files stay in Storage." confirmLabel="Delete artifact" busy={busy} onCancel={cancel} onConfirm={() => perform({ artifactId: base.id, revision: base.revision }, true)} />
    {error && <TransientError className="error" role="alert">{error}</TransientError>}
  </div>;
  const unchanged = draft.trim() === (kind === 'title' ? base.title : base.refreshInstruction || '');
  return <form className="fields artifact-editor" onSubmit={submit} aria-busy={busy || undefined}>
    {kind === 'title' ? <label>Title<input autoFocus value={draft} maxLength={ARTIFACT_MAX_TITLE_LENGTH} disabled={busy} onChange={event => setDraft(event.target.value)} /></label>
      : <label>Refresh instructions<textarea autoFocus rows={9} value={draft} maxLength={ARTIFACT_MAX_INSTRUCTION_LENGTH} disabled={busy} onChange={event => setDraft(event.target.value)} /></label>}
    <div className="button-row"><button className="solid" type="submit" disabled={busy || unchanged || kind === 'title' && !draft.trim()}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="text-link" disabled={busy} onClick={cancel}>Cancel</button></div>
    {error && <TransientError className="error" role="alert">{error}</TransientError>}
  </form>;
}
