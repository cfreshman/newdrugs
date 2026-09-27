import {destinationPath,parseDestination,type Destination} from '../shared/navigation';
const key='nd-auth-return';
export function rememberAuthReturn(destination:Destination){try{const path=destinationPath(destination);if(parseDestination(path,location.origin))sessionStorage.setItem(key,JSON.stringify({path,expires:Date.now()+60*60*1000}));}catch{/* In-memory return still works without storage. */}}
export function readAuthReturn():Destination|null{try{const value=JSON.parse(sessionStorage.getItem(key)||'null');if(!value||typeof value.path!=='string'||!value.path.startsWith('/')||value.path.startsWith('//')||typeof value.expires!=='number'||value.expires<Date.now()){sessionStorage.removeItem(key);return null;}return parseDestination(value.path,location.origin);}catch{return null;}}
export function clearAuthReturn(){try{sessionStorage.removeItem(key);}catch{/* Optional persistence. */}}
