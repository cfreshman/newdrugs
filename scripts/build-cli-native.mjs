import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile,chmod,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {join} from 'node:path';

const release=JSON.parse(await readFile('release.json','utf8'));
if(!/^\d+\.\d+\.\d+$/.test(release.version))throw Error('Invalid release version.');
const targets={'darwin-arm64':'bun-darwin-arm64','darwin-x64':'bun-darwin-x64','linux-arm64':'bun-linux-arm64','linux-x64':'bun-linux-x64-baseline','win32-x64':'bun-windows-x64-baseline'};
const selected=process.argv.includes('--host')?[`${process.platform}-${process.arch}`]:Object.keys(targets);
if(selected.some(platform=>!targets[platform]))throw Error('Unsupported native CLI build target.');
const require=createRequire(import.meta.url),bun=require.resolve('bun/bin/bun.exe');
await rm('dist/cli-native',{recursive:true,force:true});await rm('dist/downloads',{recursive:true,force:true});
await mkdir('dist/cli-native',{recursive:true});await mkdir('dist/downloads',{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex'),entries={};
for(const platform of selected){
 const filename=`newdrugs-cli-${release.version}-${platform}${platform.startsWith('win32')?'.exe':''}`;
 const binaryPath=join('dist','cli-native',filename);
 execFileSync(bun,['build','cli/index.ts','--compile','--bytecode','--minify','--no-compile-autoload-dotenv','--no-compile-autoload-bunfig',`--target=${targets[platform]}`,'--outfile',binaryPath],{stdio:'inherit'});
 if(!platform.startsWith('win32'))await chmod(binaryPath,0o755);
 const bytes=await readFile(binaryPath),archive=gzipSync(bytes,{level:9}),archiveName=`${filename}.gz`;
 await writeFile(join('dist','downloads',archiveName),archive);
 entries[platform]={file:archiveName,sha256:hash(archive),binarySha256:hash(bytes),bytes:archive.length,binaryBytes:bytes.length};
}
await writeFile(join('dist','downloads',`native-${release.version}.json`),JSON.stringify({version:release.version,entries},null,2)+'\n');
console.log(`Built ${selected.length} native CLI target${selected.length===1?'':'s'}.`);
