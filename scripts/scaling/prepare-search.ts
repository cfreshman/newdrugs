import {readFile} from 'node:fs/promises';
import dotenv from 'dotenv';
const stage=process.argv[2];if(!['dev','prod'].includes(stage))throw Error('Choose dev or prod. This copies existing embeddings, without model calls.');
const appEnv=stage==='prod'?'production':'staging',settings=dotenv.parse(await readFile(`/etc/newdrugs/${stage}.env`)),service=dotenv.parse(await readFile(`/etc/newdrugs-search/${stage}.env`));
Object.assign(process.env,settings,{APP_ENV:appEnv,QDRANT_URL:`http://127.0.0.1:${stage==='prod'?7337:7336}`,QDRANT_API_KEY:service.QDRANT__SERVICE__API_KEY,OPENAI_API_KEY:'',MEDIA_STORAGE:'local'});
const {connectDatabase,rows,mongo}=await import('../../server/db'),{backfillRetrieval,replicateRetrievalOne}=await import('../../server/search/replication');
await connectDatabase();
try{
 const ids=['public','chat','log'].map(kind=>`backfill:${kind}`);if(process.argv.includes('--reconcile'))await rows('retrievalMeta').updateMany({_id:{$in:ids}},{$set:{done:false,cursor:'',againAt:0}});
 let complete=false;
 for(let pass=0;pass<200;pass++){
  await backfillRetrieval();let processed=0;while(processed<150&&await replicateRetrievalOne())processed++;
  const done=await rows('retrievalMeta').countDocuments({_id:{$in:ids},done:true}),pending=await rows('retrievalJobs').countDocuments({});
  if(done===3&&pending===0){complete=true;break;}
  if(done===3&&!processed&&pending)throw Error('Some retrieval jobs need retry before activation.');
 }
 if(!complete)throw Error('Preparation reached its bounded batch limit; rerun to continue.');
 console.log(JSON.stringify({stage,existingEmbeddingsCopied:true,pendingJobs:0,modelCalls:0}));
}finally{await mongo.close();}
