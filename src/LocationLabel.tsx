import {useSyncExternalStore} from 'react';
import {formatLocationLabel} from '../shared/locationLabel';
const mobileQuery='(max-width: 760px)';
const subscribe=(change:()=>void)=>{const media=window.matchMedia(mobileQuery);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);};
const mobile=()=>window.matchMedia(mobileQuery).matches;
/** Responsive text also works in attributes, including the saved-area placeholder. */
export function useLocationLabel(label:string|null|undefined){return formatLocationLabel(label,useSyncExternalStore(subscribe,mobile,()=>false));}
export function LocationLabel({label}:{label:string|null|undefined}){return <>{useLocationLabel(label)}</>;}
