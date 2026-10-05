import {expect,it} from 'vitest';
import {postMentionTokens,postPollInput,newPostPoll} from '../shared/postFeatures';
import {completedMentionHandles} from '../src/postMentionPreview';

it('finds exact mention text without treating URLs or email addresses as people',()=>{
 const text='Hi @Laura_2. See https://example.com/@hidden and mail@example.com, then @benjy ';
 expect(postMentionTokens(text).map(token=>({text:text.slice(token.start,token.end),handle:token.handle}))).toEqual([
  {text:'@Laura_2',handle:'laura_2'},{text:'@benjy',handle:'benjy'},
 ]);
});

it('waits until the caret or selection leaves a mention',()=>{
 expect(completedMentionHandles('@laura',{start:6,end:6})).toEqual([]);
 expect(completedMentionHandles('@laura ',{start:7,end:7})).toEqual(['laura']);
 expect(completedMentionHandles('@laura',{start:0,end:3})).toEqual([]);
 expect(completedMentionHandles('@laura',{start:0,end:0})).toEqual([]);
 expect(completedMentionHandles('@laura',null)).toEqual(['laura']);
 expect(completedMentionHandles('@laura @benjy',{start:13,end:13})).toEqual(['laura']);
});

it('keeps polls bounded and uses one-day or one-week expiration',()=>{
 expect(postPollInput.safeParse({items:['yes','YES'],duration:'day'}).success).toBe(false);
 expect(postPollInput.safeParse({items:['one'],duration:'day'}).success).toBe(false);
 const poll=postPollInput.parse({items:[' Yes ',' No '],duration:'week'});
 expect(newPostPoll(poll,'2026-10-05T12:00:00.000Z')).toMatchObject({items:['Yes','No'],counts:[0,0],totalVotes:0,expiresAt:'2026-10-12T12:00:00.000Z'});
 expect(newPostPoll(postPollInput.parse({items:['Yes','No'],duration:'forever'}),'2026-10-05T12:00:00.000Z').expiresAt).toBeNull();
});
