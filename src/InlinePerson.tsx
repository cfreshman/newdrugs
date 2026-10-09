import {UserCircle} from '@phosphor-icons/react';
import type {Destination} from '../shared/navigation';
import {avatarImageUrl} from './logImageCache';
import {NavLink} from './NavLink';

/** The existing post-author display, shared wherever a compact person identity is needed. */
export function InlinePerson({person,navigate,fallback='View profile'}:{person:{id:string;name?:string;handle?:string;photoId?:string;profileAvailable?:boolean};navigate(destination:Destination):void;fallback?:string}){
 const content=<>{person.photoId?<img src={avatarImageUrl(person.photoId)} alt=""/>:<UserCircle size={36} weight="light"/>}<span><strong>{person.name||person.handle||fallback}</strong>{person.handle&&<span className="quiet small">@{person.handle}</span>}</span></>;
 return person.profileAvailable===false?<span className="post-author quiet">{content}</span>:<NavLink className="post-author" to={{view:'person',resourceId:person.id}} navigate={navigate}>{content}</NavLink>;
}
