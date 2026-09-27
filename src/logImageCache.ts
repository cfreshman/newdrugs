let registration:Promise<ServiceWorkerRegistration>|undefined,account:string|null|undefined;
const post=async(message:Record<string,unknown>,wait=false)=>{
 try {
 if(!('serviceWorker' in navigator))return;
 const worker=navigator.serviceWorker.controller||(await registration?.catch(()=>undefined))?.active;if(!worker)return;
 if(!wait){worker.postMessage(message);return;}
 await new Promise<void>(resolve=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve();},1000);channel.port1.onmessage=()=>{clearTimeout(timer);channel.port1.close();resolve();};worker.postMessage(message,[channel.port2]);});
 }catch{/* Caching must never interrupt app requests or sign-out. */}
};
export function startLogImageCache(){
 if(!('serviceWorker' in navigator)||registration)return;
 registration=navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
 const bind=()=>{if(account!==undefined)void post({type:'log-images:account',account});};
 navigator.serviceWorker.addEventListener('controllerchange',bind);
 navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='log-images:unavailable')window.dispatchEvent(new CustomEvent('newdrugs:records',{detail:['log']}));});
 void registration.then(()=>navigator.serviceWorker.ready).then(bind).catch(()=>{});
}
export function bindLogImageCache(id:string|null){account=id;void post({type:'log-images:account',account});}
export async function clearLogImageCache(){account=null;await post({type:'log-images:clear'},true);}
export function logImageUrl(url:string){if(!url.startsWith('/api/files/'))return url;const parsed=new URL(url,location.origin);parsed.searchParams.set('log-image','1');return parsed.pathname+parsed.search;}
export function updateLogImageCache(name:string,input:unknown,result:unknown){
 const request=input as {fileId?:string;entryId?:string},data=result as any;
 if(['files.delete','files.discard'].includes(name))void post({type:'log-images:invalidate',fileId:request.fileId});
 if(['log.leave','log.delete'].includes(name))void post({type:'log-images:invalidate',entryId:request.entryId});
 if(!name.startsWith('log.'))return;
 const entries=[...(data?.items||[]),...(data?.id?[data]:[]),data?.previous,data?.next].filter(item=>item?.id&&Array.isArray(item.contributors)).map(item=>({id:item.id,fileIds:item.contributors.flatMap((person:any)=>person.files||[]).map((file:any)=>file.id)}));
 if(entries.length)void post({type:'log-images:invalidate',entries});
}
