export interface AppReleaseState {observed:string|null;available:string|null}
const parts=(value:string)=>{const match=/^v?(\d+)\.(\d+)\.(\d+)$/.exec(value);return match?match.slice(1).map(Number):null;};
export function newerAppRelease(candidate:string,current:string){
 const next=parts(candidate),loaded=parts(current);if(!next||!loaded)return false;
 for(let index=0;index<3;index++){if(next[index]!==loaded[index])return next[index]>loaded[index];}
 return false;
}
/** Initial observation is quiet. Only a later server transition can request a reload. */
export function observeAppRelease(state:AppReleaseState,serverVersion:string|undefined,loadedVersion:string):AppReleaseState{
 if(!serverVersion||serverVersion===state.observed)return state;
 if(state.observed===null)return {observed:serverVersion,available:null};
 return {observed:serverVersion,available:newerAppRelease(serverVersion,loadedVersion)?serverVersion:null};
}
export async function applyAppRelease(close:()=>void|Promise<void>,schedule:(callback:FrameRequestCallback)=>number=requestAnimationFrame,reload:()=>void=()=>window.location.reload()){
 await close();schedule(()=>reload());
}
