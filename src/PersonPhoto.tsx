import {useEffect,useState} from 'react';
import {avatarImageUrl} from './logImageCache';

/** Always reserves the same square, including absent or unavailable photos. */
export function PersonPhoto({photoId,name,className='',alt=''}:{photoId?:string;name:string;className?:string;alt?:string}){
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[photoId]);
 return <div className={`person-photo ${className}`} aria-hidden={alt?undefined:true}>
  {photoId&&!failed?<img src={avatarImageUrl(photoId)} alt={alt} onError={()=>setFailed(true)}/>:<span className="person-photo-placeholder">{Array.from(name.trim().replace(/^@/,''))[0]?.toLocaleUpperCase()||'?'}</span>}
 </div>;
}
