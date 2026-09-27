import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import dotenv from 'dotenv';
const stage=process.argv[2];if(!['dev','prod'].includes(stage))throw Error('Choose dev or prod. This probe uses disposable synthetic collections only.');
const appEnv=stage==='prod'?'production':'staging';
const environment=dotenv.parse(await readFile(`/etc/newdrugs/${stage}.env`)),service=dotenv.parse(await readFile(`/etc/newdrugs-search/${stage}.env`));
const namespace=`newdrugs_probe_${randomUUID().replaceAll('-','')}`,url=`http://127.0.0.1:${stage==='prod'?7337:7336}`,key=service.QDRANT__SERVICE__API_KEY;
Object.assign(process.env,environment,{QDRANT_URL:url,QDRANT_API_KEY:key,SEARCH_NAMESPACE:namespace,APP_ENV:appEnv,MEDIA_STORAGE:'local'});
const {replaceRetrievalSource,queryRetrieval}=await import('../../server/search/backend');
const vector=Array(512).fill(0).map((_,i)=>i===0?1:0),names=[`${namespace}_${appEnv}_public_v2`,`${namespace}_${appEnv}_private_v2`];
try{
 const base={ownerId:'probe-a',sourceHash:'fixture',sourceRevision:'1',indexVersion:'fixture',text:'tennis in the park',vector,createdAt:'2026-09-27T00:00:00Z'};
 await replaceRetrievalSource('public','public-a',[{...base,id:'public-a',sourceKey:'public-a',kind:'public',dataset:'posts'}]);
 await replaceRetrievalSource('chat','chat-a',[{...base,id:'chat-a',sourceKey:'chat-a',kind:'chat',viewerIds:['probe-a'],generation:0}]);
 const publicResults=await queryRetrieval('public',undefined,{query:'tennis',vector}),mine=await queryRetrieval('chat','probe-a',{query:'tennis',vector}),other=await queryRetrieval('chat','probe-b',{query:'tennis',vector});
 if(!publicResults.dense.some(item=>item.id==='public-a')||!publicResults.lexical.some(item=>item.id==='public-a'))throw Error('Public dense or lexical retrieval failed.');
 if(!mine.dense.some(item=>item.id==='chat-a')||!mine.lexical.some(item=>item.id==='chat-a')||other.dense.length||other.lexical.length)throw Error('Private retrieval isolation failed.');
 await replaceRetrievalSource('chat','chat-a',[]);const deleted=await queryRetrieval('chat','probe-a',{query:'tennis',vector});if(deleted.dense.length||deleted.lexical.length)throw Error('Deletion propagation failed.');
 console.log('Persistent retrieval contract passed: dense, lexical, owner filtering and deletion. No model calls.');
}finally{
 for(const name of names){const response=await fetch(`${url}/collections/${name}`,{method:'DELETE',headers:{'api-key':key},signal:AbortSignal.timeout(10000)});if(!response.ok&&response.status!==404)console.error('Probe cleanup failed',{collection:name,status:response.status});}
}
