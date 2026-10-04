import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mkdtemp,rm,readFile,readlink,stat,chmod,mkdir,writeFile,symlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {installNative,nativePlatform,switchLauncher} from '../cli/native';
import {inferNativeRoot} from '../cli/lifecycle';

let root:string;
beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),'nd-native-'));await chmod(root,0o700);});
afterEach(async()=>{vi.restoreAllMocks();await rm(root,{recursive:true,force:true});});
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

it('verifies both digests, installs immutable bytes, and switches the launcher only afterward',async()=>{
 const version='0.51.8',platform=nativePlatform(),file=`newdrugs-cli-${version}-${platform}${process.platform==='win32'?'.exe':''}.gz`;
 const binary=Buffer.from('#!/bin/sh\nprintf native\\n\n'),archive=gzipSync(binary);
 const entry={file,sha256:hash(archive),binarySha256:hash(binary),bytes:archive.length,binaryBytes:binary.length};
 const sendMock=vi.fn(async(input:string|URL)=>{const path=new URL(input).pathname;
  if(path.endsWith('/cli.json'))return Response.json({version,nativeManifest:`native-${version}.json`});
  if(path.endsWith(`/native-${version}.json`))return Response.json({version,entries:{[platform]:entry}});
  if(path.endsWith(`/${file}`))return new Response(archive);
  throw Error('Unexpected download');}),send=sendMock as unknown as typeof fetch;
 const installed=await installNative('https://dev.druggie.org',root,undefined,send);
 expect(installed).toMatchObject({version,platform,native:true});
 const target=join(root,'releases',`${version}-${platform}-${entry.binarySha256.slice(0,12)}`,process.platform==='win32'?'newdrugs.exe':'newdrugs');
 expect(await readFile(target)).toEqual(binary);expect((await stat(target)).mode&0o777).toBe(0o700);
 if(process.platform!=='win32')expect(await readlink(installed.launcher)).toBe(join('..','releases',`${version}-${platform}-${entry.binarySha256.slice(0,12)}`,'newdrugs'));
 await installNative('https://dev.druggie.org',root,undefined,send);
 expect(sendMock.mock.calls.filter(([url])=>String(url).endsWith(`/${file}`))).toHaveLength(1);
});

it('refuses corrupt or untrusted releases before creating a launcher',async()=>{
 const version='0.51.8',platform=nativePlatform(),binary=Buffer.from('test'),archive=gzipSync(binary),file=`newdrugs-cli-${version}-${platform}${process.platform==='win32'?'.exe':''}.gz`;
 const send=vi.fn(async(input:string|URL)=>String(input).endsWith('/cli.json')?Response.json({version,nativeManifest:`native-${version}.json`}):String(input).endsWith('.json')?Response.json({version,entries:{[platform]:{file,sha256:'0'.repeat(64),binarySha256:hash(binary),bytes:archive.length,binaryBytes:binary.length}}}):new Response(archive)) as unknown as typeof fetch;
 await expect(installNative('https://dev.druggie.org',root,undefined,send)).rejects.toThrow('checksum');
 await expect(stat(join(root,'bin',process.platform==='win32'?'newdrugs.cmd':'newdrugs'))).rejects.toMatchObject({code:'ENOENT'});
 await expect(installNative('https://example.com',root,undefined,send)).rejects.toThrow('New Drugs');
});
it('reports an HTML response as a missing native manifest instead of a JSON parse error',async()=>{
 const version='0.55.2',send=vi.fn(async(input:string|URL)=>String(input).endsWith('/cli.json')?Response.json({version,nativeManifest:`native-${version}.json`}):new Response('<!doctype html>',{status:200,headers:{'Content-Type':'text/html'}})) as unknown as typeof fetch;
 await expect(installNative('https://druggie.org',root,undefined,send)).rejects.toThrow('Native release manifest is not JSON.');
});
it('keeps a newer native release when an older dev package is installed afterward',async()=>{
 const platform=nativePlatform(),version='0.53.1',binary=Buffer.from('native newer'),archive=gzipSync(binary),file=`newdrugs-cli-${version}-${platform}${process.platform==='win32'?'.exe':''}.gz`;
 const entry={file,sha256:hash(archive),binarySha256:hash(binary),bytes:archive.length,binaryBytes:binary.length};
 const sendMock=vi.fn(async(input:string|URL)=>{const path=new URL(input).pathname;
  if(path.endsWith(`/native-${version}.json`))return Response.json({version,entries:{[platform]:entry}});
  if(path.endsWith(`/${file}`))return new Response(archive);
  throw Error('An older release must not be fetched');
 }),send=sendMock as unknown as typeof fetch;
 const first=await installNative('https://druggie.org',root,version,send);
 const second=await installNative('https://dev.druggie.org',root,'0.52.2',send);
 expect(second).toEqual(first);
 expect(sendMock).toHaveBeenCalledTimes(2);
});

it('recognizes the real managed executable path for native update checks',async()=>{
 const previous=process.env.XDG_DATA_HOME;process.env.XDG_DATA_HOME=root;
 try{const managed=join(root,'newdrugs','cli'),folder=`0.51.8-${nativePlatform()}-${'a'.repeat(12)}`,release=join(managed,'releases',folder),bin=join(managed,'bin');
  await mkdir(release,{recursive:true,mode:0o700});await mkdir(bin,{recursive:true,mode:0o700});
  const executable=join(release,process.platform==='win32'?'newdrugs.exe':'newdrugs'),launcher=join(bin,process.platform==='win32'?'newdrugs.cmd':'newdrugs');
  await writeFile(executable,'binary',{mode:0o700});if(process.platform==='win32')await writeFile(launcher,'@rem New Drugs managed launcher\r\n');else await symlink(executable,launcher);
  expect(await inferNativeRoot(executable)).toBe(await realpath(managed));
  if(process.platform!=='win32')expect(await inferNativeRoot(launcher)).toBe(await realpath(managed));
 }finally{if(previous===undefined)delete process.env.XDG_DATA_HOME;else process.env.XDG_DATA_HOME=previous;}
});
it('updates a Windows release pointer without replacing the active command wrapper',async()=>{
 const managed=join(root,'managed'),bin=join(managed,'bin');await mkdir(managed,{mode:0o700});
 const first=await switchLauncher(managed,join(managed,'releases','first','newdrugs.exe'),'0.52.2','win32-x64','a'.repeat(64));
 const wrapper=await readFile(first,'utf8');expect(wrapper).toContain('current.txt');
 expect(await readFile(join(managed,'current.txt'),'utf8')).toBe(`0.52.2-win32-x64-${'a'.repeat(12)}\r\n`);
 await switchLauncher(managed,join(managed,'releases','second','newdrugs.exe'),'0.53.1','win32-x64','b'.repeat(64));
 expect(await readFile(first,'utf8')).toBe(wrapper);
 expect(await readFile(join(managed,'current.txt'),'utf8')).toBe(`0.53.1-win32-x64-${'b'.repeat(12)}\r\n`);
});
