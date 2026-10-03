import type {ClientSession} from 'mongodb';
import {users} from './auth';
import {rows} from './db';
import {logPersonGrams} from '../shared/logPeople';

export function logMemberPair(a:string,b:string){return [a,b].sort().join(':');}
export function logMemberPairs(members:string[]){return members.flatMap((member,index)=>members.slice(index+1).map(other=>logMemberPair(member,other)));}

/** Username lookup is indexed and bounded before it is joined to authorized Log entries. */
export async function matchingLogPeople(text:string,session?:ClientSession){
 const handleOnly=text.startsWith('@'),fragment=(handleOnly?text.slice(1):text).trim().toLowerCase();
 if(!fragment||fragment.length>80)return [];
 const handleEligible=/^[a-z0-9_]{1,24}$/.test(fragment);
 const prefix={handle:{$gte:fragment,$lt:`${fragment}\uffff`}};
 const gram=fragment.slice(0,Math.min(fragment.length,3));
 const clauses=fragment.length>=2?[...(handleEligible?[{logHandleGrams:gram},prefix]:[]),...(!handleOnly?[{logNameGrams:gram}]:[])]:handleEligible?[prefix]:[];
 if(!clauses.length)return [];
 const candidates=await users().find({$or:clauses,suspendedAt:null},{session,projection:{_id:1,handle:1,name:1}}).limit(1001).toArray();
 // Keep the participant lane bounded for broad fragments; ordinary Log text
 // matches remain available and a longer name narrows the indexed lookup.
 if(candidates.length>1000)return [];
 const matches=candidates.filter(person=>handleEligible&&person.handle?.includes(fragment)||!handleOnly&&person.name?.toLowerCase().includes(fragment));
 return matches.length>100?[]:matches.map(person=>({id:person._id,handle:person.handle||'',name:person.name||''}));
}

/** Versioned, cursor-bounded backfill for accounts created before fragment indexing. */
export async function backfillLogPeople(){
 const meta=rows('logSearchMeta'),key='person-grams-v1',state=await meta.findOne({_id:key});
 if(state?.done)return 0;
 const page=await users().find({handle:{$type:'string'},...(state?.cursor?{_id:{$gt:String(state.cursor)}}:{})},{projection:{_id:1,handle:1,name:1}}).sort({_id:1}).limit(50).toArray();
 for(const user of page)if(user.handle)await users().updateOne({_id:user._id,handle:user.handle,name:user.name},{$set:{logHandleGrams:logPersonGrams(user.handle),logNameGrams:logPersonGrams(user.name)}});
 await meta.updateOne({_id:key},{$set:{cursor:page.at(-1)?._id||state?.cursor||'',done:page.length<50}},{upsert:true});
 return page.length;
}
