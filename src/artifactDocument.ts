import {Parser} from 'htmlparser2';
import {ARTIFACT_MAX_ASSETS,ARTIFACT_MAX_HTML_BYTES,artifactDataSchema} from '../shared/artifacts';

export type ArtifactDisplay='inline'|'expanded';
export type ArtifactFont='mono'|'sans'|'serif';
export interface ArtifactDocumentContext {appearance:'light'|'dark';display:ArtifactDisplay;font:ArtifactFont}
export interface ArtifactImageBundle {aliases:Record<string,string>;images:Record<string,string>}
export interface ArtifactEmbeddedFont {family:'Noto Sans'|'Noto Sans Mono'|'Noto Serif';style:'normal'|'italic';weight:string;unicodeRange:string;dataUrl:string}
export const ARTIFACT_DOCUMENT_MAX_BYTES=8*1024*1024;
const aliasPattern=/^nd-asset:([A-Za-z0-9_-]{1,128})$/;
const rasterData=/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

export function artifactScriptJson(value:unknown){
 const json=JSON.stringify(value);if(json===undefined)throw Error('The artifact contains invalid JSON.');
 return json.replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
}

/** Tokenize inert source, never parse untrusted HTML in the app's live DOM. */
export function prepareArtifactMarkup(bodyHtml:string,aliases:Record<string,string>){
 const replacements:{start:number;end:number;value:string}[]=[];let tag='';
 const parser=new Parser({onopentagname(name){tag=name;},onattribute(name,value){
  if(tag!=='img'||name!=='src')return;
  const match=value.match(aliasPattern);if(!match)return;
  if(!Object.hasOwn(aliases,match[1]))throw Error(`Artifact image ${match[1]} is unavailable.`);
  replacements.push({start:parser.startIndex,end:parser.endIndex,value:`data-nd-asset="${match[1]}"`});
 }});
 parser.end(bodyHtml);
 let result=bodyHtml;for(const replacement of replacements.reverse())result=result.slice(0,replacement.start)+replacement.value+result.slice(replacement.end);
 return result;
}

/** Insert initialization without serializing or wrapping the author's document. */
function documentWithHead(markup:string,head:string){
 let full=false,htmlEnd:number|undefined,headEnd:number|undefined,doctypeEnd=0,firstScript=Infinity;
 const parser=new Parser({
  onprocessinginstruction(name){if(name.toLowerCase()==='!doctype'){full=true;doctypeEnd=parser.endIndex+1;}},
  onopentag(name){
   if(name==='html'){full=true;htmlEnd??=parser.endIndex+1;}
   if(name==='head'){full=true;headEnd??=parser.endIndex+1;}
   if(name==='body')full=true;
   if(name==='script')firstScript=Math.min(firstScript,parser.startIndex);
  },
 });
 parser.end(markup);
 if(!full)return `<!doctype html><html><head>${head}</head><body>${markup}</body></html>`;
 const inHead=headEnd!==undefined&&headEnd<=firstScript;
 const at=inHead?headEnd:Math.min(htmlEnd??doctypeEnd,firstScript);
 return markup.slice(0,at)+(inHead?head:`<head>${head}</head>`)+markup.slice(at);
}

const baseStyles=`
:root{--font-sans:'Noto Sans',sans-serif;--font-mono:'Noto Sans Mono',monospace;--font-serif:'Noto Serif',serif;--font-ui:var(--font-mono);--ink:#202530;--muted:#606b7b;--primary:#2867c7;--on-primary:#fff;--surface:#fff;--surface-soft:#d8e3f3;--artifact-background:var(--surface);--border:#99a4b4;--border-width:1px;--radius-control:10px;--space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--text-body:14px;--text-input:16px;color-scheme:light;font-family:var(--font-ui);font-weight:500;font-synthesis:none}
:root[data-theme=dark],:root[data-display=inline]{--ink:#f5f3f3;--muted:#bdbbba;--primary:#93baff;--on-primary:#1b1a1a;--surface:#1c1b1b;--surface-soft:#2e2d2d;--border:#726f6e;color-scheme:dark}
:root[data-display=inline]{--ink:#fff;--artifact-background:#000}
:root[data-font=sans]{--font-ui:var(--font-sans)}:root[data-font=serif]{--font-ui:var(--font-serif)}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:var(--artifact-background);color:var(--ink);font-family:var(--font-ui);font-size:var(--text-body);line-height:1.5;overflow-wrap:anywhere}
img,svg,video,canvas{max-width:100%}img{height:auto}button,input,textarea,select{font:inherit;color:inherit}input,textarea,select{font-size:max(16px,1em)!important;background:var(--surface-soft);border:var(--border-width) solid var(--border);border-radius:var(--radius-control);padding:var(--space-2);max-width:100%}button{cursor:pointer;background:var(--surface-soft);border:var(--border-width) solid var(--border);border-radius:var(--radius-control);padding:var(--space-2) var(--space-3)}button.solid{background:var(--primary);color:var(--on-primary);border-color:var(--primary)}a{color:var(--primary)}button,a,input,textarea,select{-webkit-tap-highlight-color:transparent;outline:none}button:focus-visible,a:focus-visible{ text-decoration:underline }input:focus-visible,textarea:focus-visible,select:focus-visible{border-color:var(--primary)}
`;

export function buildArtifactDocument({bodyHtml,data={},channel,assets={aliases:{},images:{}},fonts=[],context={appearance:'light',display:'inline',font:'mono'}}:{bodyHtml:string;data?:Record<string,unknown>;channel:string;assets?:ArtifactImageBundle;fonts?:readonly ArtifactEmbeddedFont[];context?:ArtifactDocumentContext}){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channel))throw Error('The artifact rendering channel is invalid.');
 if(!bodyHtml.trim()||new TextEncoder().encode(bodyHtml).byteLength>ARTIFACT_MAX_HTML_BYTES)throw Error('The artifact must contain bounded HTML.');
 if(Object.keys(assets.aliases).length>ARTIFACT_MAX_ASSETS||Object.keys(assets.images).length>ARTIFACT_MAX_ASSETS)throw Error('The artifact has too many images.');
 for(const [id,key] of Object.entries(assets.aliases))if(!/^[A-Za-z0-9_-]{1,128}$/.test(id)||!Object.hasOwn(assets.images,key))throw Error('The artifact contains an unavailable image reference.');
 for(const value of Object.values(assets.images))if(!rasterData.test(value))throw Error('The artifact contains an invalid image bundle.');
 if(fonts.length>8)throw Error('The artifact has too many font resources.');
 const fontStyles=fonts.map(font=>{
  if(!['Noto Sans','Noto Sans Mono','Noto Serif'].includes(font.family)||!['normal','italic'].includes(font.style)||!/^\d{3}(?: \d{3})?$/.test(font.weight)||!/^[Uu+0-9A-Fa-f?, -]+$/.test(font.unicodeRange)||!/^data:font\/woff2;base64,[A-Za-z0-9+/]+={0,2}$/.test(font.dataUrl))throw Error('The artifact font resource is invalid.');
  return `@font-face{font-family:'${font.family}';font-style:${font.style};font-weight:${font.weight};font-display:swap;src:url(${font.dataUrl}) format('woff2');unicode-range:${font.unicodeRange}}`;
 }).join('\n');
 const payload=artifactScriptJson({data:artifactDataSchema.parse(data),assets,context,channel});
 const head=`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${fontStyles}\n${baseStyles}</style>
<script id="nd-artifact-payload" type="application/json">${payload}</script><script>
"use strict";
(()=>{
 const node=document.getElementById('nd-artifact-payload'),payload=JSON.parse(node.textContent),channel=payload.channel;
 node.remove();document.currentScript?.remove();
 globalThis.data=payload.data;
 const send=(type,detail={})=>parent.postMessage({source:'newdrugs-artifact-document',channel,type,...detail},'*');
 let failed=false;
 const fail=value=>{failed=true;let message='The artifact could not be displayed.';try{message=String(value?.message||value||message).slice(0,300);}catch{}send('error',{message});};
 window.addEventListener('error',event=>{if(event.target===window)fail(event.error?.message||event.message||'Artifact script failed.');},true);
 window.addEventListener('unhandledrejection',event=>fail(event.reason));
 window.addEventListener('securitypolicyviolation',event=>{if(!String(event.blockedURI).startsWith('nd-asset'))fail('A resource was blocked by the artifact content security policy.');});
 const urls=[],images=Object.create(null),aliases=Object.create(null),missing=new Set(),watched=new WeakSet();
 for(const [key,value] of Object.entries(payload.assets.images)){
  const split=value.indexOf(','),mime=value.slice(5,value.indexOf(';')),raw=atob(value.slice(split+1)),bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  const url=URL.createObjectURL(new Blob([bytes],{type:mime}));urls.push(url);images[key]=url;
 }
 for(const [id,key] of Object.entries(payload.assets.aliases))aliases[id]=images[key];
 Object.defineProperty(globalThis,'artifactAssets',{value:Object.freeze(aliases),writable:false,configurable:false});
 const applyContext=value=>{
  if(!value||typeof value!=='object')return;
  const root=document.documentElement;
  if(value.appearance==='light'||value.appearance==='dark')root.dataset.theme=value.appearance;
  if(value.display==='inline'||value.display==='expanded')root.dataset.display=value.display;
  if(value.font==='mono'||value.font==='sans'||value.font==='serif')root.dataset.font=value.font;
  window.dispatchEvent(new CustomEvent('newdrugs-artifact-context',{detail:{appearance:root.dataset.theme,display:root.dataset.display,font:root.dataset.font}}));
 };
 applyContext(payload.context);
 window.addEventListener('message',event=>{const value=event.data;if(event.source===parent&&value?.source==='newdrugs-artifact-frame'&&value.channel===channel&&value.type==='context')applyContext(value.context);});
 const hydrate=node=>{
  if(!(node instanceof Element))return;
  const nodes=node.matches('img')?[node]:[];nodes.push(...node.querySelectorAll('img'));
  for(const image of nodes){
   const raw=image.getAttribute('src')||'',id=raw.startsWith('nd-asset:')?raw.slice(9):image.getAttribute('data-nd-asset');
   if(id!==null){
    if(Object.hasOwn(aliases,id)){if(image.getAttribute('src')!==aliases[id])image.setAttribute('src',aliases[id]);}
    else{image.removeAttribute('src');if(!missing.has(id)){missing.add(id);fail('Artifact image '+id+' is unavailable.');}}
   }
   if(id!==null&&!watched.has(image)){watched.add(image);image.addEventListener('error',()=>queueMicrotask(()=>{if(image.complete&&!image.naturalWidth)fail('An artifact image could not be decoded.');}));}
  }
 };
 let pending=0,lastHeight=0;
 const reportSize=()=>{pending=0;const body=document.body;if(!body)return;const box=body.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(body);const content=range.getBoundingClientRect(),scroll=window.scrollY,bottomMargin=parseFloat(getComputedStyle(body).marginBottom)||0;const height=Math.max(1,Math.min(20000,Math.ceil(Math.max(box.height,box.bottom+scroll+bottomMargin,content.bottom+scroll)-Math.min(0,box.top+scroll,content.top+scroll))));if(height!==lastHeight){lastHeight=height;send('resize',{height});}};
 const schedule=()=>{if(!pending)pending=requestAnimationFrame(reportSize);};
 new MutationObserver(records=>{for(const record of records){if(record.type==='attributes'){if(record.attributeName==='src'||record.attributeName==='data-nd-asset')hydrate(record.target);}else for(const node of record.addedNodes)hydrate(node);}schedule();}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['src','data-nd-asset','class','style','hidden']});
 const editing=()=>{const element=document.activeElement;return element instanceof HTMLElement&&element.matches('textarea,select,input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=button]):not([type=submit]),[contenteditable]:not([contenteditable=false])');};
 let focused=false;
 const reportFocus=()=>{const active=editing();if(active!==focused){focused=active;send('editable-focus',{active});}};
 document.addEventListener('focusin',reportFocus);document.addEventListener('focusout',()=>queueMicrotask(reportFocus));window.addEventListener('blur',()=>{if(focused){focused=false;send('editable-focus',{active:false});}});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();send('escape');}});
 const start=()=>{hydrate(document.body);const resize=new ResizeObserver(schedule);resize.observe(document.body);document.addEventListener('load',schedule,true);document.fonts?.ready.then(schedule).catch(fail);reportSize();if(!failed)send('ready');};
 document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
 window.addEventListener('pagehide',()=>{cancelAnimationFrame(pending);for(const url of urls)URL.revokeObjectURL(url);});
})();
</script>`;
 const html=documentWithHead(prepareArtifactMarkup(bodyHtml,assets.aliases),head);
 if(new TextEncoder().encode(html).byteLength>ARTIFACT_DOCUMENT_MAX_BYTES)throw Error('The artifact exceeds its rendering limit.');
 return html;
}
