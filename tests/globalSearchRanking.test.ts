import {expect,it} from 'vitest';
import {rankGlobalCandidates} from '../server/search/global';

it('uses one score for every source and lets a strong source occupy the whole result window',()=>{
 const item=(source:'public'|'log'|'chat'|'messages',id:string,title:string,semantic:number)=>({source,kind:source==='messages'?'message' as const:source==='public'?'post' as const:source,title,id,snippet:title,url:`https://druggie.org/${source}/${id}`,semantic});
 const candidates=[item('public','p1','unrelated',.3),item('log','l1','fleek',.5),item('chat','c1','fleek',.7),item('messages','m1','fleek',.6),item('chat','c2','fleek again',.65)];
 const ranked=rankGlobalCandidates(candidates,'fleek',3);
 expect(ranked.map(row=>row.id)).toEqual(['c1','c2','m1']);
 ranked.forEach((row,index)=>expect(row.score).toBeCloseTo([.76,.72,.68][index]));
 expect(rankGlobalCandidates(candidates,'fleek',5).at(-1)?.id).toBe('p1');
});
