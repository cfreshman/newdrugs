import {readFile} from 'node:fs/promises';
import dotenv from 'dotenv';
const stage=process.argv[2];if(stage!=='dev')throw Error('This tiny embedding probe uses the dev platform search budget.');
Object.assign(process.env,dotenv.parse(await readFile('/etc/newdrugs/dev.env')));
const {connectDatabase,mongo,rows}=await import('../../server/db'),{embed}=await import('../../server/search/embeddings'),{config}=await import('../../server/config');
await connectDatabase();
try{
 const day=new Date().toISOString().slice(0,10),budget=await rows('searchBudget').findOne({_id:day});console.log(JSON.stringify({configured:config.aiEnabled,budgetNanos:config.SEARCH_DAILY_BUDGET_NANOS,reservedOrSpentNanos:budget?.spentNanos||0}));
 const start=Date.now();try{const vector=await embed('New Drugs semantic connectivity check','query');console.log(JSON.stringify({dimensions:vector.length,milliseconds:Date.now()-start}));}catch(error){const e=error as {name?:string;message?:string;code?:string;status?:number;cause?:{name?:string;code?:string}};console.log(JSON.stringify({milliseconds:Date.now()-start,name:e.name,localCode:/^embedding_[a-z_]+$/.test(e.message||'')?e.message:undefined,code:e.code,status:e.status,causeName:e.cause?.name,causeCode:e.cause?.code}));process.exitCode=1;}
}finally{await mongo.close();}
