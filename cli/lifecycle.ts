// Adapted from Wayfinder's direct npm updater/uninstaller. Source checkouts are
// never treated as installations, and update failures never block app commands.
import {constants} from 'node:fs';
import {access,realpath,readFile,writeFile,stat,lstat,readlink,symlink,rename,open,unlink,mkdtemp,rm} from 'node:fs/promises';
import {basename,dirname,delimiter,isAbsolute,join,resolve,parse as parsePath} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {ConfigStore, operatorStore} from './config';
const exec=promisify(execFile),CHECK_INTERVAL=86400000;
export interface Installation {prefix:string;npm:string;npmCli?:string;node?:string}
export async function inferNativeRoot(entrypoint=process.execPath):Promise<string|null>{
 if(!entrypoint||!['newdrugs','newdrugs.exe'].includes(basename(entrypoint)))return null;
 let path:string;try{path=await realpath(entrypoint);}catch{return null;}
 if(!['newdrugs','newdrugs.exe'].includes(basename(path)))return null;
 const release=basename(dirname(path));if(!/^\d+\.\d+\.\d+-(?:darwin|linux|win32)-(?:arm64|x64)-[a-f0-9]{12}$/.test(release)||basename(dirname(dirname(path)))!=='releases')return null;
 const root=dirname(dirname(dirname(path))),{nativeRoot}=await import('./native');
 if(root!==await realpath(nativeRoot()).catch(()=>nativeRoot()))return null;
 return root;
}
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
    const npm=join(directory,name);try{await access(npm,constants.X_OK);if(process.platform!=='win32')return {prefix,npm};const npmCli=join(dirname(npm),'node_modules','npm','bin','npm-cli.js'),node=join(dirname(npm),'node.exe');await access(npmCli,constants.R_OK);await access(node,constants.X_OK);return {prefix,npm,npmCli,node};}catch{/* Try the next executable. */}
  }return null;
}
async function npmRun(install:Installation,args:string[]){await exec(install.npmCli?install.node||process.execPath:install.npm,install.npmCli?[install.npmCli,...args]:args,{timeout:120000,maxBuffer:200000,windowsHide:true});}
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
    const download=await deps.fetch(new URL('/downloads/newdrugs-cli.tgz',site),{redirect:'error',signal:AbortSignal.timeout(60000)});
    if(!download.ok||!download.body)throw new Error('The release download is unavailable.');
    const reader=download.body.getReader(),parts:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>64*1024*1024){await reader.cancel();throw new Error('The release exceeds the supported size.');}parts.push(value);}
    const archive=Buffer.concat(parts);if(createHash('sha256').update(archive).digest('hex')!==manifest.sha256)throw new Error('The release checksum did not match.');
    temporary=await mkdtemp(join(tmpdir(),'newdrugs-update-'));const archivePath=join(temporary,'newdrugs-cli.tgz');await writeFile(archivePath,archive,{mode:0o600});
    await deps.install(install,['install','--global','--prefix',install.prefix,archivePath,'--no-audit','--no-fund','--ignore-scripts']);
    process.stderr.write(`New Drugs CLI updated from ${current} to ${manifest.version}. The next invocation uses it.\n`);return 'updated';
  }finally{if(temporary)await rm(temporary,{recursive:true,force:true});await lock.close();await unlink(lockPath).catch(()=>{});}
}
export async function promoteNpmCommandToNative(prefix:string,entrypoint:string,launcher:string,executable:string,platform:NodeJS.Platform=process.platform){
  if(!isAbsolute(prefix)||!isAbsolute(entrypoint)||!isAbsolute(launcher)||!isAbsolute(executable))throw Error('Invalid native command path.');
  const command=platform==='win32'?join(prefix,'newdrugs.cmd'):join(prefix,'bin','newdrugs');
  const record=join(dirname(dirname(launcher)),'npm-install.json');
  const remember=async()=>{
    const temporary=`${record}.${randomUUID()}`;
    try{await writeFile(temporary,JSON.stringify({prefix,command,launcher}),{flag:'wx',mode:0o600});await rename(temporary,record);}finally{await rm(temporary,{force:true}).catch(()=>{});}
  };
  if(platform!=='win32'){
    const state=await lstat(command);
    if(!state.isSymbolicLink())throw Error('Refusing to replace an unmanaged New Drugs command.');
    const actual=await realpath(command),expected=await realpath(entrypoint);
    if(actual!==expected&&actual!==await realpath(launcher))throw Error('Refusing to replace a different New Drugs command.');
    await remember();
    if(actual===await realpath(launcher))return command;
    const temporary=join(dirname(command),`.newdrugs-native-${randomUUID()}`);
    try{await symlink(launcher,temporary);await rename(temporary,command);}finally{await rm(temporary,{force:true}).catch(()=>{});}
    return command;
  }
  // npm creates both cmd.exe and PowerShell entrypoints. Replace only its own shims.
  const powershell=join(prefix,'newdrugs.ps1'),shims=[command,powershell];
  for(const path of shims){
    const state=await lstat(path);if(!state.isFile()||state.isSymbolicLink())throw Error('Refusing to replace an unmanaged New Drugs command.');
    const body=await readFile(path,'utf8');
    if(!/newdrugs-cli[\\/]index\.js/i.test(body)&&!body.includes('New Drugs managed native command'))throw Error('Refusing to replace a different New Drugs command.');
  }
  if(/["%\r\n]/.test(launcher))throw Error('The native path cannot be represented safely in a Windows command.');
  await remember();
  const cmdText=`@echo off\r\nrem New Drugs managed native command\r\ncall "${launcher}" %*\r\nexit /b %errorlevel%\r\n`;
  const psText=`# New Drugs managed native command\n& '${launcher.replaceAll("'","''")}' @args\nexit $LASTEXITCODE\n`;
  for(const [path,body] of [[command,cmdText],[powershell,psText]] as const){
    const temporary=join(dirname(path),`.newdrugs-native-${randomUUID()}`);
    try{await writeFile(temporary,body,{flag:'wx',mode:0o700});await rename(temporary,path);}finally{await rm(temporary,{force:true}).catch(()=>{});}
  }
  return command;
}

export type AutoUpdateResult='disabled'|'source'|'unavailable'|'not_due'|'current'|'busy'|'updated'|{nativeExecutable:string;version:string};
export async function maybeAutoUpdate(current:string,store:ConfigStore,profile?:string,force=false,preferredOrigin?:string):Promise<AutoUpdateResult>{
  if(!force&&process.env.NEWDRUGS_DISABLE_AUTO_UPDATE==='1')return 'disabled';
  const native=await inferNativeRoot();
  if(native){let origin='https://druggie.org';try{origin=(await store.resolve(profile)).url;}catch{/* Native fallback uses the public release. */}
    try{return await updateNativeInstallation(native,origin,current,force);}catch(error){if(force)throw error;return 'unavailable';}}
  const install=await installation();if(!install){if(force)throw new Error('This copy is a source checkout, not an installed CLI.');return 'source';}
  let origin='https://druggie.org';try{origin=(await store.resolve(profile)).url;}catch{/* Fresh install uses the public release. */}
  if(preferredOrigin&&['https://druggie.org','https://dev.druggie.org'].includes(preferredOrigin))origin=preferredOrigin;
  if(['darwin-arm64','darwin-x64','linux-arm64','linux-x64','win32-x64'].includes(`${process.platform}-${process.arch}`)){
    try{
      const {installNative,nativeRoot}=await import('./native');
      const native=await installNative(origin,nativeRoot(),current);
      await promoteNpmCommandToNative(install.prefix,process.argv[1],native.launcher,native.executable);
      process.stderr.write(`New Drugs CLI switched to native ${native.version}.\n`);
      return {nativeExecutable:native.executable,version:native.version};
    }catch(error){
      process.stderr.write(`Native CLI unavailable: ${error instanceof Error?error.message:'installation failed'}. Using the Node CLI.\n`);
    }
  }
  try{return await updateInstallation(install,origin,current,force);}catch(error){if(force)throw error;return 'unavailable';}
}
export async function updateNativeInstallation(root:string,origin:string,current:string,force=false){
 if(!['https://druggie.org','https://dev.druggie.org'].includes(new URL(origin).origin))throw Error('Native releases must come from New Drugs.');
 const stamp=join(root,`.newdrugs-update-${createHash('sha256').update(origin).digest('hex').slice(0,12)}`),lockPath=join(root,'.newdrugs-update.lock');
 if(!force){try{if(Date.now()-(await stat(stamp)).mtimeMs<CHECK_INTERVAL)return 'not_due';}catch{/* First check. */}}
 let lock;try{lock=await open(lockPath,'wx',0o600);await lock.writeFile(String(process.pid));}
 catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST'){
   const pid=Number(await readFile(lockPath,'utf8').catch(()=>''));if(Number.isSafeInteger(pid)&&pid>0){try{process.kill(pid,0);}catch(cause){if((cause as NodeJS.ErrnoException).code==='ESRCH'){await unlink(lockPath);return updateNativeInstallation(root,origin,current,force);}}}
   return 'busy';
  }throw error;}
 try{
  await writeFile(stamp,String(Date.now()),{mode:0o600});
  const response=await fetch(new URL('/downloads/cli.json',origin),{redirect:'error',signal:AbortSignal.timeout(4000)});
  if(!response.ok)throw Error('The release manifest is unavailable.');
  const manifest=await response.json() as {version?:string;nativeManifest?:string};
  if(!manifest.version||manifest.nativeManifest!==`native-${manifest.version}.json`||!/^\d+\.\d+\.\d+$/.test(manifest.version))throw Error('Invalid native release manifest.');
  if(isNewerVersion(current,manifest.version)||origin==='https://druggie.org'&&!isNewerVersion(manifest.version,current))return 'current';
  const {installNative}=await import('./native');const installed=await installNative(origin,root,manifest.version);
  if(installed.executable===await realpath(process.execPath))return 'current';
  process.stderr.write(manifest.version===current?`New Drugs dev CLI refreshed at ${current}. The next invocation uses it.\n`:`New Drugs native CLI updated from ${current} to ${manifest.version}. The next invocation uses it.\n`);return 'updated';
 }finally{await lock.close();await unlink(lockPath).catch(()=>{});}
}
async function linkedNpmInstallation(nativeRoot:string){
  let value:{prefix?:unknown;command?:unknown;launcher?:unknown};
  try{value=JSON.parse(await readFile(join(nativeRoot,'npm-install.json'),'utf8'));}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw Error('Invalid native installation record.');}
  if(typeof value.prefix!=='string'||typeof value.command!=='string'||typeof value.launcher!=='string'||!isAbsolute(value.prefix)||!isAbsolute(value.launcher)||basename(value.launcher)!==(process.platform==='win32'?'newdrugs.cmd':'newdrugs')||await realpath(dirname(dirname(value.launcher)))!==nativeRoot||value.command!==(process.platform==='win32'?join(value.prefix,'newdrugs.cmd'):join(value.prefix,'bin','newdrugs')))throw Error('Invalid native installation record.');
  const entrypoint=process.platform==='win32'?join(value.prefix,'node_modules','newdrugs-cli','index.js'):join(value.prefix,'lib','node_modules','newdrugs-cli','index.js');
  let install:Installation|null;
  try{install=await installation(entrypoint);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')install=null;else throw error;}
  return {install,command:value.command,launcher:value.launcher};
}
async function removeNativeCommandLink(command:string,launcher:string){
  try{
    if(process.platform==='win32'){
      for(const path of [command,join(dirname(command),'newdrugs.ps1')]){
        const body=await readFile(path,'utf8').catch(()=>null);
        if(body?.includes('New Drugs managed native command'))await unlink(path);
      }
    }else{
      const state=await lstat(command);
      if(state.isSymbolicLink()&&resolve(dirname(command),await readlink(command))===launcher)await unlink(command);
    }
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
}
async function removeNativeRoot(root:string,node?:string){
  if(process.platform!=='win32'){await rm(root,{recursive:true,force:true});return;}
  if(!node)throw Error('Node.js is required to finish removing the running native CLI on Windows.');
  const script='const {rm}=require("node:fs/promises");const path=process.argv[1];(async()=>{for(let i=0;i<100;i++){try{await rm(path,{recursive:true,force:true});return}catch{await new Promise(resolve=>setTimeout(resolve,100))}}process.exitCode=1})()';
  const child=spawn(node,['-e',script,root],{detached:true,stdio:'ignore',windowsHide:true});
  await new Promise<void>((done,fail)=>{child.once('spawn',done);child.once('error',fail);});
  child.unref();
}
export async function uninstall(confirmed:boolean,store:ConfigStore,install:Installation|null|undefined=undefined,run=exec){
  if(!confirmed)throw new Error('Uninstall removes the CLI, its standard New Drugs MCP registrations, and all locally saved logins. Run newdrugs uninstall --yes to confirm.');
  const native=install===undefined?await inferNativeRoot():null;
  install=install===undefined?await installation():install;
  if(!install&&!native)throw new Error('This copy is not a recognized installed CLI, so it cannot be removed safely.');
  // Match Wayfinder: remove only this app's standard registrations, never other servers.
  for(const [command,args] of [['codex',['mcp','remove','newdrugs']],['claude',['mcp','remove','--scope','user','newdrugs']]] as const){try{await run(command,[...args],{timeout:10000,maxBuffer:100000,windowsHide:true});}catch{/* Optional host not installed or entry absent. */}}
  await operatorStore(store).removeAll();
  await store.removeAll();
  if(native){
    const linked=await linkedNpmInstallation(native);
    if(linked?.install){
      const args=['uninstall','--global','--prefix',linked.install.prefix,'newdrugs-cli','--ignore-scripts'];
      await run(linked.install.npmCli?linked.install.node||process.execPath:linked.install.npm,linked.install.npmCli?[linked.install.npmCli,...args]:args,{timeout:120000,maxBuffer:200000,windowsHide:true});
    }
    if(linked)await removeNativeCommandLink(linked.command,linked.launcher);
    let node=linked?.install?.node;
    if(process.platform==='win32'&&!node)for(const directory of (process.env.PATH||'').split(delimiter).filter(Boolean)){
      const candidate=join(directory,'node.exe');try{await access(candidate,constants.X_OK);node=candidate;break;}catch{/* Keep looking. */}
    }
    await removeNativeRoot(native,node);
    process.stdout.write('New Drugs CLI and locally saved logins removed. Your account remains on New Drugs.\n');return;
  }
  if(!install)throw Error('Native installation disappeared.');
  const args=['uninstall','--global','--prefix',install.prefix,'newdrugs-cli','--ignore-scripts'];
  try{await run(install.npmCli?install.node||process.execPath:install.npm,install.npmCli?[install.npmCli,...args]:args,{timeout:120000,maxBuffer:200000,windowsHide:true});}
  catch{throw new Error('Saved logins and standard MCP registrations were removed, but npm could not remove the CLI package.');}
  process.stdout.write('New Drugs CLI and locally saved logins removed. Your account remains on New Drugs.\n');
}
