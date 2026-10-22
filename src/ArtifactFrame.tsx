import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {CircleNotch} from '@phosphor-icons/react';
import {ARTIFACT_MAX_IMAGE_BYTES,publicArtifactSchema,type PublicArtifactDetail} from '../shared/artifacts';
import {buildArtifactDocument,type ArtifactDocumentContext,type ArtifactDisplay,type ArtifactEmbeddedFont,type ArtifactImageBundle} from './artifactDocument';
import {artifactEditableFocused,clearArtifactEditableFocus,setArtifactEditableFocus} from './embeddedArtifactFocus';
import {usePanelVisible} from './PanelReadiness';
import sansLatin from './fonts/noto-sans-normal-latin.woff2?url';
import sansExtended from './fonts/noto-sans-normal-latin-ext.woff2?url';
import monoLatin from './fonts/noto-sans-mono-normal-latin.woff2?url';
import monoExtended from './fonts/noto-sans-mono-normal-latin-ext.woff2?url';
import serifLatin from './fonts/noto-serif-normal-latin.woff2?url';
import serifExtended from './fonts/noto-serif-normal-latin-ext.woff2?url';
import serifItalicLatin from './fonts/noto-serif-italic-latin.woff2?url';
import serifItalicExtended from './fonts/noto-serif-italic-latin-ext.woff2?url';
import './artifactFrame.css';

export interface ArtifactFrameProps {
 artifact:PublicArtifactDetail;display:ArtifactDisplay;className?:string;
 onReady?():void;onError?(message:string):void;onEditableFocus?(active:boolean):void;
 onEscape?():void;onResize?(height:number):void;
}
export const ARTIFACT_MAX_DECODED_IMAGE_BYTES=64*1024*1024;
class UnavailableArtifactImage extends Error {}
const latin='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const extended='U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
const fontResources=[
 {url:sansLatin,family:'Noto Sans',weight:'400 700',style:'normal',unicodeRange:latin},
 {url:sansExtended,family:'Noto Sans',weight:'400 700',style:'normal',unicodeRange:extended},
 {url:monoLatin,family:'Noto Sans Mono',weight:'400 600',style:'normal',unicodeRange:latin},
 {url:monoExtended,family:'Noto Sans Mono',weight:'400 600',style:'normal',unicodeRange:extended},
 {url:serifLatin,family:'Noto Serif',weight:'400 700',style:'normal',unicodeRange:latin},
 {url:serifExtended,family:'Noto Serif',weight:'400 700',style:'normal',unicodeRange:extended},
 {url:serifItalicLatin,family:'Noto Serif',weight:'400',style:'italic',unicodeRange:latin},
 {url:serifItalicExtended,family:'Noto Serif',weight:'400',style:'italic',unicodeRange:extended},
] as const;
let fontFlight:Promise<ArtifactEmbeddedFont[]>|null=null;
function dataUrl(bytes:Uint8Array,mime:string){let raw='';for(let offset=0;offset<bytes.length;offset+=16384)raw+=String.fromCharCode(...bytes.subarray(offset,offset+16384));return `data:${mime};base64,${btoa(raw)}`;}
async function boundedBytes(response:Response,limit:number){
 const length=Number(response.headers.get('content-length')||0);if(length>limit)throw new UnavailableArtifactImage('The artifact resource exceeds its rendering limit.');
 if(!response.body){const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>limit)throw new UnavailableArtifactImage('The artifact resource exceeds its rendering limit.');return bytes;}
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let count=0;
 try{for(;;){const item=await reader.read();if(item.done)break;count+=item.value.byteLength;if(count>limit){await reader.cancel();throw new UnavailableArtifactImage('The artifact resource exceeds its rendering limit.');}parts.push(item.value);}}finally{reader.releaseLock();}
 const result=new Uint8Array(count);let offset=0;for(const part of parts){result.set(part,offset);offset+=part.byteLength;}return result;
}
async function embeddedFonts(){
 if(!fontFlight){fontFlight=Promise.all(fontResources.map(async resource=>{
  const url=new URL(resource.url,location.href);if(url.origin!==location.origin)throw Error('The bundled artifact font is unavailable.');
  const response=await fetch(url.href,{credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('The bundled artifact font could not load.');
  const bytes=await boundedBytes(response,256*1024);if(String.fromCharCode(...bytes.subarray(0,4))!=='wOF2')throw Error('The bundled artifact font is invalid.');
  return {...resource,dataUrl:dataUrl(bytes,'font/woff2'),bytes:bytes.length};
 })).then(fonts=>{if(fonts.reduce((sum,font)=>sum+font.bytes,0)>1024*1024)throw Error('The bundled artifact fonts exceed their rendering limit.');return fonts.map(({url:_url,bytes:_bytes,...font})=>font);}).catch(error=>{fontFlight=null;throw error;});}
 return fontFlight;
}

/** Inspect dimensions before a browser allocates decoded pixels. */
export function artifactRasterDimensions(bytes:Uint8Array,mime:string):{width:number;height:number}{
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ascii=(offset:number,length:number)=>String.fromCharCode(...bytes.subarray(offset,offset+length));
 let width=0,height=0;
 if(mime==='image/png'&&bytes.length>=24&&ascii(1,3)==='PNG'&&ascii(12,4)==='IHDR'){width=view.getUint32(16);height=view.getUint32(20);}
 if(mime==='image/webp'&&bytes.length>=30&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'){
  for(let offset=12;offset+8<=bytes.length;){const kind=ascii(offset,4),size=view.getUint32(offset+4,true),start=offset+8;if(start+size>bytes.length)break;
   if(kind==='VP8X'&&size>=10){width=1+bytes[start+4]+bytes[start+5]*256+bytes[start+6]*65536;height=1+bytes[start+7]+bytes[start+8]*256+bytes[start+9]*65536;break;}
   if(kind==='VP8L'&&size>=5&&bytes[start]===47){const packed=view.getUint32(start+1,true);width=(packed&16383)+1;height=((packed>>>14)&16383)+1;break;}
   if(kind==='VP8 '&&size>=10&&ascii(start+3,3)==='\x9d\x01\x2a'){width=view.getUint16(start+6,true)&16383;height=view.getUint16(start+8,true)&16383;break;}
   offset=start+size+(size%2);
  }
 }
 if(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216){
  for(let offset=2;offset+3<bytes.length;){if(bytes[offset++]!==255)break;while(bytes[offset]===255)offset++;const marker=bytes[offset++];if(marker===216||marker===217||marker===1||marker>=208&&marker<=215)continue;if(offset+2>bytes.length)break;const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7){height=view.getUint16(offset+3);width=view.getUint16(offset+5);break;}offset+=length;}
 }
 if(!width||!height||!Number.isSafeInteger(width*height*4))throw new UnavailableArtifactImage('An artifact image has invalid dimensions.');
 return {width,height};
}
export async function loadArtifactImages(artifact:PublicArtifactDetail,signal:AbortSignal):Promise<ArtifactImageBundle>{
 const aliases:Record<string,string>=Object.create(null),images:Record<string,string>=Object.create(null),files=new Map<string,PublicArtifactDetail['assets'][number]>();
 for(const asset of artifact.assets){
  const expected=`/api/artifacts/${artifact.id}/assets/${asset.id}`;
  const versioned=Number.isSafeInteger(artifact.contentRevision)&&artifact.contentRevision>0&&asset.url===`${expected}?version=${artifact.contentRevision}`;
  if((asset.url!==expected&&!versioned)||new URL(asset.url,location.href).origin!==location.origin)throw new UnavailableArtifactImage('The artifact image link is invalid.');
  const key=`${asset.mime}:${asset.sha256}`;aliases[asset.id]=key;if(!files.has(key))files.set(key,asset);
 }
 if([...files.values()].reduce((sum,file)=>sum+file.bytes,0)>ARTIFACT_MAX_IMAGE_BYTES)throw new UnavailableArtifactImage('The artifact images exceed their rendering limit.');
 let decoded=0;
 for(const [key,asset] of files){
  const response=await fetch(asset.url,{credentials:'same-origin',redirect:'error',cache:'no-store',signal});
  if(!response.ok){if([403,404,410].includes(response.status))throw new UnavailableArtifactImage('An artifact image is no longer available.');throw Error('The artifact images could not load.');}
  if(response.headers.get('content-type')?.split(';')[0].trim()!==asset.mime)throw new UnavailableArtifactImage('An artifact image changed while loading.');
  const bytes=await boundedBytes(response,asset.bytes);if(bytes.length!==asset.bytes)throw new UnavailableArtifactImage('An artifact image changed while loading.');
  if(!crypto.subtle)throw Error('This browser could not verify the artifact images.');
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as Uint8Array<ArrayBuffer>))].map(value=>value.toString(16).padStart(2,'0')).join('');
  if(digest!==asset.sha256)throw new UnavailableArtifactImage('An artifact image changed while loading.');
  const {width,height}=artifactRasterDimensions(bytes,asset.mime);decoded+=width*height*4;if(decoded>ARTIFACT_MAX_DECODED_IMAGE_BYTES)throw new UnavailableArtifactImage('The artifact images are too large to display together.');
  images[key]=dataUrl(bytes,asset.mime);
 }
 return {aliases,images};
}

type RenderedDocument={id:string;key:string;channel:string;html:string;contentRevision:number;assets:PublicArtifactDetail['assets'];ready:boolean};
const documentContext=(display:ArtifactDisplay):ArtifactDocumentContext=>({appearance:document.documentElement.dataset.theme==='dark'?'dark':'light',font:document.documentElement.dataset.font==='sans'?'sans':document.documentElement.dataset.font==='serif'?'serif':'mono',display});
export function ArtifactFrame(props:ArtifactFrameProps){
 const {artifact,display,className}=props,visible=usePanelVisible(),iframe=useRef<HTMLIFrameElement>(null),callbacks=useRef(props);callbacks.current=props;
 const current=useRef<RenderedDocument|null>(null),fallback=useRef<RenderedDocument|null>(null),shellLoaded=useRef(false),context=useRef(documentContext(display)),readyTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[shownRevision,setShownRevision]=useState<number|null>(null);
 const key=`${artifact.id}:${artifact.contentRevision}`,assetStamp=artifact.assets.map(asset=>`${asset.id}:${asset.mime}:${asset.bytes}:${asset.sha256}`).sort().join('|'),latestKey=useRef(key);latestKey.current=key;
 const clearFocus=()=>{if(iframe.current)clearArtifactEditableFocus(iframe.current);callbacks.current.onEditableFocus?.(false);};
 const stopWaiting=()=>{if(readyTimer.current!==null){clearTimeout(readyTimer.current);readyTimer.current=null;}};
 const waitForReady=(value:RenderedDocument)=>{stopWaiting();readyTimer.current=setTimeout(()=>{if(current.current!==value||value.ready)return;const message='The artifact viewer could not start. Try opening it again.';setLoading(false);setError(message);callbacks.current.onError?.(message);},15000);};
 const postDocument=(value:RenderedDocument)=>{if(shellLoaded.current&&iframe.current)iframe.current.contentWindow?.postMessage({source:'newdrugs-artifact-host',type:'render',channel:value.channel,html:value.html,context:context.current},'*');};
 const erase=()=>{stopWaiting();clearFocus();fallback.current=null;current.current=null;setShownRevision(null);if(iframe.current)iframe.current.style.visibility='hidden';if(shellLoaded.current&&iframe.current)iframe.current.contentWindow?.postMessage({source:'newdrugs-artifact-host',type:'render',channel:crypto.randomUUID(),html:'<!doctype html><html><body></body></html>'},'*');};
 useLayoutEffect(()=>{
  const update=()=>{context.current=documentContext(callbacks.current.display);const value=current.current;if(value&&shellLoaded.current)iframe.current?.contentWindow?.postMessage({source:'newdrugs-artifact-host',type:'context',channel:value.channel,context:context.current},'*');};
  update();const observer=new MutationObserver(update);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','data-font']});
  return()=>observer.disconnect();
 },[]);
 useLayoutEffect(()=>{context.current=documentContext(display);const value=current.current;if(value&&shellLoaded.current)iframe.current?.contentWindow?.postMessage({source:'newdrugs-artifact-host',type:'context',channel:value.channel,context:context.current},'*');},[display]);
 useLayoutEffect(()=>{if(!visible)clearFocus();},[visible]);
 useLayoutEffect(()=>{
  stopWaiting();
  const previous=current.current;
  if(previous&&(previous.id!==artifact.id||previous.assets.some(asset=>!artifact.assets.some(next=>next.id===asset.id&&next.sha256===asset.sha256&&next.mime===asset.mime&&next.bytes===asset.bytes))))erase();
  else clearFocus();
  setLoading(true);setError('');
  const controller=new AbortController();let disposed=false;
  void(async()=>{
   const parsed=publicArtifactSchema.parse(artifact);
   const [assets,fonts]=await Promise.all([loadArtifactImages(parsed,controller.signal),embeddedFonts()]);
   if(disposed)return;
   const channel=crypto.randomUUID(),html=buildArtifactDocument({bodyHtml:parsed.bodyHtml,data:parsed.data,channel,assets,fonts,context:context.current});
   fallback.current=current.current?.ready?current.current:null;
   const next:RenderedDocument={id:parsed.id,key,channel,html,contentRevision:parsed.contentRevision,assets:parsed.assets,ready:false};current.current=next;
   waitForReady(next);postDocument(next);
  })().catch(cause=>{
   if(disposed||controller.signal.aborted)return;
   if(cause instanceof UnavailableArtifactImage)erase();
   const message=cause instanceof Error?cause.message:'The artifact could not be displayed.';
   const detail=current.current?.ready?`${message} Showing the previous version.`:message;
   console.error('Artifact rendering:',message);setLoading(false);setError(detail);callbacks.current.onError?.(detail);
  });
  return()=>{disposed=true;controller.abort();};
 },[key,assetStamp]);
 useEffect(()=>{
  const receive=(event:MessageEvent)=>{
   const active=current.current,message=event.data;
   if(!active||event.source!==iframe.current?.contentWindow||!message||typeof message!=='object'||message.source!=='newdrugs-artifact-frame'||message.channel!==active.channel)return;
   if(message.type==='ready'){stopWaiting();active.ready=true;fallback.current=null;if(iframe.current)iframe.current.style.visibility='';setShownRevision(active.contentRevision);if(active.key===latestKey.current){setLoading(false);setError('');callbacks.current.onReady?.();}return;}
   if(message.type==='error'&&typeof message.message==='string'){
    stopWaiting();clearFocus();const old=fallback.current;
    let detail=message.message.slice(0,300);
    if(old){current.current=old;fallback.current=null;postDocument(old);setShownRevision(old.contentRevision);detail+=' Showing the previous version.';}
    setLoading(false);setError(detail);console.error('Artifact rendering:',detail);callbacks.current.onError?.(detail);return;
   }
   if(message.type==='editable-focus'&&typeof message.active==='boolean'){if(iframe.current)setArtifactEditableFocus(iframe.current,message.active);callbacks.current.onEditableFocus?.(message.active&&visible&&document.activeElement===iframe.current&&artifactEditableFocused());return;}
   if(message.type==='escape'){callbacks.current.onEscape?.();return;}
   if(message.type==='resize'&&typeof message.height==='number'&&Number.isFinite(message.height)&&message.height>=1&&message.height<=20000){callbacks.current.onResize?.(Math.ceil(message.height));return;}
  };
  window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
 },[visible]);
 useEffect(()=>{const frame=iframe.current;return()=>{stopWaiting();if(frame)clearArtifactEditableFocus(frame);callbacks.current.onEditableFocus?.(false);current.current=null;fallback.current=null;};},[]);
 return <div className={`artifact-frame${className?` ${className}`:''}`} data-loading={loading||undefined} data-display={display} data-rendered-content-revision={shownRevision??undefined} aria-busy={loading}>
  {error&&<p className="artifact-frame-error" role="alert">{error}</p>}
  <iframe ref={iframe} title={artifact.title} src="/api/artifacts/frame" sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads" referrerPolicy="no-referrer" className="artifact-frame-document" onLoad={()=>{clearFocus();shellLoaded.current=true;const active=current.current;if(active)postDocument(active);}} onError={()=>{stopWaiting();const message='The artifact viewer could not connect. Try opening it again.';setLoading(false);setError(message);callbacks.current.onError?.(message);}}/>
  {loading&&shownRevision===null&&!error&&<span className="artifact-frame-loading" role="status" aria-label="Loading artifact"><CircleNotch size={22} className="spin" aria-hidden="true"/></span>}
 </div>;
}
