import {createHash} from 'node:crypto';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';

const root=resolve('dist/web'),assetRoot=join(root,'assets');
async function files(directory){
 const items=await readdir(directory,{withFileTypes:true});
 return (await Promise.all(items.map(item=>item.isDirectory()?files(join(directory,item.name)):[join(directory,item.name)]))).flat();
}
const assets=(await files(assetRoot)).map(path=>'/'+relative(root,path).split(/[\\/]/).join('/')).sort();
const source=await readFile(join(root,'sw.js'),'utf8');
const hash=createHash('sha256').update(assets.join('\n')).digest('hex').slice(0,16);
if(!source.includes("const APP_CACHE='newdrugs-app-development';")||!source.includes('const APP_ASSETS=[];'))throw Error('App shell cache markers are missing.');
await writeFile(join(root,'sw.js'),source.replace("const APP_CACHE='newdrugs-app-development';",`const APP_CACHE='newdrugs-app-${hash}';`).replace('const APP_ASSETS=[];',`const APP_ASSETS=${JSON.stringify(assets)};`));
