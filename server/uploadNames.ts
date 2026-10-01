import {extname} from 'node:path';

type NamedUpload={_id:string;name:string;mime:string;originalName?:string};
const extensions:Record<string,string>={'image/webp':'.webp','image/jpeg':'.jpg','image/png':'.png','application/pdf':'.pdf','audio/mpeg':'.mp3','audio/wav':'.wav','audio/ogg':'.ogg','audio/webm':'.weba','audio/mp4':'.m4a','video/webm':'.webm','video/mp4':'.mp4'};
/** Safe for shared projections and downloads, including uploads stored before ID filenames. */
export function publicUploadName(file:NamedUpload){
 const supplied=extname(file.name).toLowerCase();
 const extension=extensions[file.mime]||(/^\.[a-z0-9]{1,10}$/.test(supplied)?supplied:'');
 return `${file._id}${extension}`;
}
/** Owner-only metadata. Legacy uploads retain their previously stored filename. */
export const originalUploadName=(file:NamedUpload)=>file.originalName??file.name;
