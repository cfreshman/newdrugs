import {activeRecordInterests} from './recordInterests';
import {post} from './api';
import { useEffect, useRef } from 'react';
import type { LiveChange, LiveStateEvent } from '../shared/liveState';

export function useLiveState(userId: string | undefined, includeChat: boolean, apply: (change: LiveChange, actorId: string) => void, recover: () => Promise<void>) {
  const callbacks = useRef({ apply, recover }); callbacks.current = { apply, recover };
  useEffect(() => {
    if (!userId || typeof EventSource === 'undefined') return;
    const channel=crypto.randomUUID();let interestsTimer:ReturnType<typeof setTimeout>|undefined,wasAway=document.hidden;
    let source: EventSource | undefined, stopped = false, connected=false,retryMs=1500,reconnect: ReturnType<typeof setTimeout> | undefined;
    const interests=()=>{clearTimeout(interestsTimer);interestsTimer=setTimeout(()=>{if(!stopped)void post('/events/interests',{channel,keys:activeRecordInterests()}).catch(()=>{});},50);};
    const connect = () => {
      if (stopped) return;
      source = new EventSource(`/api/events?channel=${channel}&records=${encodeURIComponent(activeRecordInterests().join(','))}&chat=${includeChat?'1':'0'}`);
      source.addEventListener('open',()=>{connected=true;retryMs=1500;interests();});
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
        try { const data = JSON.parse((event as MessageEvent).data); if (Array.isArray(data.keys)) window.dispatchEvent(new CustomEvent('newdrugs:records', { detail: data })); }
        catch (error) { console.error('Record update:', error); }
      });
      source.addEventListener('auth-changed', () => { connected=false;source?.close(); reconnect = setTimeout(() => { void callbacks.current.recover().catch(() => {}); connect(); }, 1000); });
      source.onerror = () => {
        connected=false;source?.close();
        if (!stopped){const delay=retryMs;retryMs=Math.min(30000,retryMs*2);reconnect = setTimeout(() => { void callbacks.current.recover().catch(() => {}); connect(); }, delay);}
      };
    };
    connect();window.addEventListener('newdrugs:interests',interests);
    const online=()=>{if(stopped||connected)return;clearTimeout(reconnect);source?.close();void callbacks.current.recover().catch(()=>{}).finally(connect);};
    window.addEventListener('online',online);
    const away=()=>{wasAway=true;};
    const visibility=()=>{if(document.hidden)wasAway=true;else focus();};
    const focus = () => { if (wasAway&&!document.hidden){wasAway=false;void callbacks.current.recover().catch(() => {});} };
    window.addEventListener('blur',away);document.addEventListener('visibilitychange',visibility);
    window.addEventListener('focus', focus);
    return () => { stopped = true; source?.close(); clearTimeout(reconnect);clearTimeout(interestsTimer);window.removeEventListener('newdrugs:interests',interests);window.removeEventListener('online',online);window.removeEventListener('blur',away);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus', focus); };
  }, [userId,includeChat]);
}
