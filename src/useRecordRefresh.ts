import { useEffect, useRef } from 'react';

export function useRecordRefresh(keys: string[], refresh: () => void | Promise<void>) {
  const latest = useRef(refresh); latest.current = refresh;
  const scope = keys.join(',');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const invalidate = (event: Event) => {
      if (!(event instanceof CustomEvent) || !event.detail.some((key: string) => scope.split(',').includes(key))) return;
      clearTimeout(timer); timer = setTimeout(() => { void latest.current(); }, 75);
    };
    window.addEventListener('newdrugs:records', invalidate);
    return () => { clearTimeout(timer); window.removeEventListener('newdrugs:records', invalidate); };
  }, [scope]);
}
