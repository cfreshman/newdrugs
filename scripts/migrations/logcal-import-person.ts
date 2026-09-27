// Explicit, additive migration of one previously historical Logcal participant.
import fs from 'node:fs/promises';import path from 'node:path';import {createHash,randomBytes} from 'node:crypto';
import {MongoClient,type Db,type ClientSession} from 'mongodb';import dotenv from 'dotenv';
import {validateLogcalPlan} from './logcal-import';import {MAX_ACCOUNT_UPLOAD_BYTES} from '../../shared/uploads';
const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export async function importLogcalPerson({db,client,input,preparedDir,targetDir,apply=false}:{db:Db;client:MongoClient;input:unknown;preparedDir:string;targetDir:string;apply?:boolean}){
 const plan=validateLogcalPlan(input);if(plan.accounts.length!==1)throw Error('This importer accepts exactly one explicitly mapped account');
 const account=plan.accounts[0],planHash=digest(JSON.stringify(plan)),receiptId=`logcal.app:person:${account.sourceId}:${plan.sourceHash}`;
 const receipts=db.collection<any>('dataMigrations'),entries=db.collection<{_id:string;members:string[];contributions:any[];revision:number;deletedAt?:string;[key:string]:any}>('logEntries'),uploads=db.collection<any>('uploads'),users=db.collection<any>('users'),identities=db.collection<any>('logMigrationIdentities');
 const receipt=await receipts.findOne({_id:receiptId});if(receipt){if(receipt.planHash!==planHash)throw Error('Migration receipt has a different plan');return {...receipt.summary,applied:false,alreadyApplied:true};}
 for(const file of plan.uploads){const bytes=await fs.readFile(path.join(preparedDir,file._id));if(bytes.length!==file.bytes||digest(bytes)!==file.sha256)throw Error('Prepared media verification failed');}
 const inspect=async(session?:ClientSession)=>{
  const user=await users.findOne({_id:account.userId,handle:account.handle,suspendedAt:null},{session});if(!user)throw Error('Destination account mapping does not match');
  const identity=await identities.findOne({_id:`logcal.app:${account.sourceId}`},{session});if(identity&&identity.userId!==account.userId)throw Error('Source identity was already mapped differently');
  const existing=new Map<string,any>(),skipped=new Set<string>(),alreadyPresent=new Set<string>();
  for(const entry of plan.entries){
   const row=await entries.findOne({$or:[{_id:entry._id},{'migration.source':'logcal.app','migration.sourceId':entry.migration.sourceId}]},{session});if(!row)continue;
   if(row._id!==entry._id||row.migration?.source!=='logcal.app'||row.migration.sourceId!==entry.migration.sourceId)throw Error('Existing entry identity mismatch');
   if(row.deletedAt){skipped.add(entry._id);continue;}
   if(row.members.includes(account.userId)||row.contributions.some((c:any)=>c.userId===account.userId)){if(!row.members.includes(account.userId)||!row.contributions.some((c:any)=>c.userId===account.userId)||entry.contributions[0].note.trim()||entry.contributions[0].fileIds.length)throw Error('Account already participates in an entry with a contribution that needs review');alreadyPresent.add(entry._id);}
   const peers=row.members.filter((id:string)=>id!==account.userId);
   if(await db.collection('blocks').findOne({members:{$all:[account.userId],$in:peers}},{session}))throw Error('A block prevents linking a shared hangout');
   existing.set(entry._id,row);
  }
  const files=plan.uploads.filter(file=>!skipped.has(file.logEntryId));if(files.length&&await uploads.countDocuments({_id:{$in:files.map(file=>file._id)}},{session}))throw Error('Destination media already exists without a migration receipt');
  const bytes=files.reduce((sum,file)=>sum+file.bytes,0);if((user.storageBytes||0)+bytes>MAX_ACCOUNT_UPLOAD_BYTES)throw Error('Destination storage quota exceeded');
  return {existing,skipped,alreadyPresent,files,bytes,beforeBytes:user.storageBytes||0};
 };
 const before=await inspect();const summarize=(state:Awaited<ReturnType<typeof inspect>>)=>({handle:account.handle,entriesInserted:plan.entries.length-state.existing.size-state.skipped.size,entriesLinked:state.existing.size-state.alreadyPresent.size,alreadyParticipatingEntries:state.alreadyPresent.size,skippedDeletedEntries:state.skipped.size,uploads:state.files.length,unavailableMedia:plan.missing.length,beforeBytes:state.beforeBytes,addedBytes:state.bytes,afterBytes:state.beforeBytes+state.bytes,planHash});
 if(!apply)return {...summarize(before),applied:false,alreadyApplied:false};
 await fs.mkdir(targetDir,{recursive:true,mode:0o700});const owner=await fs.stat(targetDir);
 for(const file of before.files){const target=path.join(targetDir,file._id);try{await fs.copyFile(path.join(preparedDir,file._id),target,fs.constants.COPYFILE_EXCL);}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST'||digest(await fs.readFile(target))!==file.sha256)throw Error('Destination media collision');}await fs.chmod(target,0o600);await fs.chown(target,owner.uid,owner.gid);}
 let result=summarize(before),alreadyApplied=false;const session=client.startSession();try{await session.withTransaction(async()=>{
  const receipt=await receipts.findOne({_id:receiptId},{session});if(receipt){if(receipt.planHash!==planHash)throw Error('Migration receipt conflict');result=receipt.summary;alreadyApplied=true;return;}
  const state=await inspect(session);if(state.files.length!==before.files.length)throw Error('Migration destinations changed; repeat the dry-run');result=summarize(state);const now=new Date().toISOString();
  const quota=await users.updateOne({_id:account.userId,handle:account.handle,$expr:{$lte:[{$add:[{$ifNull:['$storageBytes',0]},state.bytes]},MAX_ACCOUNT_UPLOAD_BYTES]}},{$inc:{storageBytes:state.bytes}},{session});if(quota.matchedCount!==1)throw Error('Account changed during import');
  for(const entry of plan.entries){if(state.skipped.has(entry._id))continue;const row=state.existing.get(entry._id),contribution={...entry.contributions[0],hasContributed:Boolean(entry.contributions[0].note.trim()||entry.contributions[0].fileIds.length||!row)};
   if(row){
    const historical=(row.migration.historicalPeople||[]).filter((person:any)=>person.sourceId!==account.sourceId);
    const update=await entries.updateOne({_id:row._id,revision:row.revision,...(state.alreadyPresent.has(entry._id)?{}:{members:{$ne:account.userId}}),deletedAt:{$exists:false}},{$set:{...(!state.alreadyPresent.has(entry._id)?{members:[...row.members,account.userId],contributions:[...row.contributions,contribution]}:{}),'migration.linkedAccounts':[...(row.migration.linkedAccounts||[]),{sourceUserId:account.sourceId,userId:account.userId,sourceHash:entry.migration.sourceHash,importedAt:now}],historicalPeople:historical.map((person:any)=>person.name),'migration.historicalPeople':historical,...(!row.migration.originalHistoricalPeople?{'migration.originalHistoricalPeople':row.migration.historicalPeople||[]}:{}),updatedAt:now},$inc:{revision:1}},{session});if(update.matchedCount!==1)throw Error('Shared entry changed during import');
   }else await entries.insertOne({...entry,contributions:[contribution],joinKey:randomBytes(16).toString('hex')},{session});
  }
  if(state.files.length)await uploads.insertMany(state.files,{session});
  await identities.updateOne({_id:`logcal.app:${account.sourceId}`},{$setOnInsert:{source:'logcal.app',sourceUserId:account.sourceId,userId:account.userId,importedAt:now}},{upsert:true,session});
  if(account.birthday)await db.collection<any>('logBirthdays').updateOne({_id:account.userId},{$setOnInsert:{...account.birthday,updatedAt:now,migration:{source:'logcal.app',sourceUserId:account.sourceId}}},{upsert:true,session});
  await receipts.insertOne({_id:receiptId,source:'logcal.app',planHash,summary:result,completedAt:now},{session});
 });}finally{await session.endSession();}
 return {...result,applied:!alreadyApplied,alreadyApplied};
}
async function main(){const [directory,envPath,expectedDatabase,mode]=process.argv.slice(2);if(!directory||!envPath||!expectedDatabase||!['dry-run','apply'].includes(mode))throw Error('Usage: <private-directory> <env-file> <expected-database> dry-run|apply');const env=dotenv.parse(await fs.readFile(envPath)),client=new MongoClient(env.MONGODB_URI);try{await client.connect();const db=client.db();if(db.databaseName!==expectedDatabase)throw Error('Wrong destination database');console.log(JSON.stringify(await importLogcalPerson({db,client,input:JSON.parse(await fs.readFile(path.join(directory,'plan.json'),'utf8')),preparedDir:path.join(directory,'files'),targetDir:path.join(env.DATA_DIR,'files'),apply:mode==='apply'})));}finally{await client.close();}}
if(process.argv[1]?.endsWith('logcal-import-person.js')||process.argv[1]?.endsWith('logcal-import-person.ts'))void main().catch(()=>{console.error('Person migration failed; no successful receipt was recorded.');process.exitCode=1;});
