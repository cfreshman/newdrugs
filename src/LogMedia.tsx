import {useEffect,useRef} from 'react';
import type {LogEntry} from '../shared/log';
import {usePanelVisible} from './PanelReadiness';
import {PostPhotos} from './PostPhotos';
import {AudioPlayer} from './AudioPlayer';
function LogVideo({src}:{src:string}){const visible=usePanelVisible(),ref=useRef<HTMLVideoElement>(null);useEffect(()=>{if(!visible)ref.current?.pause();},[visible]);return <video ref={ref} className="log-video" src={src} controls playsInline preload="metadata" controlsList="nodownload"/>;}
export function LogMedia({files}:{files:LogEntry['contributors'][number]['files']}){
 const visible=usePanelVisible();return <div className="log-media"><PostPhotos log photos={files.filter(f=>f.mime.startsWith('image/'))}/>{files.filter(f=>f.mime.startsWith('audio/')).map(file=><AudioPlayer key={file.id} src={file.url} active={visible} voiceNote/>)}{files.filter(f=>f.mime.startsWith('video/')).map(file=><LogVideo key={file.id} src={file.url}/>)}</div>;
}

