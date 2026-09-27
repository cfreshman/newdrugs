const counts=new Map<string,number>();
export const activeRecordInterests=()=>[...counts.keys()].sort();
export function observeRecordInterests(keys:string[]){
 for(const key of keys)counts.set(key,(counts.get(key)||0)+1);
 window.dispatchEvent(new Event('newdrugs:interests'));
 return()=>{for(const key of keys){const count=(counts.get(key)||1)-1;if(count)counts.set(key,count);else counts.delete(key);}window.dispatchEvent(new Event('newdrugs:interests'));};
}
