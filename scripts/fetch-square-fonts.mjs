import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';

// Pinned Google Fonts source assets for deterministic Node canvas rendering.
const revision='9710da1eacb3be272583c3224dcb70f9da6eadbb';
const fonts={
  mono:['ofl/notosansmono','NotoSansMono[wdth,wght].ttf'],
  sans:['ofl/notosans','NotoSans[wdth,wght].ttf'],
  sansItalic:['ofl/notosans','NotoSans-Italic[wdth,wght].ttf'],
  serif:['ofl/notoserif','NotoSerif[wdth,wght].ttf'],
  serifItalic:['ofl/notoserif','NotoSerif-Italic[wdth,wght].ttf'],
  anton:['ofl/anton','Anton-Regular.ttf'],
  bebas:['ofl/bebasneue','BebasNeue-Regular.ttf'],
  bungee:['ofl/bungee','Bungee-Regular.ttf'],
  caveat:['ofl/caveat','Caveat[wght].ttf'],
  fredoka:['ofl/fredoka','Fredoka[wdth,wght].ttf'],
  orbitron:['ofl/orbitron','Orbitron[wght].ttf'],
  pacifico:['ofl/pacifico','Pacifico-Regular.ttf'],
  marker:['apache/permanentmarker','PermanentMarker-Regular.ttf'],
  pixel:['ofl/pressstart2p','PressStart2P-Regular.ttf'],
  quicksand:['ofl/quicksand','Quicksand[wght].ttf'],
  emoji:['ofl/notocoloremoji','NotoColorEmoji-Regular.ttf'],
};
const target=new URL('../assets/square-fonts/',import.meta.url);await mkdir(target,{recursive:true});await mkdir(new URL('licenses/',target),{recursive:true});
const manifest={source:'https://github.com/google/fonts',revision,fonts:{}};
async function download(path){const url=`https://raw.githubusercontent.com/google/fonts/${revision}/${path.split('/').map(encodeURIComponent).join('/')}`,response=await fetch(url);if(!response.ok)throw Error(`${path}: HTTP ${response.status}`);return {url,bytes:Buffer.from(await response.arrayBuffer())};}
for(const [key,[directory,name]] of Object.entries(fonts)){
  const {url,bytes}=await download(`${directory}/${name}`),file=`${key}.ttf`;
  await writeFile(new URL(file,target),bytes);
  manifest.fonts[key]={file,url,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
  console.log(`${file}: ${bytes.length} bytes`);
}
for(const directory of new Set(Object.values(fonts).map(([path])=>path))){
  const name=directory.startsWith('apache/')?'LICENSE.txt':'OFL.txt',key=directory.split('/').at(-1),{bytes}=await download(`${directory}/${name}`);
  const license=bytes.toString('utf8').replace(/\r\n?/g,'\n').split('\n').map(line=>line.replace(/[ \t]+$/g,'')).join('\n').replace(/\n*$/,'\n');
  await writeFile(new URL(`licenses/${key}.txt`,target),license);
}
await writeFile(new URL('manifest.json',target),JSON.stringify(manifest,null,2)+'\n');
