import {squareFonts} from './squareModel';

const families=['Anton','Bebas Neue','Bungee','Caveat','Fredoka','Orbitron','Pacifico','Permanent Marker','Press Start 2P','Quicksand'];
let loading:Promise<void>|null=null;
let previews:Promise<void>|null=null;

/** Load the editor-only Google Fonts stylesheet when the maker first opens. */
export function ensureSquareFonts(){
 if(loading)return loading;
 loading=new Promise<void>((resolve,reject)=>{
  const existing=document.querySelector<HTMLLinkElement>('link[data-square-fonts]');
  if(existing?.dataset.loaded==='true'){resolve();return;}
  const link=existing||document.createElement('link');
  link.addEventListener('load',()=>{link.dataset.loaded='true';resolve();},{once:true});
  link.addEventListener('error',()=>{link.remove();loading=null;reject(Error('Could not load image fonts. Try again.'));},{once:true});
  if(!existing){const url=new URL('https://fonts.googleapis.com/css2');for(const family of families)url.searchParams.append('family',family);url.searchParams.set('display','swap');link.rel='stylesheet';link.href=url.href;link.dataset.squareFonts='true';document.head.append(link);}
 });
 return loading;
}

export function ensureSquareFontPreviews(){
 if(previews)return previews;
 previews=ensureSquareFonts().then(async()=>{await Promise.all(Object.values(squareFonts).map(family=>document.fonts?.load(`400 18px "${family}"`,'New Drugs')));}).catch(error=>{previews=null;throw error;});
 return previews;
}
