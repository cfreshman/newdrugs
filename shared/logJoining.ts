import {z} from 'zod';
export const logCodeSchema=z.string().regex(/^[a-f0-9]{32}$/,'Use a New Drugs hangout code.');
export const logContactSchema=z.object({id:z.string(),name:z.string(),handle:z.string().optional(),photoId:z.string().optional(),sharedHangouts:z.number(),friend:z.boolean().optional()});
export const logCodeOutput=z.object({entryId:z.string(),code:logCodeSchema,url:z.string()});
export const logJoinPreview=z.object({entryId:z.string(),title:z.string(),date:z.string(),place:z.string(),joined:z.boolean(),links:z.array(z.string()).default([]),recurrence:z.enum(['none','anniversary','birthday']).default('none'),historicalPeople:z.array(z.string()).default([]),contributors:z.array(z.object({userId:z.string(),name:z.string(),handle:z.string().optional(),note:z.string(),files:z.array(z.object({id:z.string(),name:z.string(),mime:z.string(),bytes:z.number(),url:z.string()}))})).default([]),photos:z.array(z.object({id:z.string(),name:z.string(),url:z.string()})).default([]),people:z.array(z.object({id:z.string(),name:z.string(),handle:z.string().optional()}))});
export type LogContact=z.infer<typeof logContactSchema>;
export type LogJoinPreview=z.infer<typeof logJoinPreview>;
export type LogCode=z.infer<typeof logCodeOutput>;
/** Only a New Drugs link or a bare code. Scanning never navigates to arbitrary QR URLs. */
export function parseLogCode(value:string,origin:string){
 const text=value.trim();if(logCodeSchema.safeParse(text).success)return text;
 try{const url=new URL(text,origin),base=new URL(origin);if(url.username||url.password||!['http:','https:'].includes(url.protocol))return null;
 const own=url.origin===base.origin,known=url.protocol==='https:'&&['druggie.org','dev.druggie.org'].includes(url.hostname)&&!url.port;
 if(!own&&!known)return null;
 const match=/^\/(?:log\/)?join\/([a-f0-9]{32})\/?$/.exec(url.pathname);return match?.[1]||null;
 }catch{return null;}
}
