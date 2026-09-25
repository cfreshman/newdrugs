import { config as loadEnv } from 'dotenv';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
loadEnv({path:'.env.cloud-test',override:true,quiet:true});
process.env.STARTER_POOL_DB='newdrugs_test';
const {connectDatabase,db,mongo}=await import('../server/db');
const {embed}=await import('../server/search/embeddings');
const {PublicIndex}=await import('../server/search/index');
const {bm25,words,termCounts,fuse,hybridRank,dot}=await import('../server/search/ranking');
await connectDatabase();if(db().databaseName!=='newdrugs_test')throw new Error('Cloud test database required.');
const fixtures=JSON.parse(await readFile('tests/fixtures/search-judgments.json','utf8')) as {topic:string;profile:string;post:string;queries:string[]}[];
async function parallel<T,R>(items:T[],run:(item:T,index:number)=>Promise<R>){const output:R[]=Array(items.length);let next=0;await Promise.all(Array.from({length:4},async()=>{while(next<items.length){const i=next++;output[i]=await run(items[i],i);}}));return output;}
try{
 const documents=fixtures.flatMap(item=>['profile','post'].map(kind=>({id:`${item.topic}:${kind}`,topic:item.topic,text:item[kind as 'profile'|'post']})));
 const cachePath='.data/research/semantic-eval-vectors.json';const cached=await readFile(cachePath,'utf8').then(JSON.parse).catch(()=>null);const vectors:number[][]=cached?.documents?.join('|')===documents.map(doc=>doc.text).join('|')?cached.vectors:await parallel(documents,doc=>embed(doc.text,'query'));await writeFile(cachePath,JSON.stringify({documents:documents.map(doc=>doc.text),vectors}));
 const index=new PublicIndex();documents.forEach((doc,i)=>index.add({_id:doc.id,dataset:'posts',entityId:doc.id,ownerId:doc.topic,text:doc.text,evidence:[],terms:termCounts(doc.text),area:null,createdAt:'2026-09-25',sourceHash:'eval',sourceRevision:'eval',indexVersion:'eval',indexedAt:'',vector:vectors[i]}));
 const judgments=fixtures.flatMap(item=>item.queries.map(query=>({query,topic:item.topic}))),latencies:number[]=[];
 const results=await parallel(judgments,async judgment=>{const started=performance.now(),vector=await embed(judgment.query,'query');latencies.push(performance.now()-started);const dense=index.search(vector,new Set(documents.map(doc=>doc.id)),40);const lexical=bm25(words(judgment.query),documents.map(doc=>({id:doc.id,terms:termCounts(doc.text)})));const ranking=hybridRank(dense,lexical);const rank=ranking.findIndex(item=>documents.find(doc=>doc.id===item.id)?.topic===judgment.topic)+1;return {...judgment,rank,top:ranking.slice(0,5).map(item=>item.id),exactNearest:documents.map((doc,i)=>({id:doc.id,score:dot(vector,vectors[i])})).sort((a,b)=>b.score-a.score).slice(0,5).map(item=>item.id)};});
 const report={date:new Date().toISOString(),model:'text-embedding-3-small',dimensions:512,queries:results.length,documents:documents.length,top1:results.filter(result=>result.rank===1).length/results.length,recallAt5:results.filter(result=>result.rank<=5).length/results.length,mrr:results.reduce((sum,result)=>sum+1/result.rank,0)/results.length,embeddingP95ms:latencies.sort((a,b)=>a-b)[Math.floor(latencies.length*.95)],misses:results.filter(result=>result.rank>1)};
 await mkdir('.data/research',{recursive:true});await writeFile('.data/research/semantic-eval.json',JSON.stringify({report,results},null,2));console.log(JSON.stringify(report,null,2));
 if(report.recallAt5<.95||report.top1<.85)process.exitCode=1;
}finally{await mongo.close();}
