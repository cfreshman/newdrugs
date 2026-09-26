import {customMediaKind} from '../shared/customMedia';
import {useEffect,useRef,useState} from 'react';
import {Globe} from '@phosphor-icons/react';
import {loadLinkPreview,cachedLinkPreview} from './linkPreviewCache';
import {CustomMedia} from './CustomMedia';
import {textLinks,type LinkPreview as Preview} from '../shared/links';
import {attachmentUrl,providerEmbed} from '../shared/postLinks';
import {parseDestination} from '../shared/navigation';
import {usePanelVisible} from './PanelReadiness';
import {PostPhotos} from './PostPhotos';
import {LinkedText} from './LinkedText';

function WebsiteCard({url,draft,depth}:{url:string;draft:boolean;depth:number}){
 const node=useRef<HTMLDivElement>(null),visible=usePanelVisible();
 const [preview,setPreview]=useState<Preview|undefined>(cachedLinkPreview(url)),[broken,setBroken]=useState(false),[near,setNear]=useState(false),[failed,setFailed]=useState(false);
 useEffect(()=>{
  if(!visible)return;
  let cancelled=false,started=false,timer:ReturnType<typeof setTimeout>;
  const start=()=>{if(started)return;started=true;timer=setTimeout(()=>{void loadLinkPreview(url).then(result=>{if(!cancelled)setPreview(result);}).catch(()=>{if(!cancelled)setFailed(true);});},draft?650:0);};
  const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(entries=>{const inside=entries.some(entry=>entry.isIntersecting);setNear(inside);if(inside)start();},{rootMargin:'120px'});
  if(observer&&node.current)observer.observe(node.current);else{setNear(true);start();}
  return()=>{cancelled=true;clearTimeout(timer);observer?.disconnect();};
 },[url,visible,draft]);
 const kind=customMediaKind(url);
 const hostname=new URL(url).hostname.replace(/^www\./,''),embed=providerEmbed(url)||(preview?.embed&&providerEmbed(preview.embed.src));
 return <div ref={node} className="url-attachment">
  {(kind==='CIF'||kind==='MUSE')&&!preview?.custom?<section className={`custom-document custom-${kind.toLowerCase()}`} aria-busy={!preview&&!failed}><div className={kind==='CIF'?'cif-media-frame cif-pending':'muse-pending'}>{(preview||failed)&&<span className="quiet small">Preview unavailable</span>}</div><footer className="custom-source"><span>.{kind.toLowerCase()}</span></footer></section>:preview?.custom?<CustomMedia document={preview.custom} url={url} active={visible&&near} renderLink={link=><LinkPreviews text="" links={[link]} depth={depth+1}/>}/>:embed?<><div className={`provider-embed ${embed.video?'provider-video':''}`} style={embed.video?undefined:{height:embed.height}}>
    {visible&&near&&<iframe src={embed.src} title={`${embed.provider}: ${preview?.title||'player'}`} loading="eager" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>}
  </div><a className="attachment-source" href={url} target="_blank" rel="noopener noreferrer">{preview?.title&&preview.title!==hostname?preview.title:`Open in ${embed.provider}`}</a></>
  :preview?.kind==='image'&&preview.imageUrl?<><PostPhotos photos={[{id:`link:${url}`,name:preview.title||'Linked image',url:preview.imageUrl}]}/><a className="attachment-source" href={url} target="_blank" rel="noopener noreferrer">{hostname}</a></>
  :<a className="website-card" href={url} target="_blank" rel="noopener noreferrer" aria-label={preview?.title?`${preview.title}, ${hostname}`:hostname}>
    <span className="website-image">{preview?.imageUrl&&!broken?<img src={preview.imageUrl} alt="" loading="lazy" onError={()=>setBroken(true)}/>:<Globe size={28} weight="light"/>}</span>
    <span className="website-copy"><span className="website-host">{hostname}</span><strong>{preview?.title||hostname}</strong><span className="website-description">{preview?.description||new URL(url).pathname.replace(/^\//,'')}</span></span>
  </a>}
 </div>;
}
export function LinkPreviews({text,links=[],draft=false,depth=0}:{text:string;links?:string[];draft?:boolean;depth?:number}){
 const explicit=links.flatMap(value=>{try{return [attachmentUrl(value)];}catch{return [];}});
 const inline=textLinks(text).flatMap(link=>{try{return [attachmentUrl(link.url)];}catch{return [];}}).filter(url=>!parseDestination(url,location.origin));
 const urls=[...new Set([...explicit,...inline])].slice(0,3);
 return urls.length?<div className="website-previews">{urls.map(url=>depth>=2||parseDestination(url,location.origin)?<div className="attachment-source" key={url}><LinkedText text={url}/></div>:<WebsiteCard key={url} url={url} draft={draft} depth={depth}/>)}</div>:null;
}
