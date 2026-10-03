import {spawn} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {workGate} from './workGate';

const gate=workGate(1,4);

/** Decode local bytes only. Remote video URLs never reach ffmpeg's network protocols. */
export async function videoPoster(bytes:Buffer,mime:string):Promise<Buffer>{
 if(bytes.length>64*1024*1024)throw new Error('Video exceeds poster limit.');
 const format=({ 'video/mp4':'mov','video/quicktime':'mov','video/webm':'matroska','video/ogg':'ogg' } as Record<string,string>)[mime];
 if(!format)throw new Error('Unsupported video format.');
 return gate.run(async()=>{
  const directory=await mkdtemp(join(tmpdir(),'newdrugs-poster-'));
  try{
   const input=join(directory,'input');await writeFile(input,bytes,{mode:0o600});
   const frame=await new Promise<Buffer>((resolve,reject)=>{
    const process=spawn('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-max_alloc','67108864','-threads','1','-protocol_whitelist','file,pipe','-f',format,'-max_pixels','20000000','-i',input,'-map','0:v:0','-an','-sn','-dn','-frames:v','1','-f','image2pipe','-vcodec','png','pipe:1'],{stdio:['ignore','pipe','ignore']});
    const chunks:Buffer[]=[];let size=0,settled=false;
    const fail=(error:Error)=>{if(settled)return;settled=true;clearTimeout(timeout);process.kill('SIGKILL');reject(error);};
    const timeout=setTimeout(()=>fail(new Error('Video poster timed out.')),5000);
    process.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>10*1024*1024)fail(new Error('Video frame too large.'));else chunks.push(chunk);});
    process.on('error',error=>fail(error));
    process.on('close',code=>{if(settled)return;settled=true;clearTimeout(timeout);if(code!==0||!size)reject(new Error('Video frame unavailable.'));else resolve(Buffer.concat(chunks));});
   });
   const image=await sharp(frame,{limitInputPixels:20_000_000}).resize(512,512,{fit:'inside',withoutEnlargement:true}).webp({quality:75}).toBuffer();
   if(image.length>200000)throw new Error('Video poster too large.');
   return image;
  }finally{await rm(directory,{recursive:true,force:true});}
 });
}
