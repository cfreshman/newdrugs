import {expect,it} from 'vitest';
import {quizSortKey} from '../server/quizzes';

it('ranks BFF quizzes before any pins, then pins before completed quizzes',()=>{
 const date='2026-10-05T12:00:00.000Z';
 const ordered=[
  quizSortKey(false,false,false,1,date,'ordinary'),
  quizSortKey(false,false,true,22,date,'complete'),
  quizSortKey(false,true,false,1,date,'pinned'),
  quizSortKey(true,false,false,1,date,'bff'),
 ].sort().reverse();
 expect(ordered).toEqual([
  quizSortKey(true,false,false,1,date,'bff'),
  quizSortKey(false,true,false,1,date,'pinned'),
  quizSortKey(false,false,true,22,date,'complete'),
  quizSortKey(false,false,false,1,date,'ordinary'),
 ]);
});
