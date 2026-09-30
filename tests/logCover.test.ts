import {it,expect} from 'vitest';
import {orderedLogContributions,selectLogCoverUpload} from '../server/logCover';
import {logCover} from '../src/logCalendarModel';

const entry={members:['first','second'],coverFileId:null,contributions:[{userId:'second',fileIds:['second-photo']},{userId:'first',fileIds:['first-photo','first-later','first-audio']}]};
const file=(id:string,userId:string,createdAt?:string,mime='image/webp')=>({_id:id,userId,mime,createdAt});

it('uses event user order independently of contribution storage order',()=>{
 expect(orderedLogContributions(entry).map(person=>person.userId)).toEqual(['first','second']);
});

it('chooses an explicit cover, then the earliest timed photo',()=>{
 const files=new Map([
  ['first-photo',file('first-photo','first','2026-09-29T12:00:00.000Z')],
  ['first-later',file('first-later','first','2026-09-29T13:00:00.000Z')],
  ['first-audio',file('first-audio','first','2026-09-29T08:00:00.000Z','audio/webm')],
  ['second-photo',file('second-photo','second','2026-09-29T09:00:00.000Z')],
 ]);
 expect(selectLogCoverUpload(entry,files)?._id).toBe('second-photo');
 expect(selectLogCoverUpload({...entry,coverFileId:'first-later'},files)?._id).toBe('first-later');
});

it('falls back to event user and file order when photo time is missing or tied',()=>{
 const missing=new Map([
  ['first-photo',file('first-photo','first')],
  ['first-later',file('first-later','first','2026-09-29T13:00:00.000Z')],
  ['second-photo',file('second-photo','second','2026-09-29T09:00:00.000Z')],
 ]);
 expect(selectLogCoverUpload(entry,missing)?._id).toBe('first-photo');
 const tied=new Map([
  ['first-photo',file('first-photo','first','2026-09-29T09:00:00.000Z')],
  ['first-later',file('first-later','first','2026-09-29T09:00:00.000Z')],
  ['second-photo',file('second-photo','second','2026-09-29T09:00:00.000Z')],
 ]);
 expect(selectLogCoverUpload(entry,tied)?._id).toBe('first-photo');
});

it('uses the server-projected display cover in full entry views',()=>{
 const projected={cover:{id:'earliest',name:'Earliest',mime:'image/webp',bytes:10,url:'/earliest'},coverFileId:null,contributors:[{files:[{id:'array-first',name:'Newer',mime:'image/webp',bytes:10,url:'/newer'}]}]};
 expect(logCover(projected as any)?.id).toBe('earliest');
});
