import {ownBirthdaySchema,birthdayPersonSchema} from './logBirthday';
import {logContactSchema,logCodeOutput,logJoinPreview} from './logJoining';
import {z} from 'zod';
import {Temporal} from '@js-temporal/polyfill';
export const logDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{try{return Temporal.PlainDate.from(value).toString()===value;}catch{return false;}},'Choose a valid calendar date.');
const logTitle=z.string().trim().max(160),logPlace=z.string().trim().max(160);
const logLinks=z.array(z.url().refine(url=>/^https?:\/\//i.test(url),'Use an HTTP or HTTPS link.')).max(8);
const logRecurrence=z.enum(['none','anniversary','birthday']).describe('A calendar reminder of this original date, such as an anniversary start. Never repeats the hangout or creates another entry. Birthday is retained for earlier records.');
const logNote=z.string().max(10000),logFileIds=z.array(z.uuid()).max(2).describe('Owned attachment IDs: at most one photo and one voice note per person. An already attached legacy video can be retained on edits, but new videos cannot be uploaded.');
export const logFields=z.strictObject({date:logDate,title:logTitle.default(''),place:logPlace.default(''),links:logLinks.default([]),recurrence:logRecurrence.default('none'),coverFileId:z.uuid().nullable().default(null)});
export const logFieldPatch=z.strictObject({date:logDate.optional(),title:logTitle.optional(),place:logPlace.optional(),links:logLinks.optional(),recurrence:logRecurrence.optional(),coverFileId:z.uuid().nullable().optional()});
export const logContribution=z.strictObject({note:logNote.default(''),fileIds:logFileIds.default([])});
export const logContributionPatch=z.strictObject({note:logNote.optional(),fileIds:logFileIds.optional(),imageFileId:z.uuid().nullable().optional(),voiceFileId:z.uuid().nullable().optional()});
export const logListInput={calendarDay:logDate.optional().describe('One calendar day, including anniversary reminders when includeAnniversaries is true. Do not combine with from/through or recurring.'),includeAnniversaries:z.boolean().default(false),from:logDate.optional(),through:logDate.optional(),query:z.string().trim().max(300).optional(),personId:z.string().max(100).optional(),scope:z.enum(['all','private','shared','invitations']).default('all'),recurring:z.boolean().default(false),order:z.enum(['newest','oldest']).default('newest').describe('Calendar-date order, then creation time and stable ID. Use oldest with from and limit 1 to find the next occupied day; newest with through finds the previous occupied day.'),limit:z.number().int().min(1).max(30).default(30),before:z.string().max(1500).optional()};
export const logMedia=z.object({id:z.string(),name:z.string(),mime:z.string(),url:z.string(),bytes:z.number()});
export const logCalendarTileSchema=z.object({id:z.string(),date:logDate,title:z.string(),createdAt:z.string(),cover:logMedia.nullable()});
export const logCalendarDaySchema=z.object({date:logDate,items:z.array(logCalendarTileSchema).max(9),more:z.boolean()});
export const logCalendarPageSchema=z.object({days:z.array(logCalendarDaySchema).max(42),indexing:z.boolean()});
export type LogCalendarTile=z.infer<typeof logCalendarTileSchema>;
export type LogCalendarPage=z.infer<typeof logCalendarPageSchema>;
export const logEntrySchema=logFields.extend({id:z.string(),ownerId:z.string(),historicalPeople:z.array(z.string()).optional().describe('Names from imported history without linked New Drugs accounts. These are not members and grant no access.'),revision:z.number(),createdAt:z.string(),updatedAt:z.string(),cover:logMedia.nullable().optional(),membership:z.enum(['member','invited','declined']),contributors:z.array(z.object({userId:z.string(),name:z.string(),handle:z.string().optional(),profileVisible:z.boolean().optional(),photoId:z.string().optional(),note:z.string(),noteTruncated:z.boolean().optional(),files:z.array(logMedia)})),invitations:z.array(z.object({userId:z.string(),name:z.string(),handle:z.string().optional()}))});
export const logViewSchema=z.strictObject({id:z.uuid(),name:z.string().trim().min(1).max(40),query:z.string().max(300).default(''),scope:z.enum(['all','private','shared']).default('all'),personId:z.string().max(100).optional()});
export const logPreferencesSchema=z.strictObject({todayPresentation:z.enum(['full','left','right']).default('full'),arrangement:z.enum(['calendar','gallery','list']).default('calendar'),views:z.array(logViewSchema).max(20).default([])});
export type LogEntry=z.infer<typeof logEntrySchema>;
export type LogFields=z.infer<typeof logFields>;
export type LogContribution=z.infer<typeof logContribution>;
export type LogFieldPatch=z.infer<typeof logFieldPatch>;
export type LogContributionPatch=z.infer<typeof logContributionPatch>;
export type LogPreferences=z.infer<typeof logPreferencesSchema>;
export type LogView=z.infer<typeof logViewSchema>;
export type LogList=z.infer<z.ZodObject<typeof logListInput>>;
export interface LogPage {items:LogEntry[];nextCursor:string|null}
export const logOutputs={
 'log.birthday_get':z.object({birthday:ownBirthdaySchema.nullable()}),
 'log.birthday_update':z.object({birthday:ownBirthdaySchema.nullable()}),
 'log.birthdays':z.object({items:z.array(birthdayPersonSchema)}),
 'log.contacts':z.object({items:z.array(logContactSchema),nextCursor:z.string().nullable(),indexing:z.boolean()}),
 'log.code':logCodeOutput,'log.join_preview':logJoinPreview,'log.join':logEntrySchema,'log.add_person':logEntrySchema,
 'log.people':z.object({nextCursor:z.string().nullable(),indexing:z.boolean(),items:z.array(z.object({userId:z.string(),name:z.string(),handle:z.string().optional()}))}),
 'log.neighbors':z.object({previous:logEntrySchema.nullable(),next:logEntrySchema.nullable()}),
 'log.calendar':logCalendarPageSchema,
 'log.list':z.object({items:z.array(logEntrySchema),nextCursor:z.string().nullable()}),
 ...Object.fromEntries(['get','create','update','contribute','respond','revoke'].map(name=>[`log.${name}`,logEntrySchema])),
 'log.leave':z.object({left:z.literal(true)}),'log.delete':z.object({deleted:z.literal(true)}),
 'log.preferences':logPreferencesSchema,'log.preferences_update':logPreferencesSchema,
 'log.export':z.object({items:z.array(logEntrySchema),text:z.string(),nextCursor:z.string().nullable()}),
};
/** Phrases and Boolean groups, not regex supplied by a caller. Spaces/+ are AND, | is OR, - negates a term. */
export function logQueryGroups(query:string){
 const tokens=query.match(/-?"[^"]*"|\||\+|[^\s|+]+/g)||[];
 const groups:{text:string;exclude:boolean}[][]=[[]];
 for(const token of tokens){
  if(token==='|'){if(groups.at(-1)!.length)groups.push([]);continue;}if(token==='+')continue;
  const exclude=token.startsWith('-'),text=(exclude?token.slice(1):token).replace(/^"|"$/g,'').trim();
  if(text)groups.at(-1)!.push({text,exclude});
 }
 return groups.filter(group=>group.length);
}
export function recurrenceOn(entry:Pick<LogEntry,'date'|'recurrence'>,year:number){
 if(entry.recurrence==='none'||year<Number(entry.date.slice(0,4)))return null;
 const original=Temporal.PlainDate.from(entry.date);return original.with({year},{overflow:'constrain'}).toString();
}
export function logPlainText(entries:LogEntry[]){return entries.map(entry=>[
 `${entry.date} · ${entry.title||'Untitled'}`,`Log entry: ${entry.id}`,entry.place,...(entry.historicalPeople?.length?[`Also with: ${entry.historicalPeople.join(', ')}`]:[]),...entry.contributors.flatMap(person=>[`${person.name}${person.handle?` (@${person.handle})`:''}`,person.note,...person.files.map(file=>`Attachment: ${file.name}`)]),...entry.links,
].filter(Boolean).join('\n')).join('\n\n');}
/** Keep explicit local edits; take newer values for fields the person did not edit. */
export function rebaseLogDraft(base:LogEntry,latest:LogEntry,userId:string,draft:LogFields,note:string,files:LogEntry['contributors'][number]['files']){
 const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b),before=base.contributors.find(p=>p.userId===userId),after=latest.contributors.find(p=>p.userId===userId);
 const entry=Object.fromEntries((Object.keys(logFields.shape) as (keyof LogFields)[]).map(key=>[key,same(draft[key],base[key])?latest[key]:draft[key]])) as LogFields;
 return {entry,note:note===(before?.note||'')?after?.note||'':note,files:same(files.map(f=>f.id),before?.files.map(f=>f.id)||[])?after?.files||[]:files};
}
