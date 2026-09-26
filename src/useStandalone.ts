import {useSyncExternalStore} from 'react';
const query='(display-mode: standalone)';
const subscribe=(change:()=>void)=>{const media=window.matchMedia(query);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);};
const snapshot=()=>window.matchMedia(query).matches||(navigator as Navigator&{standalone?:boolean}).standalone===true;
export function useStandalone(){return useSyncExternalStore(subscribe,snapshot,()=>false);}
