import {AudioPlayer} from './AudioPlayer';
import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type ReactNode,type RefObject} from 'react';
import {CaretLeft,CaretRight,Play} from '@phosphor-icons/react';
import type {CustomDocument,MuseDocument,CifDocument,PopsDocument} from '../shared/customMedia';
import {customMediaKind} from '../shared/customMedia';
import {useExperience} from './ExperienceContext';
import {LinkedText} from './LinkedText';
import {loadLinkPreview} from './linkPreviewCache';
import {operation} from './api';

function Media(props:{src:string;kind:'audio'|'video';active:boolean;muted?:boolean;autoplay?:boolean}){return props.kind==='audio'?<AudioPlayer key={props.src} src={props.src} active={props.active}/>:<PosterVideo src={props.src} active={props.active} muted={props.muted} autoplay={props.autoplay}/>;}
export function VideoMedia({src,active,muted=false,autoplay=false,onError,poster,videoRef,onLoadedMetadata,onPlay}:{src:string;active:boolean;muted?:boolean;autoplay?:boolean;onError?:()=>void;poster?:string;videoRef?:RefObject<HTMLVideoElement|null>;onLoadedMetadata?:(video:HTMLVideoElement)=>void;onPlay?:()=>void}){
 const ref=useRef<HTMLMediaElement|null>(null);
 useEffect(()=>{const node=ref.current!;const hide=()=>{if(document.hidden)node.pause();};const other=(event:Event)=>{if((event as CustomEvent).detail!==node&&!node.muted)node.pause();};document.addEventListener('visibilitychange',hide);window.addEventListener('newdrugs:media-play',other);return()=>{node.pause();document.removeEventListener('visibilitychange',hide);window.removeEventListener('newdrugs:media-play',other);};},[src]);
 useEffect(()=>{if(!active)ref.current?.pause();},[active]);
 const play=()=>{onPlay?.();if(ref.current&&!ref.current.muted)window.dispatchEvent(new CustomEvent('newdrugs:media-play',{detail:ref.current}));};
 return <video ref={node=>{ref.current=node;if(videoRef)videoRef.current=node;}} controls playsInline preload="metadata" muted={muted} autoPlay={active&&autoplay&&muted} src={src} poster={poster} onPlay={play} onError={onError} onLoadedMetadata={event=>onLoadedMetadata?.(event.currentTarget)}/>;
}
export function PosterVideo({src,active,poster,initialRatio,className='',muted=false,autoplay=false,onError}:{src:string;active:boolean;poster?:string;initialRatio?:number;className?:string;muted?:boolean;autoplay?:boolean;onError?:()=>void}){
 const video=useRef<HTMLVideoElement>(null),[started,setStarted]=useState(false),[ratio,setRatio]=useState(initialRatio||16/9),[fetchedPoster,setFetchedPoster]=useState<string|undefined>(),[posterBroken,setPosterBroken]=useState(false);
 useLayoutEffect(()=>{setStarted(false);setRatio(initialRatio||16/9);},[src,initialRatio]);
 useEffect(()=>{setFetchedPoster(undefined);if(poster||!active||!/^https?:\/\//.test(src))return;let cancelled=false;void loadLinkPreview(src).then(preview=>{if(!cancelled&&preview.kind==='video')setFetchedPoster(preview.imageUrl);}).catch(()=>{});return()=>{cancelled=true;};},[src,active,poster]);
 const imageUrl=poster||fetchedPoster;
 useEffect(()=>setPosterBroken(false),[imageUrl]);
 const style={'--video-ratio':ratio} as CSSProperties;
 return <div className={`poster-video ${className}`} style={style} data-embed-interactive onClick={event=>event.stopPropagation()}>
  <VideoMedia src={src} active={active} poster={imageUrl} muted={muted} autoplay={autoplay} videoRef={video} onError={onError} onPlay={()=>setStarted(true)} onLoadedMetadata={node=>{if(node.videoWidth&&node.videoHeight){const next=node.videoWidth/node.videoHeight;setRatio(previous=>Math.abs(previous-next)/previous<.02?previous:next);}}}/>
  {!started&&<button className="poster-video-start" type="button" aria-label="Play video" onClick={event=>{event.stopPropagation();void video.current?.play().catch(()=>{});}}>{imageUrl&&!posterBroken&&<img src={imageUrl} alt="" onLoad={event=>{const image=event.currentTarget;if(image.naturalWidth&&image.naturalHeight&&!initialRatio)setRatio(image.naturalWidth/image.naturalHeight);}} onError={()=>setPosterBroken(true)}/>}<span className="poster-video-play"><Play size={23} weight="fill"/></span></button>}
 </div>;
}
function Artwork({src,alt,onDimensions}:{src:string;alt:string;onDimensions?:(size:{width:number;height:number})=>void}){
 const image=useRef<HTMLImageElement>(null);
 const report=()=>{if(image.current?.naturalWidth&&image.current.naturalHeight)onDimensions?.({width:image.current.naturalWidth,height:image.current.naturalHeight});};
 useLayoutEffect(report,[src,onDimensions]);
 const experience=useExperience();return <button type="button" className="custom-artwork" aria-label={`View ${alt}`} onClick={event=>{const img=event.currentTarget.querySelector('img')!;experience?.media([{id:src,url:src,name:alt,width:img.naturalWidth,height:img.naturalHeight,element:event.currentTarget}],0);}}><img ref={image} src={src} alt={alt} loading="lazy" onLoad={report}/></button>;
}
function Source({href,children}:{href?:string;children:ReactNode}){return href?<a href={href} target="_blank" rel="noopener noreferrer">{children}</a>:<span>{children}</span>;}
export function MusePlayer({document,active,compact=false}:{document:MuseDocument;active:boolean;compact?:boolean}){
 const layout=compact?'slim':document.preferredLayout||'any';
 return <div className={`muse-content muse-${layout}`}>{document.art&&<Artwork src={document.art} alt={document.title||'Cover artwork'}/>}<div className="muse-meta"><strong><Source href={document.url?.audio||(document.distributable?document.audio:undefined)}>{document.title||'Untitled'}</Source></strong>{document.artist&&<Source href={document.url?.artist}>{document.artist}</Source>}{document.album&&<span className="quiet small"><Source href={document.url?.album}>{document.album}</Source></span>}</div>{document.audio&&<Media src={document.audio} kind="audio" active={active}/>}</div>;
}
function CifAudio({src,active}:{src:string;active:boolean}){
 const [muse,setMuse]=useState<MuseDocument|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{if(!active||customMediaKind(src)!=='MUSE')return;let cancelled=false;void loadLinkPreview(src).then(value=>{if(!cancelled){if(value.custom?.spec==='MUSE')setMuse(value.custom);else setFailed(true);}}).catch(()=>{if(!cancelled)setFailed(true);});return()=>{cancelled=true;};},[src,active]);
 return customMediaKind(src)==='MUSE'?muse?<MusePlayer document={muse} active={active} compact/>:<Source href={src}>{failed?'Open audio':'Loading audio…'}</Source>:<Media src={src} kind="audio" active={active}/>;
}
function CifPicture({card,caption,tag,setTag}:{card:NonNullable<CifDocument['card']>;caption?:string;tag:number|null;setTag(value:number|null):void}){
 const [size,setSize]=useState<{width:number;height:number}|null>(null);
 const ratio=size?size.width/size.height:1;
 return <div className="cif-media-frame"><div className="cif-picture" style={{width:`${Math.min(1,ratio)*100}%`,height:`${Math.min(1,1/ratio)*100}%`}}><Artwork src={card.image!} alt={card.alt||caption||'Image'} onDimensions={setSize}/>{card.tags?.map((item,i)=><div className="cif-tag" key={i} style={{left:`${item.rx*100}%`,top:`${item.ry*100}%`}}><button type="button" aria-label={item.label||`Image tag ${i+1}`} aria-expanded={tag===i} onClick={()=>setTag(tag===i?null:i)}>{i+1}</button>{tag===i&&<div className="cif-tag-label"><Source href={item.url}>{item.label||'Open link'}</Source></div>}</div>)}</div></div>;
}
function CifPlayer({document,active}:{document:CifDocument;active:boolean}){
 const [index,setIndex]=useState(0),[tag,setTag]=useState<number|null>(null),touch=useRef<{x:number;y:number}|null>(null),suppressClick=useRef(0);
 const cards=document.cards||[document.card||{}],card=cards[Math.min(index,cards.length-1)];if(!card)return null;
 const audio=card.audio||document.audio,artist=card.artist||document.artist,location=card.location||document.location,caption=card.caption||document.caption,metadata={...document.metadata,...card.metadata};
 const move=(next:number)=>{setIndex(Math.max(0,Math.min(cards.length-1,next)));setTag(null);};
 return <div className="cif-content"><div className="cif-stage" onClickCapture={event=>{if(performance.now()<suppressClick.current){event.preventDefault();event.stopPropagation();}}} onTouchStart={event=>{if(event.touches.length!==1){touch.current=null;return;}if(event.touches.length===1&&!(event.target as Element).closest('a,audio,video,input'))touch.current={x:event.touches[0].clientX,y:event.touches[0].clientY};}} onTouchEnd={event=>{const start=touch.current;touch.current=null;if(!start||!event.changedTouches.length)return;const dx=event.changedTouches[0].clientX-start.x,dy=event.changedTouches[0].clientY-start.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5){suppressClick.current=performance.now()+350;move(index+(dx<0?1:-1));}}} onTouchCancel={()=>{touch.current=null;}}>
  {card.image&&<CifPicture key={card.image} card={card} caption={caption} tag={tag} setTag={setTag}/>}
  {card.video&&<div className="cif-media-frame"><Media key={card.video} src={card.video} kind="video" active={active} muted={Boolean(card.mute||audio||document.autoplay)} autoplay={document.autoplay}/></div>}
  {!card.image&&!card.video&&<div className="cif-media-frame">{audio&&<CifAudio key={audio} src={audio} active={active}/>}</div>}
 </div>{cards.length>1&&<nav className="cif-navigation" aria-label="CIF cards"><button type="button" aria-label="Previous card" disabled={index===0} onClick={()=>move(index-1)}><CaretLeft size={19}/></button><span>{index+1} / {cards.length}</span><button type="button" aria-label="Next card" disabled={index===cards.length-1} onClick={()=>move(index+1)}><CaretRight size={19}/></button></nav>}
 {audio&&(card.image||card.video)&&<CifAudio key={audio} src={audio} active={active}/>} {caption&&<p><LinkedText text={caption}/></p>}{artist?.name&&<p className="small"><Source href={artist.url}>{artist.name}</Source></p>}{location?.name&&<p className="quiet small">{location.name}</p>}{Object.keys(metadata).length>0&&<details className="cif-metadata"><summary>Details</summary><dl>{Object.entries(metadata).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></details>}</div>;
}
const textCache=new Map<string,string>();
function TextBlock({url,active}:{url:string;active:boolean}){
 const [text,setText]=useState(textCache.get(url)),[failed,setFailed]=useState(false);
 useEffect(()=>{if(text!==undefined||!active)return;let cancelled=false;void operation<{text:string}>('links.text',{url}).then(value=>{if(textCache.size>=100)textCache.delete(textCache.keys().next().value!);textCache.set(url,value.text);if(!cancelled)setText(value.text);}).catch(()=>{if(!cancelled)setFailed(true);});return()=>{cancelled=true;};},[url,active,text]);
 return text!==undefined?<div className="pops-text"><LinkedText text={text}/></div>:<Source href={url}>{failed?'Open text':'Loading text…'}</Source>;
}
function PopsPlayer({document,active,renderLink}:{document:PopsDocument;active:boolean;renderLink(url:string):ReactNode}){
 const [expanded,setExpanded]=useState(false);const blocks=expanded?document.blocks:document.blocks.slice(0,3),presentation=document.presentation;
 return <div className="pops-content"><strong className="pops-title">{document.title||'Untitled'}</strong>{expanded&&document.pageAudio&&<CifAudio src={document.pageAudio} active={active}/>}
 <div className={`pops-body pops-font-${presentation?.font||'sans'} pops-size-${presentation?.size||'normal'} pops-align-${presentation?.align||'left'} ${expanded?'pops-expanded':''}`}>{blocks.map((block,i)=><figure className="pops-block" key={i}>{block.text?<div className="pops-text"><LinkedText text={block.text}/></div>:block.image?<Artwork src={block.image} alt={block.caption||'Article image'}/>:block.video?<Media src={block.video} kind="video" active={active}/>:block.audio?customMediaKind(block.audio)==='MUSE'?<CifAudio src={block.audio} active={active}/>:<Media src={block.audio} kind="audio" active={active}/>:block.link?renderLink(block.link):block.textlink?<TextBlock url={block.textlink} active={active}/>:null}{block.caption&&<figcaption>{block.caption}</figcaption>}</figure>)}</div>
 {document.blocks.length>0&&<button type="button" className="custom-expand" onClick={()=>setExpanded(value=>!value)}>{expanded?'Show less':'Read article'}</button>}</div>;
}
export function CustomMedia({document,url,active,renderLink}:{document:CustomDocument;url:string;active:boolean;renderLink(url:string):ReactNode}){
 return <section className={`custom-document custom-${document.spec.toLowerCase()}`} data-embed-interactive onClick={event=>event.stopPropagation()}>
 {document.spec==='MUSE'?<MusePlayer document={document} active={active}/>:document.spec==='CIF'?<CifPlayer document={document} active={active}/>:<PopsPlayer document={document} active={active} renderLink={renderLink}/>}
 <footer className="custom-source"><a href={`https://${document.spec.toLowerCase()}.cyberspace.page`} target="_blank" rel="noopener noreferrer">.{document.spec.toLowerCase()}</a>{document.spec==='POPS'&&<a href={url} target="_blank" rel="noopener noreferrer">Source</a>}</footer>
 </section>;
}
