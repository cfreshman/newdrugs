import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { errorText } from './api';
import { shareLink } from './shareLink';

// shareLink owns the normal native/copy flow. Its copy fallback is private, so
// retain that same fallback when canShare rejects a native share up front.
async function copyArtifactLink(url: string) {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); return; }
  const input = document.createElement('textarea');
  input.value = url; input.readOnly = true; input.style.position = 'fixed'; input.style.opacity = '0';
  document.body.append(input); input.select();
  try { if (!document.execCommand?.('copy')) throw new Error('Copy is unavailable.'); }
  finally { input.remove(); }
}

export function useArtifactShare({ id, title }: { id: string; title: string }): { share(): Promise<void>; sharing: boolean; copied: boolean; error: string; clearError(): void } {
  const [sharing, setSharing] = useState(false), [copied, setCopied] = useState(false), [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lifetime = useRef({ id, generation: 0, mounted: false, pending: false });
  useLayoutEffect(() => {
    const state = lifetime.current;
    state.id = id; state.generation++; state.mounted = true; state.pending = false;
    clearTimeout(timer.current); timer.current = undefined;
    setSharing(false); setCopied(false); setError('');
    return () => { state.mounted = false; state.pending = false; state.generation++; clearTimeout(timer.current); timer.current = undefined; };
  }, [id]);
  const share = useCallback(async () => {
    const state = lifetime.current;
    if (!state.mounted || state.id !== id || state.pending) return;
    const generation = state.generation;
    const current = () => state.mounted && state.id === id && state.generation === generation;
    state.pending = true;
    clearTimeout(timer.current); timer.current = undefined;
    setSharing(true); setCopied(false); setError('');
    try {
      const url = new URL(`/artifacts/${encodeURIComponent(id)}`, location.origin).href;
      let nativeAllowed = true;
      if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function') { try { nativeAllowed = navigator.canShare({ title, url }); } catch { nativeAllowed = false; } }
      const result = nativeAllowed ? await shareLink(url, title) : (await copyArtifactLink(url), 'copied' as const);
      if (current() && result === 'copied') {
        setCopied(true);
        timer.current = setTimeout(() => { timer.current = undefined; if (current()) setCopied(false); }, 1500);
      }
    } catch (cause) { if (current()) setError(errorText(cause)); }
    finally { if (current()) { state.pending = false; setSharing(false); } }
  }, [id, title]);
  const clearError = useCallback(() => { if (lifetime.current.mounted) setError(''); }, []);
  return { share, sharing, copied, error, clearError };
}
