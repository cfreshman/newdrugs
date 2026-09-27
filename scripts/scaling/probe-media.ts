import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import dotenv from 'dotenv';
const stage=process.argv[2];if(stage!=='dev')throw Error('This contract probe is restricted to dev.');
Object.assign(process.env,dotenv.parse(await readFile('/etc/newdrugs/dev.env')),dotenv.parse(await readFile('/etc/newdrugs/dev-object.env')),{APP_ENV:'staging'});
const {connectDatabase,mongo,rows}=await import('../../server/db');
const {stageObjectWrite,readObjectFile,objectBody,deleteObjectFile}=await import('../../server/objectStorage');
await connectDatabase();
const bytes=Buffer.from(`New Drugs storage probe ${randomUUID()}`),hash=createHash('sha256').update(bytes).digest('hex');
let staged:Awaited<ReturnType<typeof stageObjectWrite>>|undefined;
try{
 console.log('Checking private object write.');
 staged=await stageObjectWrite(randomUUID(),bytes,'application/octet-stream',hash);
 console.log('Checking authenticated full read.');
 if(!(await readObjectFile(staged.location,bytes.length,hash)).equals(bytes))throw Error('Full retrieval mismatch.');
 console.log('Checking range read.');
 const partial=await objectBody(staged.location,bytes.length,hash,{start:1,end:9});const parts:Buffer[]=[];for await(const part of partial.body!)parts.push(Buffer.from(part));if(!Buffer.concat(parts).equals(bytes.subarray(1,10)))throw Error('Range retrieval mismatch.');
 console.log('Checking authenticated HEAD.');
 await objectBody(staged.location,bytes.length,hash,undefined,true);
 const url=`https://${staged.location.bucket}.nyc3.digitaloceanspaces.com/${staged.location.key}`;
 console.log('Checking anonymous denial.');
 const anonymous=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(10000)});if(anonymous.status!==403)throw Error(`Anonymous object was not private (${anonymous.status}).`);
 console.log('Private media contract passed: checksum, full retrieval, byte range, HEAD and anonymous denial.');
}finally{
 if(staged){await deleteObjectFile(staged.location);await rows('mediaWriteIntents').deleteOne({_id:staged.intentId});}
 await mongo.close();
}
