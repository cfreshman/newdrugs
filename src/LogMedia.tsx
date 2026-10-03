import type {LogEntry} from '../shared/log';
import {usePanelVisible} from './PanelReadiness';
import {PostPhotos} from './PostPhotos';
import {AudioPlayer} from './AudioPlayer';
import {PosterVideo} from './CustomMedia';
import {logVideoPoster} from './logVideoPoster';
function LogVideo({id,src}:{id:string;src:string}){const visible=usePanelVisible();return <PosterVideo className="log-video" src={src} active={visible} poster={logVideoPoster(src,id)}/>;}
export function LogMedia({files}:{files:LogEntry['contributors'][number]['files']}){
 const visible=usePanelVisible();return <div className="log-media"><PostPhotos log photos={files.filter(f=>f.mime.startsWith('image/'))}/>{files.filter(f=>f.mime.startsWith('audio/')).map(file=><AudioPlayer key={file.id} src={file.url} active={visible} voiceNote/>)}{files.filter(f=>f.mime.startsWith('video/')).map(file=><LogVideo key={file.id} id={file.id} src={file.url}/>)}</div>;
}
