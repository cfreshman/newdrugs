// Adapted from Wayfinder's direct npm updater/uninstaller. Source checkouts are
// never treated as installations, and update failures never block app commands.
import {constants} from 'node:fs';
import {access,realpath,readFile,writeFile,stat,open,unlink,mkdtemp,rm} from 'node:fs/promises';
import {basename,dirname,delimiter,isAbsolute,join,parse as parsePath} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {ConfigStore, operatorStore} from './config';
const exec=promisify(execFile),CHECK_INTERVAL=86400000;
export interface Installation {prefix:string;npm:string;npmCli?:string}
export function isNewerVersion(candidate:string,current:string) {
  if(!/^\d+\.\d+\.\d+$/.test(candidate)||!/^\d+\.\d+\.\d+$/.test(current))return false;
  const next=candidate.split('.').map(Number),old=current.split('.').map(Number);
  if([...next,...old].some(value=>!Number.isSafeInteger(value)))return false;
  for(let i=0;i<3;i++){if(next[i]>old[i])return true;if(next[i]<old[i])return false;}return false;
}
export async function inferNpmGlobalPrefix(entrypoint=process.argv[1]):Promise<string|null> {
  if(!entrypoint)return null;
  let cursor:string;try{cursor=dirname(await realpath(entrypoint));}catch{return null;}
  while(cursor!==parsePath(cursor).root){
    if(basename(cursor)==='newdrugs-cli'&&basename(dirname(cursor))==='node_modules'){
      try{if(JSON.parse(await readFile(join(cursor,'package.json'),'utf8')).name!=='newdrugs-cli')return null;}catch{return null;}
      const parent=dirname(dirname(cursor));return process.platform==='win32'?parent:basename(parent)==='lib'?dirname(parent):null;
    }cursor=dirname(cursor);
  }return null;
}
export async function installation(entrypoint=process.argv[1]):Promise<Installation|null>{
  const prefix=await inferNpmGlobalPrefix(entrypoint);if(!prefix||!isAbsolute(prefix))return null;
  for(const directory of (process.env.PATH||'').split(delimiter).filter(Boolean))for(const name of process.platform==='win32'?['npm.cmd','npm.exe']:['npm']){
    const npm=join(directory,name);try{await access(npm,constants.X_OK);if(process.platform!=='win32')return {prefix,npm};const npmCli=join(dirname(npm),'node_modules','npm','bin','npm-cli.js');await access(npmCli,constants.R_OK);return {prefix,npm,npmCli};}catch{/* Try the next executable. */}
  }return null;
}
async function npmRun(install:Installation,args:string[]){await exec(install.npmCli?process.execPath:install.npm,install.npmCli?[install.npmCli,...args]:args,{timeout:120000,maxBuffer:200000,windowsHide:true});}
export interface UpdateDependencies {
  fetch:typeof fetch;install:typeof npmRun;now():number;
}
const defaults:UpdateDependencies={fetch:globalThis.fetch,install:npmRun,now:Date.now};
/** Download is bounded, same-origin and digest verified before npm sees it. */
export async function updateInstallation(install:Installation,origin:string,current:string,force=false,deps:UpdateDependencies=defaults){
  const site=new URL(origin);if(!['https://druggie.org','https://dev.druggie.org'].includes(site.origin)||site.username||site.password)throw new Error('Automatic releases must come from New Drugs.');
  const stamp=join(install.prefix,`.newdrugs-update-${createHash('sha256').update(site.origin).digest('hex').slice(0,12)}`),lockPath=join(install.prefix,'.newdrugs-update.lock');
  if(!force){try{if(deps.now()-(await stat(stamp)).mtimeMs<CHECK_INTERVAL)return 'not_due';}catch{/* First check. */}}
  let lock;
  try{lock=await open(lockPath,'wx',0o600);await lock.writeFile(String(process.pid));}
  catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST'){const pid=Number(await readFile(lockPath,'utf8').catch(()=>''));if(Number.isSafeInteger(pid)&&pid>0){try{process.kill(pid,0);}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH'){await unlink(lockPath);return updateInstallation(install,origin,current,force,deps);}}}return 'busy';}throw error;}
  let temporary:string|undefined;
  try{
    await writeFile(stamp,String(deps.now()),{mode:0o600});
    const response=await deps.fetch(new URL('/downloads/cli.json',site),{redirect:'error',signal:AbortSignal.timeout(4000),headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('The release manifest is unavailable.');
    const manifest=await response.json() as {version?:string;archive?:string;sha256?:string};
    if(typeof manifest.version!=='string'||manifest.archive!=='newdrugs-cli.tgz'||!manifest.sha256||!/^([a-f0-9]{64})$/.test(manifest.sha256))throw new Error('Invalid release manifest.');
    if(!isNewerVersion(manifest.version,current))return 'current';
    const download=await deps.fetch(new URL('/downloads/newdrugs-cli.tgz',site),{redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!download.ok||!download.body)throw new Error('The release download is unavailable.');
    const reader=download.body.getReader(),parts:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5*1024*1024){await reader.cancel();throw new Error('The release exceeds the supported size.');}parts.push(value);}
    const archive=Buffer.concat(parts);if(createHash('sha256').update(archive).digest('hex')!==manifest.sha256)throw new Error('The release checksum did not match.');
    temporary=await mkdtemp(join(tmpdir(),'newdrugs-update-'));const archivePath=join(temporary,'newdrugs-cli.tgz');await writeFile(archivePath,archive,{mode:0o600});
    await deps.install(install,['install','--global','--prefix',install.prefix,archivePath,'--no-audit','--no-fund','--ignore-scripts']);
    process.stderr.write(`New Drugs CLI updated from ${current} to ${manifest.version}. The next invocation uses it.\n`);return 'updated';
  }finally{if(temporary)await rm(temporary,{recursive:true,force:true});await lock.close();await unlink(lockPath).catch(()=>{});}
}
export async function maybeAutoUpdate(current:string,store:ConfigStore,profile?:string,force=false){
  if(!force&&process.env.NEWDRUGS_DISABLE_AUTO_UPDATE==='1')return 'disabled';
  const install=await installation();if(!install){if(force)throw new Error('This copy is a source checkout, not an installed CLI.');return 'source';}
  let origin='https://druggie.org';try{origin=(await store.resolve(profile)).url;}catch{/* Fresh install uses the public release. */}
  try{return await updateInstallation(install,origin,current,force);}catch(error){if(force)throw error;return 'unavailable';}
}
export async function uninstall(confirmed:boolean,store:ConfigStore,install:Installation|null|undefined=undefined,run=exec){
  if(!confirmed)throw new Error('Uninstall removes the CLI, its standard New Drugs MCP registrations, and all locally saved logins. Run newdrugs uninstall --yes to confirm.');
  install=install===undefined?await installation():install;
  if(!install)throw new Error('This copy is not a recognized installed CLI, so it cannot be removed safely.');
  // Match Wayfinder: remove only this app's standard registrations, never other servers.
  for(const [command,args] of [['codex',['mcp','remove','newdrugs']],['claude',['mcp','remove','--scope','user','newdrugs']]] as const){try{await run(command,[...args],{timeout:10000,maxBuffer:100000,windowsHide:true});}catch{/* Optional host not installed or entry absent. */}}
  await operatorStore(store).removeAll();
  await store.removeAll();
  const args=['uninstall','--global','--prefix',install.prefix,'newdrugs-cli','--ignore-scripts'];
  try{await run(install.npmCli?process.execPath:install.npm,install.npmCli?[install.npmCli,...args]:args,{timeout:120000,maxBuffer:200000,windowsHide:true});}
  catch{throw new Error('Saved logins and standard MCP registrations were removed, but npm could not remove the CLI package.');}
  process.stdout.write('New Drugs CLI and locally saved logins removed. Your account remains on New Drugs.\n');
}
