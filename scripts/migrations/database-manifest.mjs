import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(process.cwd()+'/package.json'),{MongoClient,BSON}=require('mongodb');
const secrets=JSON.parse(await readFile('/etc/newdrugs/database.json','utf8'));
const client=new MongoClient('mongodb://127.0.0.1:7332/?authSource=admin&directConnection=true&replicaSet=rs0',{auth:{username:'newdrugs_admin',password:secrets.admin},maxPoolSize:3});
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
try{
 await client.connect();const result={};
 for(const name of ['newdrugs_prod','newdrugs_dev','newdrugs_shared']){
  const database=client.db(name),collections=await database.listCollections({},{nameOnly:true}).toArray();result[name]={};
  for(const {name:collection}of collections.sort((a,b)=>a.name.localeCompare(b.name))){
   if(collection.startsWith('system.'))continue;
   const table=database.collection(collection),indexes=await table.listIndexes().toArray();if(indexes.some(index=>index.expireAfterSeconds!==undefined))continue;
   const digest=createHash('sha256');let count=0;
   for await(const row of table.find({}).sort({_id:1}).batchSize(100)){digest.update(JSON.stringify(canonical(BSON.EJSON.serialize(row,{relaxed:false}))));digest.update('\n');count++;}
   result[name][collection]={count,sha256:digest.digest('hex')};
  }
 }
 console.log(JSON.stringify(result));
}finally{await client.close();}
