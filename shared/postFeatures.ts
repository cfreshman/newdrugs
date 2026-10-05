import {z} from 'zod';
import {textLinks} from './links';

export const MAX_POST_MENTIONS=10;
export interface PostMentionToken {start:number;end:number;handle:string}
export function postMentionTokens(text:string):PostMentionToken[]{
 const urls=textLinks(text),tokens:PostMentionToken[]=[];
 const pattern=/(^|[^\p{L}\p{N}_@])@([a-z0-9_]{3,24})(?![\p{L}\p{N}_])/giu;
 for(const match of text.matchAll(pattern)){
  const start=match.index+match[1].length,end=start+match[2].length+1;
  if(urls.some(url=>start<url.end&&end>url.start))continue;
  tokens.push({start,end,handle:match[2].toLowerCase()});
 }
 return tokens;
}

export const postMention=z.strictObject({start:z.number().int().nonnegative(),end:z.number().int().positive(),userId:z.string().min(1)});
export type PostMention=z.infer<typeof postMention>;

export const postPollInput=z.strictObject({
 items:z.array(z.string().trim().min(1).max(30)).min(2).max(8).refine(items=>new Set(items.map(item=>item.toLowerCase())).size===items.length,'Poll options must be different.'),
 duration:z.enum(['day','week','forever']).default('day'),
});
export type PostPollInput=z.infer<typeof postPollInput>;
export const postPollOutput=z.object({
 items:z.array(z.string()).min(2).max(8),duration:z.enum(['day','week','forever']),expiresAt:z.string().nullable(),
 counts:z.array(z.number().int().nonnegative()),totalVotes:z.number().int().nonnegative(),
 userVoteIndex:z.number().int().nonnegative().nullable(),expired:z.boolean(),
});
export type PostPoll=z.infer<typeof postPollOutput>;
export function newPostPoll(input:PostPollInput,createdAt:string){
 return {...input,expiresAt:input.duration==='forever'?null:new Date(Date.parse(createdAt)+(input.duration==='week'?7:1)*86400000).toISOString(),counts:input.items.map(()=>0),totalVotes:0};
}
