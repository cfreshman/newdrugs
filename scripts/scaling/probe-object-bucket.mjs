import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import dotenv from 'dotenv';
import {S3Client,PutObjectCommand,GetObjectCommand,HeadObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
const stage=process.argv[2];if(!['dev','prod'].includes(stage))throw Error('Choose dev or prod.');
const settings=dotenv.parse(await readFile(`.data/credentials/${stage}-object.env`));
if(settings.OBJECT_BUCKET!==`newdrugs-cfreshman-${stage}`||settings.OBJECT_ENDPOINT!=='https://nyc3.digitaloceanspaces.com')throw Error('Unexpected bucket configuration.');
const client=new S3Client({endpoint:settings.OBJECT_ENDPOINT,region:'us-east-1',credentials:{accessKeyId:settings.OBJECT_ACCESS_KEY_ID,secretAccessKey:settings.OBJECT_SECRET_ACCESS_KEY},requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',maxAttempts:2});
const Key=`newdrugs/${stage}/_probe/${randomUUID()}`,Bucket=settings.OBJECT_BUCKET,bytes=Buffer.from(`Private bucket probe ${randomUUID()}`),hash=createHash('sha256').update(bytes).digest('hex');let attempted=false;
try{
 attempted=true;await client.send(new PutObjectCommand({Bucket,Key,Body:bytes,ContentMD5:createHash('md5').update(bytes).digest('base64'),Metadata:{sha256:hash}}),{abortSignal:AbortSignal.timeout(30000)});
 const result=await client.send(new GetObjectCommand({Bucket,Key}));if(!Buffer.from(await result.Body.transformToByteArray()).equals(bytes)||result.Metadata?.sha256!==hash)throw Error('Checksum mismatch.');
 const range=await client.send(new GetObjectCommand({Bucket,Key,Range:'bytes=1-9'}));if(!Buffer.from(await range.Body.transformToByteArray()).equals(bytes.subarray(1,10)))throw Error('Range mismatch.');
 await client.send(new HeadObjectCommand({Bucket,Key}));
 const anonymous=await fetch(`https://${Bucket}.nyc3.digitaloceanspaces.com/${Key}`,{method:'HEAD',signal:AbortSignal.timeout(10000)});if(anonymous.status!==403)throw Error('Anonymous access was not denied.');
 console.log(`${stage}: private bucket checksum, range, HEAD and anonymous-denial checks passed.`);
}catch(error){console.error('Bucket probe failed',{name:error.name,status:error.$metadata?.httpStatusCode});process.exitCode=1;}
finally{if(attempted)await client.send(new DeleteObjectCommand({Bucket,Key})).catch(error=>{console.error('Probe cleanup failed',{name:error.name});process.exitCode=1;});client.destroy();}
