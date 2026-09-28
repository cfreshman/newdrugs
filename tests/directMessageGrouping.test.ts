import {expect,it} from 'vitest';
import {DIRECT_MESSAGE_GROUP_MS,DIRECT_MESSAGE_TIME_GAP_MS,directMessageLayout,directMessageTimeLabel} from '../src/directMessageGrouping';

it('groups only consecutive same-sender messages within one minute and marks hour gaps',()=>{
 const start=Date.parse('2026-09-28T12:00:00.000Z'),message=(fromId:string,offset:number)=>({fromId,createdAt:new Date(start+offset).toISOString()});
 const layout=directMessageLayout([message('me',0),message('me',DIRECT_MESSAGE_GROUP_MS),message('me',2*DIRECT_MESSAGE_GROUP_MS+1),message('friend',2*DIRECT_MESSAGE_GROUP_MS+1+DIRECT_MESSAGE_TIME_GAP_MS)]);
 expect(layout).toEqual([
  {groupWithPrevious:false,groupWithNext:true,showTime:true},
  {groupWithPrevious:true,groupWithNext:false,showTime:false},
  {groupWithPrevious:false,groupWithNext:false,showTime:false},
  {groupWithPrevious:false,groupWithNext:false,showTime:true},
 ]);
});

it('formats sparse conversation markers relative to the viewer date',()=>{
 const now=new Date(2026,8,28,15),today=new Date(2026,8,28,9,5),yesterday=new Date(2026,8,27,9,5),older=new Date(2025,8,27,9,5);
 expect(directMessageTimeLabel(today.toISOString(),now)).toMatch(/^Today /);
 expect(directMessageTimeLabel(yesterday.toISOString(),now)).toMatch(/^Yesterday /);
 expect(directMessageTimeLabel(older.toISOString(),now)).toContain('2025');
});
