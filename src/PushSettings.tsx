import { useEffect, useRef, useState } from 'react';
import { api, post, errorText } from './api';

type State = { inboxPush?: boolean; publicKey: string | null; devices: { deviceId: string }[] };
function deviceId() {
  const previous = localStorage.getItem('nd-push-device');
  if (previous && /^[0-9a-f-]{36}$/i.test(previous)) return previous;
  const id = crypto.randomUUID(); localStorage.setItem('nd-push-device', id); return id;
}
export function PushSettings({ userId }: { userId: string }) {
  const [state, setState] = useState<State>();
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const registration = useRef<ServiceWorkerRegistration>(null);
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const standalone = matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const [id] = useState(() => { try { return deviceId(); } catch { return ''; } });
  useEffect(() => {
    if (!supported || !id || ios && !standalone) return;
    let cancelled = false;
    void (async () => {
      const info = await api<State>('/push');
      if (cancelled) return;
      setState(info);
      if (!info.publicKey) return;
      await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      const worker = await navigator.serviceWorker.ready;
      const subscription = await worker.pushManager.getSubscription();
      if (!cancelled) { registration.current = worker; setState({ ...info, devices: subscription ? info.devices : info.devices.filter(device => device.deviceId !== id) }); setReady(true); }
    })().catch(reason => { if (!cancelled) setError(errorText(reason)); });
    return () => { cancelled = true; };
  }, [userId, supported, id, ios, standalone]);
  const enabled = state?.devices.some(device => device.deviceId === id) && Notification.permission === 'granted';
  const toggle = async () => {
    setBusy(true); setError('');
    try {
      if (enabled) {
        await post('/push/unsubscribe', { deviceId: id });
        await (await registration.current?.pushManager.getSubscription())?.unsubscribe();
        setState(current => current && { ...current, devices: current.devices.filter(device => device.deviceId !== id) });
      } else {
        // Must be called directly from the tap, before any asynchronous setup.
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') { setError('Notifications are off. You can change permission in your device or browser settings.'); return; }
        const worker = registration.current;
        if (!worker || !state?.publicKey) return;
        let subscription = await worker.pushManager.getSubscription();
        const key = Uint8Array.from(atob(state.publicKey.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
        if (subscription?.options.applicationServerKey && Array.from(new Uint8Array(subscription.options.applicationServerKey)).join() !== Array.from(key).join()) { await subscription.unsubscribe(); subscription = null; }
        subscription ||= await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        await post('/push/subscribe', { deviceId: id, endpoint: subscription.endpoint, keys: subscription.toJSON().keys });
        setState(current => current && { ...current, devices: [...current.devices.filter(device => device.deviceId !== id), { deviceId: id }] });
      }
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  };
  return <div className="push-settings"><strong>Messages & invitations</strong>
    {ios && !standalone ? <p className="quiet">Add New Drugs to your Home Screen, then open it there to enable notifications.</p>
      : !supported ? <p className="quiet">Push notifications aren’t supported in this browser.</p>
        : !id ? <p className="quiet">Allow browser storage to enable notifications.</p>
          : state && !state.publicKey ? <p className="quiet">Push notifications aren’t available yet.</p>
            : <button className="solid" disabled={!ready || busy} onClick={() => void toggle()}>{busy ? 'Saving…' : enabled ? 'Turn off on this device' : 'Enable notifications'}</button>}
    {state && <label className="inbox-push-choice"><input type="checkbox" checked={Boolean(state.inboxPush)} onChange={event => { const value = event.target.checked; void post('/push/preferences', { inboxPush: value }).then(() => setState(current => current && { ...current, inboxPush: value })).catch(reason => setError(errorText(reason))); }} />Also notify me about agent inbox updates</label>}
    {error && <p role="status" className="quiet">{error}</p>}
  </div>;
}
