import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {MongoClient,type Db,type ClientSession} from 'mongodb';
import {z} from 'zod';
import dotenv from 'dotenv';
import {logFields,logContribution} from '../../shared/log';
import {MAX_ACCOUNT_UPLOAD_BYTES,MAX_UPLOAD_BYTES} from '../../shared/uploads';

const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const person=z.object({sourceId:z.string().min(1),name:z.string().min(1)});
const provenance=z.object({source:z.literal('logcal.app'),sourceId:z.string().min(1),sourceHash:z.string().length(64),version:z.literal(1),historicalPeople:z.array(person),originalLinks:z.array(z.string()).optional(),missingMedia:z.array(z.unknown())});
const entry=logFields.extend({_id:z.uuid(),ownerId:z.uuid(),members:z.array(z.uuid()).min(1).max(2),invited:z.array(z.never()),contributions:z.array(logContribution.extend({userId:z.uuid()})),historicalPeople:z.array(z.string()),revision:z.literal(1),createdAt:z.iso.datetime(),updatedAt:z.iso.datetime(),migration:provenance});
const upload=z.object({_id:z.uuid(),userId:z.uuid(),logEntryId:z.uuid(),purpose:z.literal('log_media'),name:z.string(),expectedBytes:z.number().int().positive().max(MAX_UPLOAD_BYTES),sourceHash:z.string().length(64),bytes:z.number().int().positive().max(MAX_UPLOAD_BYTES),mime:z.enum(['image/webp','audio/mp4','video/mp4']),sha256:z.string().length(64),ready:z.literal(true),retained:z.literal(true),referenceRevision:z.literal(1),createdAt:z.iso.datetime(),migration:z.object({source:z.literal('logcal.app'),sourceId:z.string(),sourceUrl:z.url(),kind:z.enum(['image','audio']),version:z.literal(1)})});
const schema=z.object({version:z.literal(1),source:z.literal('logcal.app'),sourceHash:z.string().length(64),exportedAt:z.iso.datetime(),accounts:z.array(z.object({sourceId:z.string(),handle:z.string(),userId:z.uuid(),birthday:z.object({month:z.number().int().min(1).max(12),day:z.number().int().min(1).max(31)}).nullable()})).min(1),entries:z.array(entry),uploads:z.array(upload),missing:z.array(z.unknown())});
export type LogcalPlan=z.infer<typeof schema>;
export function validateLogcalPlan(input:unknown):LogcalPlan{
 const plan=schema.parse(input),accounts=new Set(plan.accounts.map(a=>a.userId)),entries=new Map(plan.entries.map(e=>[e._id,e])),files=new Map(plan.uploads.map(f=>[f._id,f]));
 if(accounts.size!==plan.accounts.length||new Set(plan.accounts.map(a=>a.sourceId)).size!==plan.accounts.length||entries.size!==plan.entries.length||files.size!==plan.uploads.length||new Set(plan.entries.map(e=>e.migration.sourceId)).size!==plan.entries.length)throw Error('Duplicate migration identity');
 const referenced=new Set<string>();
 for(const row of plan.entries){if(row.members.some(id=>!accounts.has(id))||!accounts.has(row.ownerId)||new Set(row.members).size!==row.members.length||JSON.stringify([...row.members].sort())!==JSON.stringify(row.contributions.map(c=>c.userId).sort()))throw Error('Invalid contribution ownership');
  for(const contribution of row.contributions)for(const id of contribution.fileIds){const file=files.get(id);if(!file||file.userId!==contribution.userId||file.logEntryId!==row._id||referenced.has(id))throw Error('Invalid attachment ownership');referenced.add(id);}
  if(row.coverFileId&&(!row.contributions.some(c=>c.fileIds.includes(row.coverFileId!))||files.get(row.coverFileId)?.mime!=='image/webp'))throw Error('Invalid cover');
  if(JSON.stringify(row.historicalPeople)!==JSON.stringify(row.migration.historicalPeople.map(p=>p.name)))throw Error('Historical names mismatch');
 }
 if(referenced.size!==files.size)throw Error('Unreferenced media');return plan;
}
export async function importLogcal({db,client,input,preparedDir,targetDir,apply=false}:{db:Db;client:MongoClient;input:unknown;preparedDir:string;targetDir:string;apply?:boolean}){
 const plan=validateLogcalPlan(input),planHash=hash(JSON.stringify(plan)),receiptId=`logcal.app:${plan.sourceHash}`,receipts=db.collection('dataMigrations');
 const receipt=await receipts.findOne({_id:receiptId as any});
 if(receipt){if(receipt.planHash!==planHash)throw Error('A different plan was already imported for this snapshot');return {...receipt.summary,applied:false,alreadyApplied:true};}
 for(const file of plan.uploads){const bytes=await fs.readFile(path.join(preparedDir,file._id));if(bytes.length!==file.bytes||hash(bytes)!==file.sha256)throw Error(`Prepared media verification failed: ${file._id}`);}
 const additions=new Map(plan.accounts.map(a=>[a.userId,plan.uploads.filter(f=>f.userId===a.userId).reduce((sum,f)=>sum+f.bytes,0)]));
 const checks=async(session?:ClientSession)=>{
  const balances=[];
  for(const account of plan.accounts){const user=await db.collection('users').findOne({_id:account.userId as any,handle:account.handle,suspendedAt:null},{session});if(!user)throw Error('Destination account mapping does not match');const bytes=additions.get(account.userId)!;if((user.storageBytes||0)+bytes>MAX_ACCOUNT_UPLOAD_BYTES)throw Error(`Storage quota exceeded for ${account.handle}`);balances.push({handle:account.handle,beforeBytes:user.storageBytes||0,addedBytes:bytes,afterBytes:(user.storageBytes||0)+bytes});}
  if(await db.collection('logEntries').countDocuments({_id:{$in:plan.entries.map(e=>e._id) as any}},{session})||await db.collection('uploads').countDocuments({_id:{$in:plan.uploads.map(f=>f._id) as any}},{session}))throw Error('Destination IDs already exist without the migration receipt');
  for(const account of plan.accounts){const existing=await db.collection('logMigrationIdentities').findOne({_id:`logcal.app:${account.sourceId}` as any},{session});if(existing&&existing.userId!==account.userId)throw Error('Source account was already mapped differently');}
  return balances;
 };
 const accounts=await checks(),summary={entries:plan.entries.length,uploads:plan.uploads.length,unavailableMedia:plan.missing.length,historicalPeople:[...new Set(plan.entries.flatMap(e=>e.migration.historicalPeople.map(p=>p.sourceId)))].length,accounts,planHash};
 if(!apply)return {...summary,applied:false,alreadyApplied:false};
 await fs.mkdir(targetDir,{recursive:true,mode:0o700});
 const storageOwner=await fs.stat(targetDir);
 // Stage exact verified bytes before the atomic metadata commit. Never overwrite another file.
 for(const file of plan.uploads){const target=path.join(targetDir,file._id);try{await fs.copyFile(path.join(preparedDir,file._id),target,fs.constants.COPYFILE_EXCL);await fs.chmod(target,0o600);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;const bytes=await fs.readFile(target);if(hash(bytes)!==file.sha256)throw Error('Existing file collision');}await fs.chown(target,storageOwner.uid,storageOwner.gid);}
 const session=client.startSession();try{await session.withTransaction(async()=>{
  const existing=await receipts.findOne({_id:receiptId as any},{session});if(existing){if(existing.planHash!==planHash)throw Error('Migration receipt conflict');return;}
  await checks(session);
  for(const account of plan.accounts){const bytes=additions.get(account.userId)!;const result=await db.collection('users').updateOne({_id:account.userId as any,handle:account.handle,$expr:{$lte:[{$add:[{$ifNull:['$storageBytes',0]},bytes]},MAX_ACCOUNT_UPLOAD_BYTES]}},{$inc:{storageBytes:bytes}},{session});if(result.matchedCount!==1)throw Error('Account changed during import');
   await db.collection('logMigrationIdentities').updateOne({_id:`logcal.app:${account.sourceId}` as any},{$setOnInsert:{source:'logcal.app',sourceUserId:account.sourceId,userId:account.userId,importedAt:new Date().toISOString()}},{upsert:true,session});
   if(account.birthday)await db.collection('logBirthdays').updateOne({_id:account.userId as any},{$setOnInsert:{...account.birthday,updatedAt:new Date().toISOString(),migration:{source:'logcal.app',sourceUserId:account.sourceId}}},{upsert:true,session});
  }
  if(plan.uploads.length)await db.collection('uploads').insertMany(plan.uploads as any,{session});
  if(plan.entries.length)await db.collection('logEntries').insertMany(plan.entries.map(row=>({...row,joinKey:randomBytes(16).toString('hex')})) as any,{session});
  await receipts.insertOne({_id:receiptId as any,source:'logcal.app',planHash,summary,completedAt:new Date().toISOString()},{session});
 });}finally{await session.endSession();}
 return {...summary,applied:true,alreadyApplied:false};
}
async function main(){
 const [directory,envPath,expectedDatabase,mode]=process.argv.slice(2);if(!directory||!envPath||!expectedDatabase||!['dry-run','apply'].includes(mode))throw Error('Usage: <private-directory> <env-file> <expected-database> dry-run|apply');
 const env=dotenv.parse(await fs.readFile(envPath)),client=new MongoClient(env.MONGODB_URI);try{await client.connect();const db=client.db();if(db.databaseName!==expectedDatabase)throw Error('Wrong destination database');const input=JSON.parse(await fs.readFile(path.join(directory,'plan.json'),'utf8'));const result=await importLogcal({db,client,input,preparedDir:path.join(directory,'files'),targetDir:path.join(env.DATA_DIR,'files'),apply:mode==='apply'});console.log(JSON.stringify(result));}finally{await client.close();}
}
if(process.argv[1]?.endsWith('logcal-import.js')||process.argv[1]?.endsWith('logcal-import.ts'))void main().catch(error=>{console.error(error instanceof z.ZodError?JSON.stringify(error.issues.map(i=>({path:i.path,code:i.code}))):error.message);process.exitCode=1;});
