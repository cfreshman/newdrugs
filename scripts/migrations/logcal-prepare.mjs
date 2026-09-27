// Prepare only. Reads a scoped source export and media; never connects to either database.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const [directory]=process.argv.slice(2);if(!directory)throw Error('Usage: node scripts/migrations/logcal-prepare.mjs <private-directory>');
const source=JSON.parse(await fs.readFile(path.join(directory,'source.json'))),mapping=JSON.parse(await fs.readFile(path.join(directory,'mapping.json')));
const hash=value=>createHash('sha256').update(value).digest('hex');
const uuid=value=>{const h=hash('newdrugs:logcal.app:v1:'+value).slice(0,32).split('');h[12]='5';h[16]='8';return `${h.slice(0,8).join('')}-${h.slice(8,12).join('')}-${h.slice(12,16).join('')}-${h.slice(16,20).join('')}-${h.slice(20).join('')}`;};
const filesDir=path.join(directory,'files');await fs.mkdir(filesDir,{recursive:true,mode:0o700});
const recovered=JSON.parse(await fs.readFile(path.join(directory,'recovered-media.json')).catch(()=>'[]'));
const failed=new Map(recovered.filter(x=>x.error==='NoSuchKey').map(x=>[x.url,x.error]));
const sourceHash=hash(JSON.stringify(source)),plan={version:1,source:'logcal.app',sourceHash,exportedAt:source.exportedAt,accounts:source.users.map(u=>{const target=mapping[u.username];if(!target)throw Error('Missing account mapping');return {sourceId:u.id,handle:u.username,userId:target,birthday:u.birthday?{month:Number(u.birthday.slice(0,2)),day:Number(u.birthday.slice(3,5))}:null};}),entries:[],uploads:[],missing:[]};
const map=new Map(plan.accounts.map(a=>[a.sourceId,a.userId]));const jobs=[];
for(const entry of source.entries){
 const id=uuid('entry:'+entry.id),members=entry.attendees.map(a=>map.get(a.user));if(members.some(x=>!x)||new Set(members).size!==members.length)throw Error('Invalid membership');
 const row={_id:id,title:entry.title,date:entry.date,place:entry.place,links:entry.links.map(link=>/^https?:\/\//i.test(link)?link:`https://${link}`),recurrence:entry.anniversary?'anniversary':'none',coverFileId:null,ownerId:map.get(entry.createdBy)||members[0],members,invited:[],contributions:[],historicalPeople:entry.historicalPeople.map(p=>p.name),revision:1,createdAt:new Date(entry.createdAt).toISOString(),updatedAt:new Date(entry.createdAt).toISOString(),migration:{source:'logcal.app',sourceId:entry.id,sourceHash:hash(JSON.stringify(entry)),historicalPeople:entry.historicalPeople,originalLinks:entry.links,missingMedia:[],version:1}};
 for(const attendee of entry.attendees){const userId=map.get(attendee.user),contribution={userId,note:attendee.note,fileIds:[]};row.contributions.push(contribution);
  for(const kind of ['image','audio']){const url=attendee[kind];if(!url)continue;const fileId=uuid(`file:${entry.id}:${attendee.user}:${kind}`);jobs.push({url,kind,userId,fileId,row,contribution,isCover:kind==='image'&&(entry.cover===attendee.user||entry.cover===url)});}
 }
 plan.entries.push(row);
}
let cursor=0,complete=0;
await Promise.all(Array.from({length:8},async()=>{while(cursor<jobs.length){const job=jobs[cursor++],{url,fileId,userId,row,contribution}=job;const address=new URL(url);if(address.protocol!=='https:'||address.hostname!=='logcal-images-dev.s3.amazonaws.com'||address.username||address.password)throw Error('Unexpected source media URL');
 const missing=reason=>{const item={entryId:row._id,sourceId:row.migration.sourceId,userId,kind:job.kind,sourceUrl:url,reason};plan.missing.push(item);row.migration.missingMedia.push(item);};
 if(failed.has(url)){missing('Source object no longer exists');continue;}
 const fileName=path.join(filesDir,fileId);let bytes,mime;const extension=address.pathname.split('.').at(-1).toLowerCase();
 const recovery=recovered.find(r=>r.url===url&&r.bytes);
 if(recovery)bytes=Buffer.from(recovery.bytes,'base64');else{let response;for(let attempt=0;attempt<3;attempt++){try{response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(60000)});if(response.ok)break;}catch{}if(attempt===2)throw Error(`Media fetch failed for ${fileId}`);}if(Number(response.headers.get('content-length'))>10*1024*1024)throw Error('Source exceeds upload size');bytes=Buffer.from(await response.arrayBuffer());}
 if(bytes.length>10*1024*1024)throw Error('Source exceeds upload size');const sourceBytes=bytes.length,sourceHash=hash(bytes);
 if(bytes.length<4096&&bytes.toString('utf8').includes('<Error>')&&bytes.toString('utf8').includes('<Code>')){missing('Source stored an S3 error response instead of media');continue;}
 if(bytes.toString('ascii',4,8)==='ftyp'&&['isom','mp41','mp42','M4A ','qt  ','avc1'].includes(bytes.toString('ascii',8,12)))mime=job.kind==='audio'?'audio/mp4':'video/mp4';
 else if(['jpg','jpeg','png','webp'].includes(extension)){let metadata;try{metadata=await sharp(bytes,{limitInputPixels:40_000_000}).metadata();}catch{await fs.writeFile(path.join(directory,`unsupported-${fileId}`),bytes,{mode:0o600});throw Error(`Unsupported media ${fileId}, ${bytes.length} bytes, signature ${bytes.subarray(0,16).toString('hex')}`);}if(metadata.pages>1)throw Error('Animated source unsupported');bytes=await sharp(bytes,{limitInputPixels:40_000_000}).rotate().resize(512,512,{fit:'outside',withoutEnlargement:true}).webp({quality:80}).toBuffer();mime='image/webp';}
 else if(['m4a','mp4','mov'].includes(extension)&&bytes.toString('ascii',4,8)==='ftyp')mime=extension==='m4a'?'audio/mp4':'video/mp4';else throw Error('Unverified source format');
 await fs.writeFile(fileName,bytes,{mode:0o600});const upload={_id:fileId,userId,logEntryId:row._id,purpose:'log_media',name:`Logcal ${row.date}.${mime==='image/webp'?'webp':mime==='video/mp4'?'mp4':'m4a'}`,expectedBytes:sourceBytes,sourceHash,bytes:bytes.length,mime,sha256:hash(bytes),ready:true,retained:true,referenceRevision:1,createdAt:row.createdAt,migration:{source:'logcal.app',sourceId:row.migration.sourceId,sourceUrl:url,kind:job.kind,version:1}};
 plan.uploads.push(upload);contribution.fileIds.push(fileId);if(job.isCover&&mime.startsWith('image/'))row.coverFileId=fileId;
 if(++complete%100===0)console.log(JSON.stringify({preparedMedia:complete}));
}}));
// Stable attachment order and plan digest, independent of download completion order.
const jobOrder=new Map(jobs.map((job,i)=>[job.fileId,i]));for(const row of plan.entries)for(const c of row.contributions)c.fileIds.sort((a,b)=>jobOrder.get(a)-jobOrder.get(b));plan.uploads.sort((a,b)=>a._id.localeCompare(b._id));plan.missing.sort((a,b)=>a.entryId.localeCompare(b.entryId));
await fs.writeFile(path.join(directory,'plan.json'),JSON.stringify(plan),{mode:0o600});
console.log(JSON.stringify({entries:plan.entries.length,uploads:plan.uploads.length,missing:plan.missing.length,accounts:plan.accounts.map(a=>({handle:a.handle,entries:plan.entries.filter(e=>e.members.includes(a.userId)).length,bytes:plan.uploads.filter(u=>u.userId===a.userId).reduce((n,u)=>n+u.bytes,0)}))}));
