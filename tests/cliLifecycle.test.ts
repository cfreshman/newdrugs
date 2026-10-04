import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,realpath,readlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {inferNpmGlobalPrefix,isNewerVersion,updateInstallation,promoteNpmCommandToNative,uninstall,type Installation} from '../cli/lifecycle';
import {ConfigStore} from '../cli/config';
let directory:string;beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),'nd-lifecycle-'));});afterEach(async()=>{vi.restoreAllMocks();await rm(directory,{recursive:true,force:true});});
it('uses strictly newer versions and recognizes only real global package installations',async()=>{
 expect(isNewerVersion('0.4.1','0.3.9')).toBe(true);expect(isNewerVersion('0.4.1','0.4.1')).toBe(false);expect(isNewerVersion('0.3.9','0.4.1')).toBe(false);expect(isNewerVersion('latest','0.4.1')).toBe(false);
 const root=join(directory,'prefix'),pkg=join(root,'lib','node_modules','newdrugs-cli');await mkdir(pkg,{recursive:true});await writeFile(join(pkg,'package.json'),JSON.stringify({name:'newdrugs-cli'}));await writeFile(join(pkg,'index.js'),'');await symlink(join(pkg,'index.js'),join(directory,'newdrugs'));
 expect(await inferNpmGlobalPrefix(join(directory,'newdrugs'))).toBe(await realpath(root));expect(await inferNpmGlobalPrefix(new URL('../cli/index.ts',import.meta.url).pathname)).toBeNull();
});
it('verifies the archive before installing and keeps all saved connection profiles',async()=>{
 const store=new ConfigStore(join(directory,'config','config.json'));await store.set('dev',{url:'https://dev.druggie.org',token:'private-dev'});await store.set('default',{url:'https://druggie.org',token:'private-public'});
 const bytes=Buffer.from('test archive'),sha256=createHash('sha256').update(bytes).digest('hex'),network=vi.fn(async(url:URL)=>url.pathname.endsWith('cli.json')?Response.json({version:'0.4.1',archive:'newdrugs-cli.tgz',sha256}):new Response(bytes));
 const installer=vi.fn(async(_installation:Installation,args:string[])=>{expect(await readFile(args[4])).toEqual(bytes);expect(args).toContain('--ignore-scripts');});vi.spyOn(process.stderr,'write').mockReturnValue(true);
 const dependencies={fetch:network as unknown as typeof fetch,install:installer,now:Date.now};
 expect(await updateInstallation({prefix:directory,npm:'/test/npm'},'https://druggie.org','0.3.1',false,dependencies)).toBe('updated');
 expect(await updateInstallation({prefix:directory,npm:'/test/npm'},'https://druggie.org','0.3.1',false,dependencies)).toBe('not_due');expect(installer).toHaveBeenCalledTimes(1);expect(network).toHaveBeenCalledTimes(2);expect((await store.resolve('dev')).token).toBe('private-dev');expect((await store.resolve('default')).token).toBe('private-public');
});
it('does not install corrupt downloads, downgrade, or fetch an untrusted release host',async()=>{
 const network=vi.fn(async(url:URL)=>url.pathname.endsWith('cli.json')?Response.json({version:'0.4.1',archive:'newdrugs-cli.tgz',sha256:'0'.repeat(64)}):new Response('corrupt'));const installer=vi.fn();const deps={fetch:network as unknown as typeof fetch,install:installer,now:Date.now};
 await expect(updateInstallation({prefix:directory,npm:'/test/npm'},'https://druggie.org','0.3.1',true,deps)).rejects.toThrow('checksum');expect(installer).not.toHaveBeenCalled();
 expect(await updateInstallation({prefix:directory,npm:'/test/npm'},'https://druggie.org','0.5.0',true,deps)).toBe('current');
 await expect(updateInstallation({prefix:directory,npm:'/test/npm'},'https://untrusted.example','0.3.1',true,deps)).rejects.toThrow('New Drugs');
});
it('switches only the npm-owned command to native and preserves its install record',async()=>{
 const prefix=join(directory,'prefix'),packageDir=join(prefix,'lib','node_modules','newdrugs-cli'),bin=join(prefix,'bin');
 const root=join(directory,'managed'),release=join(root,'releases','0.6.0-darwin-arm64-aaaaaaaaaaaa'),nativeBin=join(root,'bin');
 await mkdir(packageDir,{recursive:true});await mkdir(bin,{recursive:true});await mkdir(release,{recursive:true});await mkdir(nativeBin,{recursive:true});
 const entry=join(packageDir,'index.js'),executable=join(release,'newdrugs'),launcher=join(nativeBin,'newdrugs'),command=join(bin,'newdrugs');
 await writeFile(entry,'node');await writeFile(executable,'native');await symlink(executable,launcher);await symlink(entry,command);
 expect(await promoteNpmCommandToNative(prefix,entry,launcher,executable,'darwin')).toBe(command);
 expect(await readlink(command)).toBe(launcher);expect(await realpath(command)).toBe(await realpath(executable));
 expect(JSON.parse(await readFile(join(root,'npm-install.json'),'utf8'))).toEqual({prefix,command,launcher});
 const other=join(directory,'other');await writeFile(other,'other');await rm(command);await symlink(other,command);
 await expect(promoteNpmCommandToNative(prefix,entry,launcher,executable,'darwin')).rejects.toThrow('different New Drugs command');
 expect(await readlink(command)).toBe(other);
});
it('switches both npm Windows shims to the native executable only when they belong to this package',async()=>{
 const prefix=join(directory,'windows-prefix'),root=join(directory,'windows-managed'),bin=join(root,'bin');await mkdir(prefix,{recursive:true});await mkdir(bin,{recursive:true});
 const entry=join(prefix,'node_modules','newdrugs-cli','index.js'),launcher=join(bin,'newdrugs.cmd'),executable=join(root,'releases','0.6.0-win32-x64-aaaaaaaaaaaa','newdrugs.exe');
 const cmd=join(prefix,'newdrugs.cmd'),ps=join(prefix,'newdrugs.ps1');
 await writeFile(cmd,'@echo off\r\nnode "%~dp0\\node_modules\\newdrugs-cli\\index.js" %*\r\n');
 await writeFile(ps,'& "node" "$basedir/node_modules/newdrugs-cli/index.js" $args\n');
 await promoteNpmCommandToNative(prefix,entry,launcher,executable,'win32');
 expect(await readFile(cmd,'utf8')).toContain(launcher);expect(await readFile(ps,'utf8')).toContain(launcher);
 await writeFile(ps,'unrelated');
 await expect(promoteNpmCommandToNative(prefix,entry,launcher,executable,'win32')).rejects.toThrow('different New Drugs command');
 expect(await readFile(ps,'utf8')).toBe('unrelated');
});
it('requires the uninstall flag, refuses source copies, and removes only owned CLI credentials and standard registrations',async()=>{
 const store=new ConfigStore(join(directory,'config','config.json'));await store.set('dev',{url:'https://dev.druggie.org',token:'private-dev'});await store.set('default',{url:'https://druggie.org',token:'private-public'});await writeFile(join(directory,'config','unrelated.txt'),'keep');
 const run=vi.fn(async()=>({stdout:'',stderr:''}));vi.spyOn(process.stdout,'write').mockReturnValue(true);
 await expect(uninstall(false,store,null,run as any)).rejects.toThrow('--yes');await expect(uninstall(true,store,null,run as any)).rejects.toThrow('recognized');expect(run).not.toHaveBeenCalled();
 await uninstall(true,store,{prefix:directory,npm:'/test/npm'},run as any);
 expect((await store.load()).profiles).toEqual({});expect(await readFile(join(directory,'config','unrelated.txt'),'utf8')).toBe('keep');
 expect(run.mock.calls.map((call:any)=>call[1])).toEqual([['mcp','remove','newdrugs'],['mcp','remove','--scope','user','newdrugs'],['uninstall','--global','--prefix',directory,'newdrugs-cli','--ignore-scripts']]);
});
