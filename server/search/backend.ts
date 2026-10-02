import {createHash} from 'node:crypto';
import {config} from '../config';
import {workGate} from '../workGate';
import {DIMENSIONS} from './model';

export type RetrievalKind='public'|'chat'|'log'|'memory';
export interface RetrievalDocument {
 id:string;sourceKey:string;kind:RetrievalKind;ownerId:string;viewerIds?:string[];
 sourceHash:string;sourceRevision:string;indexVersion:string;text:string;vector:number[];
 dataset?:string;entityId?:string;messageId?:string;offset?:number;role?:string;
 createdAt:string;generation?:number;memberCount?:number;invitedCount?:number;area?:{lon:number;lat:number};interests?:string[];
}
export interface RetrievalHit {id:string;score:number;sourceHash:string;sourceRevision:string;sourceKey:string;ownerId:string;messageId?:string;offset?:number}
export type RetrievalCondition=Record<string,unknown>;
export interface RetrievalFilter {must?:RetrievalCondition[];must_not?:RetrievalCondition[];should?:RetrievalCondition[]}
export const retrievalEnabled=()=>Boolean(config.QDRANT_URL);
const gate=workGate(8,128),initializing=new Map<string,Promise<void>>();
const notificationCollection=()=>`${config.SEARCH_NAMESPACE}_${config.APP_ENV}_notification_rules_v1`;
const collection=(kind:RetrievalKind)=>`${config.SEARCH_NAMESPACE}_${config.APP_ENV}_${kind==='public'?'public':'private'}_v2`;
export function retrievalPointId(id:string){const hex=createHash('sha256').update(id).digest('hex').slice(0,32);return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
async function request<T>(path:string,method='GET',body?:unknown):Promise<T>{
 if(!config.QDRANT_URL)throw Error('retrieval_unconfigured');
 const root=new URL(config.QDRANT_URL);
 if(root.protocol!=='https:'&&!(root.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(root.hostname)))throw Error('retrieval_requires_tls');
 return gate.run(async()=>{
  const response=await fetch(new URL(path,root),{method,headers:{'Content-Type':'application/json',...(config.QDRANT_API_KEY?{'api-key':config.QDRANT_API_KEY}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error(`retrieval_http_${response.status}`);
  const value=await response.json() as {result:T};return value.result;
 });
}
export async function ensureNotificationRuleCollection(){
 const name=notificationCollection(),key=`${config.QDRANT_URL}:${name}`;
 let pending=initializing.get(key);if(pending)return pending;
 pending=(async()=>{const exists=await request<{exists:boolean}>(`/collections/${name}/exists`);if(!exists.exists)await request(`/collections/${name}`,'PUT',{vectors:{size:DIMENSIONS,distance:'Cosine',on_disk:true},on_disk_payload:true,hnsw_config:{on_disk:true,max_indexing_threads:1}});await request(`/collections/${name}/index?wait=true`,'PUT',{field_name:'kind',field_schema:'keyword'});})().catch(error=>{initializing.delete(key);throw error;});initializing.set(key,pending);return pending;
}
export async function upsertNotificationRuleVector(id:string,kind:string,vector:number[]){
 if(vector.length!==DIMENSIONS||!vector.every(Number.isFinite))throw Error('notification_vector_invalid');
 await ensureNotificationRuleCollection();await request(`/collections/${notificationCollection()}/points?wait=true&ordering=strong`,'PUT',{points:[{id:retrievalPointId(`notification:${id}`),vector,payload:{id,kind}}]});
}
export async function deleteNotificationRuleVector(id:string){await ensureNotificationRuleCollection();await request(`/collections/${notificationCollection()}/points/delete?wait=true&ordering=strong`,'POST',{points:[retrievalPointId(`notification:${id}`)]});}
export async function matchNotificationRules(kind:string,vector:number[],offset=0,limit=50){
 if(vector.length!==DIMENSIONS||!vector.every(Number.isFinite))throw Error('notification_vector_invalid');
 await ensureNotificationRuleCollection();const result=await request<{points:{score:number;payload:{id?:string}}[]}>(`/collections/${notificationCollection()}/points/query`,'POST',{query:vector,filter:{must:[{key:'kind',match:{value:kind}}]},score_threshold:0.55,offset,limit,with_payload:['id'],with_vector:false,params:{hnsw_ef:128},timeout:8});
 return result.points.flatMap(point=>typeof point.payload?.id==='string'&&Number.isFinite(point.score)?[{id:point.payload.id,score:point.score}]:[]);
}
export async function ensureRetrievalCollection(kind:RetrievalKind){
 const name=collection(kind),key=`${config.QDRANT_URL}:${name}`;
 let pending=initializing.get(key);if(pending)return pending;
 pending=(async()=>{
  const exists=await request<{exists:boolean}>(`/collections/${name}/exists`);
  if(!exists.exists)await request(`/collections/${name}`,'PUT',{vectors:{dense:{size:DIMENSIONS,distance:'Cosine',on_disk:true}},sparse_vectors:{lexical:{modifier:'idf',index:{on_disk:true}}},on_disk_payload:true,hnsw_config:{on_disk:true,max_indexing_threads:1},optimizers_config:{max_optimization_threads:1}});
  for(const field of ['id','sourceKey','kind','ownerId','viewerIds','sourceHash','sourceRevision','indexVersion','dataset','entityId','messageId','role','interests'])await request(`/collections/${name}/index?wait=true`,'PUT',{field_name:field,field_schema:field==='viewerIds'?{type:'keyword',is_tenant:true}:'keyword'});
  await request(`/collections/${name}/index?wait=true`,'PUT',{field_name:'createdAt',field_schema:'datetime'});
  await request(`/collections/${name}/index?wait=true`,'PUT',{field_name:'area',field_schema:'geo'});
  for(const field of ['generation','memberCount','invitedCount'])await request(`/collections/${name}/index?wait=true`,'PUT',{field_name:field,field_schema:'integer'});
 })().catch(error=>{initializing.delete(key);throw error;});initializing.set(key,pending);return pending;
}
export async function purgeRetrievalChat(userId:string,generation:number){
 await ensureRetrievalCollection('chat');
 await request(`/collections/${collection('chat')}/points/delete?wait=true&ordering=strong`,'POST',{filter:{must:[{key:'kind',match:{value:'chat'}},{key:'ownerId',match:{value:userId}},{key:'generation',range:{lt:generation}}]}});
}
export async function retrievalRevisions(kind:RetrievalKind,ids:string[]){
 await ensureRetrievalCollection(kind);
 if(!ids.length)return new Map<string,{id:string;sourceRevision:string;indexVersion:string}>();
 const points=await request<{payload:{id:string;sourceRevision:string;indexVersion:string}}[]>(`/collections/${collection(kind)}/points`,'POST',{ids:ids.map(retrievalPointId),with_payload:['id','sourceRevision','indexVersion'],with_vector:false});
 return new Map(points.filter(point=>point.payload?.id).map(point=>[point.payload.id,point.payload]));
}
/** Every private query carries its audience filter inside retrieval, before top-k. */
export function retrievalScope(kind:RetrievalKind,userId:string|undefined,filter:RetrievalFilter={}):RetrievalFilter{
 if(kind!=='public'&&!userId)throw Error('retrieval_owner_required');
 return {...filter,must:[{key:'kind',match:{value:kind}},...(kind==='public'?[]:[{key:'viewerIds',match:{value:userId}}]),...(filter.must||[])]};
}
export async function replaceRetrievalSource(kind:RetrievalKind,sourceKey:string,documents:RetrievalDocument[]){
 await ensureRetrievalCollection(kind);
 if(documents.some(doc=>doc.kind!==kind||doc.sourceKey!==sourceKey||doc.vector.length!==DIMENSIONS||!doc.vector.every(Number.isFinite)||kind!=='public'&&!doc.viewerIds?.length))throw Error('retrieval_document_invalid');
 const points=documents.map(({text,vector,area,...payload})=>({id:retrievalPointId(payload.id),vector:{dense:vector,lexical:{text,model:'qdrant/bm25'}},payload:{...payload,...(area?{area}:{})}}));
 // The canonical source is authoritative. Stale results are reauthorized by the
 // caller and a durable reconciliation job repairs interrupted replacement.
 await request(`/collections/${collection(kind)}/points/batch?wait=true&ordering=strong`,'POST',{operations:[{delete:{filter:{must:[{key:'kind',match:{value:kind}},{key:'sourceKey',match:{value:sourceKey}}]}}},...(points.length?[{upsert:{points}}]:[])]});
}
export async function queryRetrieval(kind:RetrievalKind,userId:string|undefined,input:{query:string;vector?:number[];filter?:RetrievalFilter;limit?:number}){
 const filter=retrievalScope(kind,userId,input.filter),limit=Math.min(150,Math.max(1,input.limit||150));
 if(input.vector&&(input.vector.length!==DIMENSIONS||!input.vector.every(Number.isFinite)))throw Error('retrieval_vector_invalid');
 const lane=async(using:'dense'|'lexical',query:unknown)=>{
  const result=await request<{points:{score:number;payload:Record<string,unknown>}[]}>(`/collections/${collection(kind)}/points/query`,'POST',{query,using,filter,limit,with_vector:false,with_payload:['id','sourceHash','sourceRevision','sourceKey','ownerId','messageId','offset'],timeout:8});
  return (result.points||[]).flatMap(point=>{const p=point.payload;if(typeof p?.id!=='string'||typeof p.sourceHash!=='string'||typeof p.sourceRevision!=='string'||typeof p.sourceKey!=='string'||typeof p.ownerId!=='string'||!Number.isFinite(point.score))return [];return [{id:p.id,sourceHash:p.sourceHash,sourceRevision:p.sourceRevision,sourceKey:p.sourceKey,ownerId:p.ownerId,score:point.score,...(typeof p.messageId==='string'?{messageId:p.messageId}:{}),...(typeof p.offset==='number'?{offset:p.offset}:{})}];}) as RetrievalHit[];
 };
 const [lexical,dense]=await Promise.all([input.query.trim()?lane('lexical',{text:input.query,model:'qdrant/bm25'}):Promise.resolve([]),input.vector?lane('dense',input.vector):Promise.resolve([])]);
 return {lexical,dense};
}

/** Metadata-only pages for bounded orphan/version reconciliation. */
export async function retrievalPage(kind:'public'|'chat',offset?:string){
 await ensureRetrievalCollection(kind);
 return request<{points:{id:string;payload:{id:string;kind:RetrievalKind;sourceKey:string;ownerId:string;sourceRevision:string;indexVersion:string}}[];next_page_offset:string|null}>(`/collections/${collection(kind)}/points/scroll`,'POST',{limit:50,...(offset?{offset}:{}),with_vector:false,with_payload:['id','kind','sourceKey','ownerId','sourceRevision','indexVersion']});
}
