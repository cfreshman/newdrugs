import {inviteEntry,invitePhotos,invitePeople} from './logInvites';
import {rows} from './db';import {users} from './auth';import {uploads,readUpload} from './uploads';
import {parseDestination,destinationPath,type Destination} from '../shared/navigation';
import type {PagePreview} from '../shared/pagePreview';import {AppError} from './errors';
const base:PagePreview={title:'New Drugs',description:'Made in New England',path:'/',imagePath:'/share.png?v=gradient',imageAlt:'New Drugs',imageWidth:1200,imageHeight:630,private:false};
const text=(value:unknown)=>typeof value==='string'?[...value.replace(/\s+/g,' ').trim()].slice(0,300).join(''):'';
type ImageKind='post'|'person'|'log-invite';
const safeId=(id:string)=>/^[A-Za-z0-9:_.-]{1,150}$/.test(id);
async function profile(id:string){return users().findOne({_id:id,discoverable:true,suspendedAt:null},{projection:{name:1,handle:1,bio:1,photos:1}});}
async function post(id:string){const row=await rows('posts').findOne({_id:id,deletedAt:{$exists:false},moderatedAt:{$exists:false}},{projection:{userId:1,text:1,fileIds:1}});if(!row)return null;const author=await users().findOne({_id:String(row.userId),suspendedAt:null},{projection:{handle:1,name:1}});return author?{row,author}:null;}
async function firstPhoto(references:{id:string;owner:string}[]){
 if(!references.length)return null;
 const found=await uploads().find({_id:{$in:references.map(reference=>reference.id)},ready:true,deletedAt:{$exists:false},moderatedAt:{$exists:false},mime:/^image\//}).toArray();
 for(const ref of references){const file=found.find(file=>file._id===ref.id&&file.userId===ref.owner);if(file)return file;}return null;
}
/** No viewer identity is used: a signed-in visit must never enrich a public preview. */
export async function previewImageFile(kind:ImageKind,id:string){
 if(!safeId(id))return null;
 if(kind==='person'){const owner=await profile(id);return owner?.photos?.[0]?firstPhoto([{id:owner.photos[0],owner:owner._id}]):null;}
 if(kind==='post'){const value=await post(id);return value?firstPhoto((value.row.fileIds as string[]||[]).map(id=>({id,owner:value.author._id}))):null;}
 const row=await inviteEntry(id);return row?(await invitePhotos(row))[0]||null:null;
}
export async function readPagePreviewImage(kind:string,id:string){
 if(!['post','person','log-invite'].includes(kind))throw new AppError(404,'not_found','This preview is unavailable.');
 const file=await previewImageFile(kind as ImageKind,id);if(!file)throw new AppError(404,'not_found','This preview is unavailable.');
 return readUpload({userId:file.userId,source:'external',scope:'read'},file._id);
}
export async function pagePreview(path:string):Promise<PagePreview>{
 if(!path.startsWith('/')||path.startsWith('//')||path.length>2048)return {...base};
 const destination=parseDestination(path,'https://druggie.org');if(!destination)return {...base};
 const clean:Destination={view:destination.view,...(destination.resourceId?{resourceId:destination.resourceId}:{}),...(destination.mode?{mode:destination.mode}:{})};
 const preview={...base,path:destinationPath(clean)},id=destination.resourceId;
 const image=async(kind:ImageKind)=>{const file=id&&await previewImageFile(kind,id);if(file){preview.imagePath=`/api/share-images/${kind}/${encodeURIComponent(id!)}${file.sha256?`?v=${file.sha256.slice(0,16)}`:''}`;delete preview.imageWidth;delete preview.imageHeight;}};
 if(destination.view==='log_join'){preview.title='View hangout (New Drugs)';preview.private=true;const entry=id&&await inviteEntry(id);if(entry){if(text(entry.title))preview.title=`${text(entry.title)} (New Drugs)`;const people=await invitePeople(entry);preview.description=text([...people.map(person=>person.handle?`@${person.handle}`:person.name),...(entry.historicalPeople||[])].join(', '))||base.description;}await image('log-invite');return preview;}
 if(destination.view==='log'&&id||destination.view==='log_code'){preview.title='View hangout (New Drugs)';preview.private=true;return preview;}
 if(destination.view==='person'&&id){
  preview.title='View profile (New Drugs)';preview.private=true;const owner=await profile(id);
  if(owner){preview.title=`${owner.name||owner.handle||'Profile'}${owner.handle&&owner.name!==owner.handle?` (@${owner.handle})`:''} (New Drugs)`;preview.description=text(owner.bio)||base.description;preview.private=false;await image('person');}return preview;
 }
 if(destination.view==='post'&&id){
  preview.title='View post (New Drugs)';preview.private=true;const value=await post(id);
  if(value){preview.title=`Post${value.author.handle?` by @${value.author.handle}`:''} (New Drugs)`;preview.description=text(value.row.text)||base.description;preview.private=false;await image('post');}return preview;
 }
 if(!['chat','feed','people','post_list'].includes(destination.view)||id){preview.private=true;}
 return preview;
}
