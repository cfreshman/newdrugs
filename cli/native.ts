import {createHash,randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {homedir} from 'node:os';
import {join,isAbsolute,relative} from 'node:path';
import {mkdir,readFile,writeFile,rename,chmod,lstat,symlink,readlink,rm} from 'node:fs/promises';
import {validUrl} from './config';

const MAX_ARCHIVE=64*1024*1024,MAX_BINARY=200*1024*1024;
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
export const nativePlatform=()=>`${process.platform}-${process.arch}`;
export function nativeRoot(){const base=process.platform==='win32'?process.env.LOCALAPPDATA||join(homedir(),'AppData','Local'):process.env.XDG_DATA_HOME||join(homedir(),'.local','share');return join(base,'newdrugs','cli');}
const originFor=(raw:string)=>{const origin=validUrl(raw);if(!['https://druggie.org','https://dev.druggie.org'].includes(origin))throw Error('Native releases must come from New Drugs.');return origin;};
const safeDir=async(path:string)=>{await mkdir(path,{recursive:true,mode:0o700});const state=await lstat(path);if(!state.isDirectory()||state.isSymbolicLink()||process.getuid&&state.uid!==process.getuid()||process.platform!=='win32'&&(state.mode&0o022)!==0)throw Error('Unsafe native installation directory.');};
const manifestEntry=(value:unknown,version:string,platform:string)=>{
 if(!value||typeof value!=='object')throw Error('Native release is unavailable for this platform.');
 const entry=value as {file?:unknown;sha256?:unknown;binarySha256?:unknown;bytes?:unknown;binaryBytes?:unknown};
 const file=`newdrugs-cli-${version}-${platform}${platform.startsWith('win32')?'.exe':''}.gz`;
 if(entry.file!==file||typeof entry.sha256!=='string'||!/^([a-f0-9]{64})$/.test(entry.sha256)||typeof entry.binarySha256!=='string'||!/^([a-f0-9]{64})$/.test(entry.binarySha256)||!Number.isInteger(entry.bytes)||Number(entry.bytes)<1||Number(entry.bytes)>MAX_ARCHIVE||!Number.isInteger(entry.binaryBytes)||Number(entry.binaryBytes)<1||Number(entry.binaryBytes)>MAX_BINARY)throw Error('Invalid native release manifest.');
 return entry as {file:string;sha256:string;binarySha256:string;bytes:number;binaryBytes:number};
};
async function releaseVersion(origin:string,send:typeof fetch){
 const response=await send(`${origin}/downloads/cli.json`,{redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('CLI release manifest is unavailable.');
 const manifest=await response.json() as {version?:string;nativeManifest?:string};
 if(!manifest.version||!/^\d+\.\d+\.\d+$/.test(manifest.version)||manifest.nativeManifest!==`native-${manifest.version}.json`)throw Error('Invalid CLI release manifest.');
 return manifest.version;
}
async function archiveBytes(response:Response,size:number){
 if(!response.ok||!response.body)throw Error('Native release is unavailable.');
 const chunks:Uint8Array[]=[];let count=0;
 for await(const chunk of response.body as unknown as AsyncIterable<Uint8Array>){count+=chunk.length;if(count>size)throw Error('Native archive exceeds its declared size.');chunks.push(chunk);}
 if(count!==size)throw Error('Native archive size did not match the manifest.');
 return Buffer.concat(chunks);
}
async function switchLauncher(root:string,target:string,version:string,platform:string,digest:string){
 const bin=join(root,'bin');await safeDir(bin);
 const name=process.platform==='win32'?'newdrugs.cmd':'newdrugs',launcher=join(bin,name),temporary=join(bin,`.newdrugs-${randomUUID()}`);
 try{
  const existing=await lstat(launcher);
  if(process.platform==='win32'){
   if(!existing.isFile()||existing.isSymbolicLink()||!(await readFile(launcher,'utf8')).startsWith('@rem New Drugs managed launcher\r\n'))throw Error('Refusing to replace an unmanaged launcher.');
  }else{
   if(!existing.isSymbolicLink()||!/^\.\.\/releases\/\d+\.\d+\.\d+-(?:darwin|linux)-(?:arm64|x64)-[a-f0-9]{12}\/newdrugs$/.test(await readlink(launcher)))throw Error('Refusing to replace an unmanaged launcher.');
  }
 }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 if(process.platform==='win32'){
  const folder=`${version}-${platform}-${digest.slice(0,12)}`;
  await writeFile(temporary,`@rem New Drugs managed launcher\r\n@echo off\r\n"%~dp0..\\releases\\${folder}\\newdrugs.exe" %*\r\n`,{flag:'wx',mode:0o700});
 }else await symlink(relative(bin,target),temporary);
 try{await rename(temporary,launcher);}finally{await rm(temporary,{force:true}).catch(()=>{});}
 return launcher;
}

/** Verified immutable executable, then an atomic launcher switch. Node remains available separately. */
export async function installNative(rawOrigin:string,root=nativeRoot(),requestedVersion?:string,send:typeof fetch=fetch){
 const origin=originFor(rawOrigin),platform=nativePlatform();if(!isAbsolute(root))throw Error('Native install root must be absolute.');
 const version=requestedVersion||await releaseVersion(origin,send);
 if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid native release version.');
 const response=await send(`${origin}/downloads/native-${version}.json`,{redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Native release manifest is unavailable.');
 const manifest=await response.json() as {version?:string;entries?:Record<string,unknown>};
 if(manifest.version!==version)throw Error('Native release version does not match.');
 const entry=manifestEntry(manifest.entries?.[platform],version,platform),folder=`${version}-${platform}-${entry.binarySha256.slice(0,12)}`;
 for(const path of [root,join(root,'releases'),join(root,'releases',folder)])await safeDir(path);
 const target=join(root,'releases',folder,process.platform==='win32'?'newdrugs.exe':'newdrugs');
 let exists=false;try{const state=await lstat(target);if(!state.isFile()||state.isSymbolicLink()||state.nlink!==1||hash(await readFile(target))!==entry.binarySha256)throw Error('Existing native release does not match its digest.');exists=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 if(!exists){
  const archive=await archiveBytes(await send(`${origin}/downloads/${entry.file}`,{redirect:'error',signal:AbortSignal.timeout(120000)}),entry.bytes);
  if(hash(archive)!==entry.sha256)throw Error('Native archive checksum failed.');
  const binary=gunzipSync(archive,{maxOutputLength:entry.binaryBytes});
  if(binary.length!==entry.binaryBytes||hash(binary)!==entry.binarySha256)throw Error('Native executable checksum failed.');
  const temporary=join(root,'releases',folder,`.install-${randomUUID()}`);
  try{await writeFile(temporary,binary,{flag:'wx',mode:0o700});await chmod(temporary,0o700);await rename(temporary,target);}
  finally{await rm(temporary,{force:true}).catch(()=>{});}
 }
 const launcher=await switchLauncher(root,target,version,platform,entry.binarySha256);
 return {launcher,version,platform,native:true};
}
