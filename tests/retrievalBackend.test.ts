import {afterEach,expect,it,vi} from 'vitest';
import {config} from '../server/config';
import {queryRetrieval,replaceRetrievalSource,retrievalScope,retrievalPointId} from '../server/search/backend';
import {publicRetrievalFilter} from '../server/search/retrieve';
import {DIMENSIONS,INDEX_VERSION} from '../server/search/model';
const previous={url:config.QDRANT_URL,key:config.QDRANT_API_KEY,namespace:config.SEARCH_NAMESPACE};
it('excludes hidden profiles inside both indexed retrieval lanes, with an explicit override',async()=>{
 config.QDRANT_URL='https://retrieval.invalid';
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({result:{points:[]}})));vi.stubGlobal('fetch',fetcher);
 const input={query:'walks',datasets:['profiles','posts'] as ('profiles'|'posts')[],mode:'hybrid' as const,limit:20};
 const hidden={must:[{key:'dataset',match:{value:'profiles'}},{key:'ownerId',match:{any:['hidden']}}]};
 const filter=publicRetrievalFilter(input,'me',[],null,[],['hidden']);
 await queryRetrieval('public',undefined,{query:input.query,vector:Array(DIMENSIONS).fill(1),filter});
 expect(fetcher).toHaveBeenCalledTimes(2);
 for(const [,options] of fetcher.mock.calls as unknown as [URL,RequestInit][])expect(JSON.parse(String(options.body)).filter.must_not).toContainEqual(hidden);
 expect(publicRetrievalFilter({...input,includeHidden:true},'me',[],null,[],['hidden']).must_not).not.toContainEqual(hidden);
});
afterEach(()=>{config.QDRANT_URL=previous.url;config.QDRANT_API_KEY=previous.key;config.SEARCH_NAMESPACE=previous.namespace;vi.unstubAllGlobals();});
it('applies private audience and caller filters separately to both retrieval lanes, with bounded output',async()=>{
 config.QDRANT_URL='https://retrieval.invalid';config.QDRANT_API_KEY='fixture-key';
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({result:{points:[]}})));vi.stubGlobal('fetch',fetcher);
 await queryRetrieval('chat','owner',{query:'testing',vector:Array(DIMENSIONS).fill(1),limit:10000,filter:{must:[{key:'role',match:{value:'user'}}]}});
 expect(fetcher).toHaveBeenCalledTimes(2);
 for(const [url,options] of fetcher.mock.calls as unknown as [URL,RequestInit][]){const input=JSON.parse(String(options.body));expect(url.pathname).toContain('_private_v2/points/query');expect(input.limit).toBe(150);expect(input.with_vector).toBe(false);expect(input.filter.must).toEqual([{key:'kind',match:{value:'chat'}},{key:'viewerIds',match:{value:'owner'}},{key:'role',match:{value:'user'}}]);}
 expect(()=>retrievalScope('chat',undefined)).toThrow('retrieval_owner_required');
});
it('persists vectors and server-generated lexical weights without storing raw text in payloads',async()=>{
 config.QDRANT_URL='https://retrieval.invalid';config.SEARCH_NAMESPACE='fixture_index';
 const fetcher=vi.fn(async(url:URL)=>new Response(JSON.stringify({result:url.pathname.endsWith('/exists')?{exists:true}:{}})));vi.stubGlobal('fetch',fetcher);
 await replaceRetrievalSource('public','posts:one',[{id:'posts:one',sourceKey:'posts:one',kind:'public',ownerId:'owner',sourceHash:'hash',sourceRevision:'rev',indexVersion:INDEX_VERSION,text:'a weekend hike',vector:Array(DIMENSIONS).fill(1),createdAt:'2026-09-27T00:00:00Z'}]);
 const write=(fetcher.mock.calls as unknown as [URL,RequestInit][]).find(([url])=>url.pathname.endsWith('/points/batch'))!;
 const point=JSON.parse(String(write[1].body)).operations[1].upsert.points[0];expect(point.vector.lexical).toEqual({text:'a weekend hike',model:'qdrant/bm25'});expect(point.payload.text).toBeUndefined();expect(point.id).toBe(retrievalPointId('posts:one'));
});
it('carries dataset, author, visibility and collection constraints into indexed retrieval',()=>{
 const filter=publicRetrievalFilter({query:'walks',datasets:['threads'],mode:'hybrid',limit:20,authorId:'friend'},'me',['blocked'],{authorIds:new Set(['friend'])},['posts:excluded']);
 expect(filter.must).toContainEqual({key:'dataset',match:{any:['posts','replies']}});expect(filter.must).toContainEqual({key:'ownerId',match:{any:['friend']}});expect(filter.must).toContainEqual({key:'ownerId',match:{value:'friend'}});expect(filter.must_not).toContainEqual({key:'ownerId',match:{any:['blocked']}});expect(filter.must_not).toContainEqual({key:'id',match:{any:['posts:excluded']}});
});
