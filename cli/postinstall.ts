import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inferNpmGlobalPrefix,promoteNpmCommandToNative} from './lifecycle';
import {installNative,nativeRoot} from './native';

// The npm package is a bootstrap and fallback. A normal global install switches
// its existing command to verified native bytes without an extra setup command.
const directory=dirname(fileURLToPath(import.meta.url));
const entrypoint=join(directory,'index.js');
const prefix=await inferNpmGlobalPrefix(entrypoint);
if(prefix){
  try{
    const metadata=JSON.parse(await readFile(join(directory,'package.json'),'utf8')) as {newDrugsReleaseOrigin?:string;version?:string};
    const native=await installNative(metadata.newDrugsReleaseOrigin||'https://druggie.org',nativeRoot(),metadata.version);
    await promoteNpmCommandToNative(prefix,entrypoint,native.launcher,native.executable);
    process.stdout.write(`New Drugs native CLI ${native.version} installed.\n`);
  }catch(error){
    process.stderr.write(`Native CLI unavailable: ${error instanceof Error?error.message:'installation failed'}. Using the Node CLI.\n`);
  }
}
