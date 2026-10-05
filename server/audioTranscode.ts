import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MAX_UPLOAD_BYTES} from '../shared/uploads';
import {workGate} from './workGate';

const formats:Record<string,string>={'audio/webm':'matroska','audio/ogg':'ogg','audio/wav':'wav','audio/mp4':'mov','audio/mpeg':'mp3'};
const gate=workGate(1,8);

/** Decode verified local bytes only, then write seekable AAC/M4A for Safari. */
export function transcodeVoiceAudio(bytes:Buffer,mime:string):Promise<Buffer>{
 const format=formats[mime];
 if(!format||!bytes.length||bytes.length>MAX_UPLOAD_BYTES)throw Error('Unsupported voice note.');
 return gate.run(async()=>{
  const directory=await mkdtemp(join(tmpdir(),'newdrugs-voice-'));
  try{
   const input=join(directory,'input'),output=join(directory,'voice.m4a');
   await writeFile(input,bytes,{mode:0o600});
   await new Promise<void>((resolve,reject)=>{
    const process=spawn('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-max_alloc','67108864','-threads','1','-protocol_whitelist','file,pipe','-f',format,'-i',input,'-map','0:a:0','-vn','-sn','-dn','-ac','1','-ar','44100','-c:a','aac','-b:a','96k','-movflags','+faststart','-f','ipod',output],{stdio:['ignore','ignore','pipe']});
    let settled=false,details='';
    const fail=(error:Error)=>{if(settled)return;settled=true;clearTimeout(timeout);process.kill('SIGKILL');reject(error);};
    const timeout=setTimeout(()=>fail(Error('Voice note conversion timed out.')),20000);
    process.stderr.on('data',(part:Buffer)=>{details=(details+part.toString()).slice(-500);});
    process.on('error',fail);
    process.on('close',code=>{if(settled)return;settled=true;clearTimeout(timeout);code===0?resolve():reject(Error(details||'Voice note conversion failed.'));});
   });
   const size=(await stat(output)).size;
   if(!size||size>MAX_UPLOAD_BYTES)throw Error('The converted voice note is too large.');
   const result=await readFile(output);
   if(result.toString('ascii',4,8)!=='ftyp')throw Error('The converted voice note is invalid.');
   return result;
  }finally{await rm(directory,{recursive:true,force:true});}
 });
}
