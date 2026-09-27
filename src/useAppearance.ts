import {useLayoutEffect} from 'react';
import {resolvedAppearance,type AppearanceMode} from '../shared/appearance';
export function applyAppearance(mode:AppearanceMode){
 const resolved=resolvedAppearance(mode,window.matchMedia('(prefers-color-scheme: dark)').matches);
 document.documentElement.dataset.theme=resolved;document.documentElement.style.colorScheme=resolved;
 try{localStorage.setItem('nd-appearance',mode);}catch{/* Storage is optional. */}
 window.dispatchEvent(new CustomEvent('newdrugs:theme',{detail:resolved}));
}
export function useAppearance(mode:AppearanceMode|undefined){
 useLayoutEffect(()=>{if(!mode)return;applyAppearance(mode);const query=window.matchMedia('(prefers-color-scheme: dark)'),change=()=>{if(mode==='system')applyAppearance(mode);};query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[mode]);
}

export function applyFont(font:'mono'|'sans'|'serif'){
 document.documentElement.dataset.font=font;
 try{localStorage.setItem('nd-font',font);}catch{/* Storage is optional. */}
}
export function useFont(font:'mono'|'sans'|'serif'|undefined){useLayoutEffect(()=>{if(font)applyFont(font);},[font]);}
