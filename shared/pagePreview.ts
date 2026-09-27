import {z} from 'zod';
const localPath=z.string().regex(/^\/(?!\/)[^\s<>"']*$/);
export const pagePreviewSchema=z.object({title:z.string(),description:z.string(),path:localPath,imagePath:localPath,imageAlt:z.string(),private:z.boolean(),imageWidth:z.number().int().positive().optional(),imageHeight:z.number().int().positive().optional()});
export type PagePreview=z.infer<typeof pagePreviewSchema>;
const escape=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
/** Replace only preview tags. Keep viewport, PWA, theme, icons and app scripts intact. */
export function renderPagePreview(html:string,input:PagePreview,origin:string):string{
 const preview=pagePreviewSchema.parse(input),base=new URL(origin).origin,url=new URL(preview.path,base).href,image=new URL(preview.imagePath,base).href;
 const tag=(key:string,value:string,property=false)=>`<meta ${property?'property':'name'}="${key}" content="${escape(value)}" />`;
 const tags=[`<title>${escape(preview.title)}</title>`,tag('description',preview.description),tag('og:type','website',true),tag('og:site_name','New Drugs',true),tag('og:title',preview.title,true),tag('og:description',preview.description,true),tag('og:url',url,true),tag('og:image',image,true),tag('og:image:alt',preview.imageAlt,true),tag('twitter:card','summary_large_image'),tag('twitter:title',preview.title),tag('twitter:description',preview.description),tag('twitter:image',image),tag('twitter:image:alt',preview.imageAlt),`<link rel="canonical" href="${escape(url)}" />`];
 if(preview.imageWidth&&preview.imageHeight)tags.push(tag('og:image:width',String(preview.imageWidth),true),tag('og:image:height',String(preview.imageHeight),true));
 if(preview.private)tags.push(tag('robots','noindex, nofollow'));
 return html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi,'').replace(/<meta\b[^>]*\b(?:name|property)\s*=\s*["'](?:og:[^"']+|twitter:[^"']+|description|robots)["'][^>]*>/gi,'').replace(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/gi,'').replace('</head>',`${tags.join('\n    ')}\n  </head>`);
}
