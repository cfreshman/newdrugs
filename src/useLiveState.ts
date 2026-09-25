import { useEffect, useRef } from 'react';
import type { LiveChange, LiveStateEvent } from '../shared/liveState';

export function useLiveState(userId: string | undefined, apply: (change: LiveChange, actorId: string) => void, recover: () => Promise<void>) {
  const callbacks = useRef({ apply, recover }); callbacks.current = { apply, recover };
  useEffect(() => {
    if (!userId || typeof EventSource === 'undefined') return;
    let source: EventSource | undefined, stopped = false, reconnect: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (stopped) return;
      source = new EventSource('/api/events');
      let epoch = '', sequence = 0;
      source.addEventListener('state', event => {
        if (stopped) return;
        try {
          const update = JSON.parse((event as MessageEvent).data) as LiveStateEvent;
          if (update.userId !== userId) return;
          if (update.epoch !== epoch) { epoch = update.epoch; sequence = 0; }
          if (update.sequence <= sequence) return;
          sequence = update.sequence;
          callbacks.current.apply(update.change, update.userId);
        } catch (error) { console.error('Live state update:', error); }
      });
      source.addEventListener('records', event => {
        if (stopped) return;
        try { const data = JSON.parse((event as MessageEvent).data); if (Array.isArray(data.keys)) window.dispatchEvent(new CustomEvent('newdrugs:records', { detail: data.keys })); }
        catch (error) { console.error('Record update:', error); }
      });
      source.addEventListener('auth-changed', () => { source?.close(); reconnect = setTimeout(() => { void callbacks.current.recover().catch(() => {}); connect(); }, 1000); });
      source.onerror = () => {
        source?.close();
        if (!stopped) reconnect = setTimeout(() => { void callbacks.current.recover().catch(() => {}); connect(); }, 1500);
      };
    };
    connect();
    const focus = () => { if (!document.hidden) void callbacks.current.recover().catch(() => {}); };
    window.addEventListener('focus', focus);
    return () => { stopped = true; source?.close(); clearTimeout(reconnect); window.removeEventListener('focus', focus); };
  }, [userId]);
}
