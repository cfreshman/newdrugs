import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

const root=resolve('src/fonts'),licenseRoot=resolve('public/fonts/licenses');
await mkdir(root,{recursive:true});await mkdir(licenseRoot,{recursive:true});
const groups=[
 {file:'src/fonts.css',subsets:new Set(['latin','latin-ext']),families:['Noto Sans:wght@400..700','Noto Sans Mono:wght@400..600','Noto Serif:ital,wght@0,400..700;1,400']},
 {file:'src/square-fonts.css',subsets:new Set(['latin']),families:['Anton','Bebas Neue','Bungee','Caveat','Fredoka','Orbitron','Pacifico','Permanent Marker','Press Start 2P','Quicksand']},
];
const userAgent='Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const assets=[];
for(const group of groups){
 const url=new URL('https://fonts.googleapis.com/css2');for(const family of group.families)url.searchParams.append('family',family);url.searchParams.set('display','swap');
 const response=await fetch(url,{headers:{'User-Agent':userAgent}});if(!response.ok)throw Error(`Font CSS: HTTP ${response.status}`);
 const css=await response.text(),rules=[];
 for(const [,subset,face] of css.matchAll(/\/\* ([^*]+) \*\/\s*(@font-face\s*\{[^}]+\})/gs)){
  if(!group.subsets.has(subset))continue;
  const family=/font-family:\s*'([^']+)'/.exec(face)?.[1],style=/font-style:\s*([^;]+);/.exec(face)?.[1],source=/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/.exec(face)?.[1];
  if(!family||!style||!source)throw Error('Unrecognized Google Fonts CSS.');
  const filename=`${family.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${style}-${subset}.woff2`,download=await fetch(source);
  if(!download.ok)throw Error(`${family}: HTTP ${download.status}`);
  const bytes=Buffer.from(await download.arrayBuffer());if(bytes.toString('ascii',0,4)!=='wOF2')throw Error(`${family}: invalid WOFF2`);
  await writeFile(join(root,filename),bytes);
  assets.push({file:filename,source,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  rules.push(`/* ${subset} */\n${face.replace(source,`./fonts/${filename}`)}`);
 }
 if(!rules.length)throw Error(`No fonts found for ${group.file}`);
 await writeFile(group.file,rules.join('\n\n')+'\n');
}
for(const name of await readdir('assets/square-fonts/licenses'))if(name.endsWith('.txt'))await writeFile(join(licenseRoot,name),await readFile(join('assets/square-fonts/licenses',name)));
await writeFile(join(root,'manifest.json'),JSON.stringify({source:'Google Fonts CSS2',assets},null,2)+'\n');
console.log(`Saved ${assets.length} local WOFF2 fonts (${assets.reduce((sum,item)=>sum+item.bytes,0)} bytes).`);
