/* Bounded account-scoped cache for marked Log photos and profile pictures. */
(function(scope) {
  const MiB=1024*1024;
  function createLogImageCache({factory=indexedDB,estimate=()=>navigator.storage?.estimate?.()||Promise.resolve({}),now=Date.now,maxBytes=32*MiB,maxItems=384,maxAge=14*86400000}={}) {
    let opening,queue=Promise.resolve(),generation=0;
    const owners=new Map();
    const run=work=>{const next=queue.then(work);queue=next.catch(()=>{});return next;};
    const database=()=>opening||(opening=new Promise((resolve,reject)=>{
      const request=factory.open('newdrugs-log-images',1);
      const timer=setTimeout(()=>reject(Error('Image cache unavailable')),1500);
      request.onupgradeneeded=()=>{const db=request.result;db.createObjectStore('meta',{keyPath:'key'});db.createObjectStore('blobs');db.createObjectStore('state');};
      request.onerror=()=>{clearTimeout(timer);reject(request.error);};request.onblocked=()=>{clearTimeout(timer);reject(Error('Image cache blocked'));};
      request.onsuccess=()=>{clearTimeout(timer);request.result.onversionchange=()=>{request.result.close();opening=undefined;};resolve(request.result);};
    }));
    const read=async(store,key)=>{const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(store),req=key===undefined?tx.objectStore(store).getAll():tx.objectStore(store).get(key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});};
    const write=async(work)=>{const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(['meta','blobs','state'],'readwrite');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('Cache transaction failed'));tx.onerror=()=>{};work(tx);});};
    const remove=(tx,key)=>{tx.objectStore('meta').delete(key);tx.objectStore('blobs').delete(key);};
    const account=()=>read('state','account');
    const clear=()=>run(async()=>{generation++;owners.clear();await write(tx=>{tx.objectStore('meta').clear();tx.objectStore('blobs').clear();tx.objectStore('state').delete('account');});});
    const bind=id=>run(async()=>{const previous=await account();if(previous===id)return;generation++;owners.clear();await write(tx=>{tx.objectStore('meta').clear();tx.objectStore('blobs').clear();if(id)tx.objectStore('state').put(id,'account');else tx.objectStore('state').delete('account');});});
    const get=(id,fileId)=>run(async()=>{
      if(!id||await account()!==id)return null;const key=`${id}:${fileId}`,meta=await read('meta',key);if(!meta)return null;
      if(now()-meta.storedAt>maxAge){await write(tx=>remove(tx,key));return null;}
      const blob=await read('blobs',key);if(!blob)return null;
      await write(tx=>tx.objectStore('meta').put({...meta,accessedAt:now()}));return {...meta,blob};
    });
    const put=(id,fileId,blob,mime,ticket)=>run(async()=>{
      if(ticket!==generation||!id||await account()!==id||blob.size>2*MiB||!blob.size||!/^image\/(webp|png|jpeg)$/.test(mime))return false;
      const all=await read('meta'),key=`${id}:${fileId}`,current=all.reduce((n,x)=>n+x.size,0),storage=await estimate().catch(()=>({}));
      const budget=Math.max(0,Math.min(maxBytes,Number.isFinite(storage.quota)?storage.quota*.1:maxBytes,Number.isFinite(storage.quota)&&Number.isFinite(storage.usage)?current+Math.max(0,storage.quota-storage.usage)*.25:maxBytes));
      if(blob.size>budget)return false;
      const remaining=all.filter(x=>x.key!==key&&now()-x.storedAt<=maxAge).sort((a,b)=>a.accessedAt-b.accessedAt),discard=all.filter(x=>x.key!==key&&now()-x.storedAt>maxAge).map(x=>x.key);
      let bytes=remaining.reduce((n,x)=>n+x.size,0)+blob.size;
      while(remaining.length>=maxItems||bytes>budget){const old=remaining.shift();if(!old)break;discard.push(old.key);bytes-=old.size;}
      const save=()=>write(tx=>{for(const old of discard)remove(tx,old);tx.objectStore('blobs').put(blob,key);tx.objectStore('meta').put({key,account:id,fileId,entryId:owners.get(fileId)||all.find(m=>m.key===key)?.entryId,size:blob.size,mime,storedAt:now(),accessedAt:now(),validatedAt:now()});});
      try{await save();return true;}catch(error){if(error?.name!=='QuotaExceededError')throw error;await write(tx=>{for(const old of remaining.slice(0,Math.ceil(remaining.length/2)))remove(tx,old.key);});try{await save();return true;}catch{return false;}}
    });
    const invalidate=(id,{fileId,entryId,entries}={})=>run(async()=>{
      if(!id||await account()!==id)return;const all=await read('meta'),removeKeys=[],updates=[];
      if(fileId||entryId){generation++;for(const [file,owner] of owners)if(file===fileId||owner===entryId)owners.delete(file);for(const m of all)if(m.fileId===fileId||entryId&&m.entryId===entryId)removeKeys.push(m.key);}
      if(entries){for(const entry of entries){const ids=new Set(entry.fileIds);for(const [file,owner] of owners)if(owner===entry.id&&!ids.has(file)){generation++;owners.delete(file);}for(const file of ids)owners.set(file,entry.id);for(const m of all)if(ids.has(m.fileId)&&m.entryId!==entry.id)updates.push({...m,entryId:entry.id});for(const m of all)if(m.entryId===entry.id&&!ids.has(m.fileId))removeKeys.push(m.key);}while(owners.size>4096)owners.delete(owners.keys().next().value);}
      if(removeKeys.length||updates.length){if(removeKeys.length)generation++;await write(tx=>{for(const item of updates)tx.objectStore('meta').put(item);for(const key of removeKeys)remove(tx,key);});}
    });
    const stats=()=>run(async()=>{const all=await read('meta');return {items:all.length,bytes:all.reduce((n,m)=>n+m.size,0)};});
    return {account,bind,clear,get,put,invalidate,stats,ticket:()=>generation};
  }
  scope.createLogImageCache=createLogImageCache;
  if(typeof scope.addEventListener!=='function'||typeof indexedDB==='undefined')return;
  const cache=createLogImageCache(),inflight=new Map();
  scope.addEventListener('message',event=>{
    const message=event.data;if(!message?.type?.startsWith('log-images:')||!event.source?.url||new URL(event.source.url).origin!==scope.location.origin)return;
    const work=(async()=>{
      if(message.type==='log-images:account')await cache.bind(typeof message.account==='string'?message.account:null);
      else if(message.type==='log-images:clear')await cache.clear();
      else if(message.type==='log-images:invalidate')await cache.invalidate(await cache.account(),message);
      event.ports?.[0]?.postMessage({ok:true});
    })().catch(()=>event.ports?.[0]?.postMessage({ok:false}));event.waitUntil(work);
  });
  scope.addEventListener('fetch',event=>{
    const url=new URL(event.request.url);
    if(event.request.method!=='GET'||event.request.mode==='navigate'||event.request.headers.has('range')||url.origin!==scope.location.origin||url.searchParams.get('log-image')!=='1'&&url.searchParams.get('avatar')!=='1'||!/^\/api\/files\/[^/]+$/.test(url.pathname))return;
    const fileId=url.pathname.split('/').at(-1);
    event.respondWith((async()=>{
      let account,cached;try{account=await cache.account();cached=await cache.get(account,fileId);}catch{/* Normal loading works without IndexedDB. */}
      const refresh=()=>{
        const key=`${account}:${fileId}`;if(inflight.has(key))return inflight.get(key);
        const ticket=cache.ticket(),work=(async()=>{
          const response=await fetch(event.request);
          if(response.ok){const mime=response.headers.get('content-type')?.split(';')[0]||'',length=Number(response.headers.get('content-length'));if(account&&/^image\/(webp|png|jpeg)$/.test(mime)&&length<=2*MiB)await cache.put(account,fileId,await response.clone().blob(),mime,ticket).catch(()=>{});}
          else if([401,403,404,410].includes(response.status)){await cache.invalidate(account,{fileId}).catch(()=>{});if(response.status===401)await cache.clear().catch(()=>{});const client=await scope.clients?.get(event.clientId);client?.postMessage({type:'log-images:unavailable',fileId});}
          return response;
        })().finally(()=>inflight.delete(key));inflight.set(key,work);return work;
      };
      if(cached){if(Date.now()-cached.validatedAt>60000)event.waitUntil(refresh().catch(()=>{}));return new Response(cached.blob,{headers:{'Content-Type':cached.mime,'Cache-Control':'private, no-store','X-NewDrugs-Image-Cache':'hit'}});}
      return (await refresh()).clone();
    })());
  });
})(self);
