import type {Request,Response} from 'express';

export const ARTIFACT_FRAME_MAX_BYTES=8*1024*1024;
export const ARTIFACT_FRAME_CSP=[
  'sandbox allow-scripts',
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  'img-src data: blob:',
  'font-src data: blob:',
  'media-src data: blob:',
  "connect-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  'frame-src blob:',
  "frame-ancestors 'self'",
].join('; ');

/** The shell contains no artifact, account data or credentials. */
export function buildArtifactFrameDocument(){
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{--artifact-background:#000;color-scheme:dark}:root[data-display=expanded]{--artifact-background:#fff;color-scheme:light}:root[data-display=expanded][data-theme=dark]{--artifact-background:#1c1b1b;color-scheme:dark}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--artifact-background)}iframe{display:block;width:100%;height:100%;border:0;background:var(--artifact-background)}</style>
</head><body><script>
"use strict";
(() => {
  const MAX_BYTES=${ARTIFACT_FRAME_MAX_BYTES};
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const encoder=new TextEncoder();
  const hostOrigin=new URL(location.href).origin;
  let channel=null,frame=null,renderedHtml=null,context=null,ready=false;
  const send=(type,detail={})=>{if(channel)parent.postMessage({source:'newdrugs-artifact-frame',channel,type,...detail},'*');};
  const presentation=value=>{
    if(value===undefined)return undefined;
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>key!=='appearance'&&key!=='display'&&key!=='font'))return null;
    if(value.appearance!==undefined&&value.appearance!=='light'&&value.appearance!=='dark')return null;
    if(value.display!==undefined&&value.display!=='inline'&&value.display!=='expanded')return null;
    if(value.font!==undefined&&value.font!=='mono'&&value.font!=='sans'&&value.font!=='serif')return null;
    return {...(value.appearance!==undefined?{appearance:value.appearance}:{}),...(value.display!==undefined?{display:value.display}:{}),...(value.font!==undefined?{font:value.font}:{})};
  };
  const applyContext=()=>{
    document.documentElement.dataset.display=context?.display||'inline';
    document.documentElement.dataset.theme=context?.appearance||'light';
    if(ready&&frame&&context)frame.contentWindow?.postMessage({source:'newdrugs-artifact-frame',channel,type:'context',context},'*');
  };
  const remove=()=>{
    if(frame){frame.remove();frame=null;}
    renderedHtml=null;ready=false;
  };
  const link=value=>{
    if(typeof value!=='string'||!value||value.length>2048||/[\\u0000-\\u001f\\u007f]/.test(value))return null;
    try{const url=new URL(value,location.href);return url.protocol==='http:'||url.protocol==='https:'?value:null;}catch{return null;}
  };
  window.addEventListener('message',event=>{
    const message=event.data;
    if(!message||typeof message!=='object'||Array.isArray(message))return;
    if(event.source===parent&&event.origin===hostOrigin&&parent!==window&&message.source==='newdrugs-artifact-host'){
      if(typeof message.channel!=='string'||!UUID.test(message.channel))return;
      if(message.type==='context'){
        if(message.channel!==channel)return;
        const next=presentation(message.context);
        if(next!==null&&next!==undefined){context={...(context||{}),...next};applyContext();}
        return;
      }
      if(message.type!=='render')return;
      const next=presentation(message.context);
      if(next===null)return;
      if(typeof message.html!=='string'||!message.html||message.html.length>MAX_BYTES||encoder.encode(message.html).byteLength>MAX_BYTES){
        parent.postMessage({source:'newdrugs-artifact-frame',channel:message.channel,type:'error',message:'The artifact document exceeds its rendering limit.'},'*');return;
      }
      if(channel===message.channel&&renderedHtml===message.html){if(next!==undefined){context={...(context||{}),...next};applyContext();}return;}
      remove();channel=message.channel;context=next||null;applyContext();
      try{
        frame=document.createElement('iframe');
        frame.title='Artifact content';frame.setAttribute('sandbox','allow-scripts');frame.referrerPolicy='no-referrer';
        const child=frame;let loads=0;
        child.addEventListener('load',()=>{if(frame===child&&++loads>1){send('editable-focus',{active:false});send('error',{message:'The artifact tried to leave its isolated document.'});}});
        // WebKit applies inherited frame-ancestors to blob:null and rejects it.
        // srcdoc inherits this shell's CSP while its parent still blocks HTTP navigation.
        frame.srcdoc=message.html;renderedHtml=message.html;document.body.appendChild(frame);
      }catch{remove();send('error',{message:'The artifact document could not be opened.'});}
      return;
    }
    if(!frame||event.source!==frame.contentWindow||message.source!=='newdrugs-artifact-document'||message.channel!==channel)return;
    if(message.type==='ready'){if(!ready){ready=true;send('ready');}applyContext();return;}
    if(message.type==='error'&&typeof message.message==='string'){send('error',{message:message.message.slice(0,300).replace(/[\\u0000-\\u001f\\u007f]/g,' ')});return;}
    if(message.type==='editable-focus'&&typeof message.active==='boolean'){send('editable-focus',{active:message.active});return;}
    if(message.type==='escape'){send('escape');return;}
    if(message.type==='resize'&&typeof message.height==='number'&&Number.isFinite(message.height)&&message.height>=1&&message.height<=20000){send('resize',{height:Math.ceil(message.height)});return;}
    if(message.type==='link'){const href=link(message.href);if(href!==null)send('link',{href});}
  });
  window.addEventListener('pagehide',remove);
})();
</script></body></html>`;
}

export function sendArtifactFrame(_req:Request,res:Response){
  res.set({
    'Content-Type':'text/html; charset=utf-8',
    'Content-Security-Policy':ARTIFACT_FRAME_CSP,
    'Cache-Control':'private, no-store, max-age=0',
    'Referrer-Policy':'no-referrer',
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'SAMEORIGIN',
    'X-Robots-Tag':'noindex, nofollow',
    'Cross-Origin-Resource-Policy':'same-origin',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=(), display-capture=(), payment=(), clipboard-read=(), clipboard-write=()',
  });
  return res.send(buildArtifactFrameDocument());
}
