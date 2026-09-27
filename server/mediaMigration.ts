import {connectDatabase,mongo} from './db';
import {uploads,migrateUploadToObject} from './uploads';
import {config} from './config';
const args=process.argv.slice(2),stage=args[args.indexOf('--stage')+1],apply=args.includes('--apply');
if(!['dev','prod'].includes(stage)||config.APP_ENV!==(stage==='prod'?'production':'staging'))throw Error('Choose --stage dev|prod with that stage’s environment loaded.');
const suppliedLimit=args.find(value=>value.startsWith('--limit=')),limit=suppliedLimit?Number(suppliedLimit.split('=')[1]):50,after=args.find(value=>value.startsWith('--after='))?.slice(8);
if(!Number.isInteger(limit)||limit<1||limit>500)throw Error('Use a batch limit between 1 and 500.');
await connectDatabase();
try{
 const files=await uploads().find({ready:true,storage:{$exists:false},deletedAt:{$exists:false},moderatedAt:{$exists:false},...(after?{_id:{$gt:after}}:{})}).sort({_id:1}).limit(limit).project({_id:1}).toArray();let migrated=0,failed=0;
 if(apply)for(const file of files){try{if((await migrateUploadToObject(file._id)).migrated)migrated++;}catch(error){failed++;console.error('Media migration failed',{fileId:file._id,name:error instanceof Error?error.name:'Error'});}}
 console.log(JSON.stringify({stage,apply,selected:files.length,migrated,failed,nextAfter:files.at(-1)?._id||null,localCopiesPreserved:true}));if(failed)process.exitCode=1;
}finally{await mongo.close();}
