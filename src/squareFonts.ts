import {squareFonts} from './squareModel';

let loading:Promise<void>|null=null;
let previews:Promise<void>|null=null;

/** Load the local editor fonts only when the maker first opens. */
export function ensureSquareFonts(){
 if(loading)return loading;
 loading=import('./square-fonts.css').then(()=>{}).catch(()=>{loading=null;throw Error('Could not load image fonts. Try again.');});
 return loading;
}

export function ensureSquareFontPreviews(){
 if(previews)return previews;
 previews=ensureSquareFonts().then(async()=>{await Promise.all(Object.values(squareFonts).map(family=>document.fonts?.load(`400 18px "${family}"`,'New Drugs')));}).catch(error=>{previews=null;throw error;});
 return previews;
}
