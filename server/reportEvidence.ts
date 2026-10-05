import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {config} from './config';
import {rows} from './db';
import {AppError,requireValue} from './errors';
import {publicUploadName} from './uploadNames';
import {readUpload,uploads} from './uploads';

interface EvidenceFile {id:string;name:string;mime:string;bytes:number;sha256:string}
interface ReportFilesRow {_id:string;evidenceFiles?:EvidenceFile[]}
const sha256=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
function reportFilePath(reportId:string,fileId:string){
 if(!/^[0-9a-f]{24}$/.test(reportId)||!(/^[0-9a-f-]{36}$/.test(fileId)||fileId==='audio'))throw new AppError(404,'report_file','This report file is unavailable.');
 return resolve(config.DATA_DIR,'report-evidence',`${reportId}-${fileId}`);
}
async function saveEvidence(reportId:string,fileId:string,bytes:Buffer){
 const path=reportFilePath(reportId,fileId),temporary=`${path}.${randomUUID()}.tmp`;
 await mkdir(resolve(config.DATA_DIR,'report-evidence'),{recursive:true,mode:0o700});
 await writeFile(temporary,bytes,{mode:0o600,flag:'wx'});
 await rename(temporary,path);
}

/** Copy exact submitted media outside account storage before returning the report receipt. */
export async function archiveReportFiles(reportId:string){
 const report=requireValue(await rows('reports').findOne({_id:reportId}));
 const evidence=report.evidence as {kind?:string;fileIds?:string[];photos?:string[];voiceFileId?:string|null}|undefined;
 const ids=evidence?.kind==='post'?evidence.fileIds||[]:evidence?.kind==='profile'?[...(evidence.photos||[]),...(evidence.voiceFileId?[evidence.voiceFileId]:[])]:[];
 const already=new Set(((report.evidenceFiles||[]) as EvidenceFile[]).map(file=>file.id));
 for(const id of [...new Set(ids)].filter(id=>!already.has(id))){
  const original=requireValue(await uploads().findOne({_id:id,userId:String(report.personId),ready:true,deletedAt:{$exists:false}}),'A reported media file is no longer available.');
  const {bytes}=await readUpload({userId:String(report.personId),source:'external',scope:'read'},id);
  await saveEvidence(reportId,id,bytes);
  const saved:EvidenceFile={id,name:publicUploadName(original),mime:original.mime,bytes:bytes.length,sha256:sha256(bytes)};
  await rows<ReportFilesRow>('reports').updateOne({_id:reportId,'evidenceFiles.id':{$ne:id}},{$push:{evidenceFiles:saved}});
 }
}

export async function attachTalkAudio(reporterId:string,reportId:string,body:Buffer){
 const report=requireValue(await rows('reports').findOne({_id:reportId,fromId:reporterId}),'This report is unavailable.');
 const evidence=report.evidence as {kind?:string}|undefined;
 if(evidence?.kind!=='talk'||Date.now()-Date.parse(String(report.createdAt))>10*60000)throw new AppError(409,'report_audio','Talk audio can only be attached shortly after submitting its report.');
 if(!Buffer.isBuffer(body)||body.length<46||body.length>2_000_000||body.toString('ascii',0,4)!=='RIFF'||body.toString('ascii',8,12)!=='WAVE'||body.toString('ascii',12,16)!=='fmt '||body.readUInt32LE(16)!==16||body.readUInt16LE(20)!==1||body.readUInt16LE(22)!==1||body.readUInt32LE(24)!==16000||body.readUInt32LE(28)!==32000||body.readUInt16LE(32)!==2||body.readUInt16LE(34)!==16||body.toString('ascii',36,40)!=='data'||body.readUInt32LE(40)!==body.length-44||body.readUInt32LE(4)!==body.length-8)throw new AppError(422,'report_audio','The Talk audio could not be read.');
 const durationSeconds=(body.length-44)/32000;
 if(durationSeconds>61)throw new AppError(422,'report_audio','The Talk audio exceeds one minute.');
 const hash=sha256(body),previous=report.audio as {sha256?:string}|undefined;
 if(previous){if(previous.sha256===hash)return {attached:true,durationSeconds};throw new AppError(409,'report_audio','This report already has audio.');}
 await saveEvidence(reportId,'audio',body);
 const updated=await rows('reports').updateOne({_id:reportId,fromId:reporterId,audio:{$exists:false}},{$set:{audio:{mime:'audio/wav',bytes:body.length,sha256:hash,durationSeconds}}});
 if(!updated.matchedCount)throw new AppError(409,'report_audio','This report already has audio.');
 return {attached:true,durationSeconds};
}

export async function reportEvidenceFiles(reportId:string){
 const report=requireValue(await rows('reports').findOne({_id:reportId}));
 const files=(report.evidenceFiles||[]) as EvidenceFile[];
 return {items:[...files,...(report.audio?[{id:'audio',name:'talk-report.wav',...(report.audio as object)}]:[])]};
}
export async function readReportEvidence(reportId:string,fileId:string){
 const report=requireValue(await rows('reports').findOne({_id:reportId}));
 const item=fileId==='audio'?(report.audio?{id:'audio',name:'talk-report.wav',...(report.audio as {mime:string;bytes:number;sha256:string})}:null):((report.evidenceFiles||[]) as EvidenceFile[]).find(file=>file.id===fileId);
 if(!item)throw new AppError(404,'report_file','This report file is unavailable.');
 const bytes=await readFile(reportFilePath(reportId,fileId));
 if(bytes.length!==item.bytes||sha256(bytes)!==item.sha256)throw new AppError(503,'report_file','The report file could not be verified.');
 return {item,bytes};
}
