import {randomUUID} from 'node:crypto';
import {connectDatabase,db,mongo,rows} from '../../server/db';
import {users,type User} from '../../server/auth';
import {processCircleWork} from '../../server/circle';
import {config} from '../../server/config';

if(new URL(config.MONGODB_URI).pathname!=='/newdrugs_test')throw Error('Isolated test database required');
await connectDatabase();
try{
 for(const collection of await db().collections())await collection.deleteMany({});
 const prefix=`probe-${randomUUID()}`,hub=`${prefix}-hub`,leaves=Array.from({length:50},(_,index)=>`${prefix}-${String(index).padStart(2,'0')}`);
 const base:User={_id:hub,handle:'hub',name:'Hub',bio:'',city:'',cityKey:'',interests:[],discoverable:true,balanceNanos:0,reservedNanos:0,createdAt:new Date().toISOString()};
 await users().insertMany([base,...leaves.map((id,index)=>({...base,_id:id,handle:`person${index}`,name:`Person ${index}`}))]);
 await rows('connections').insertMany(leaves.map(leaf=>({_id:[hub,leaf].sort().join(':'),members:[hub,leaf],status:'accepted',fromId:hub,toId:leaf,note:'',createdAt:new Date().toISOString()})));
 const started=Date.now();let ticks=0;
 for(;ticks<1000;ticks++){
  await processCircleWork();
  if((await rows('circleMeta').findOne({_id:'backfill'}))?.done&&!await rows('circleJobs').findOne({},{projection:{_id:1}}))break;
 }
 if(ticks===1000)throw Error('Circle workload did not drain');
 const count=await rows('circlePairs').countDocuments({});
 if(count!==1225)throw Error(`Expected 1225 candidate pairs, got ${count}`);
 const cursor=rows('circlePairs').find({members:leaves[0],mutualCount:{$gt:0}}).sort({mutualCount:-1,_id:1}).limit(20);
 const plan=await cursor.explain('executionStats');
 const examined=plan.executionStats.totalDocsExamined as number;
 if(examined>50)throw Error(`Circle page examined ${examined} documents for 20 results`);
 console.log(JSON.stringify({friends:50,materializedPairs:count,backgroundTicks:ticks+1,buildMs:Date.now()-started,pageSize:20,documentsExamined:examined}));
}finally{for(const collection of await db().collections())await collection.deleteMany({});await mongo.close();}
