import type {ClientSession} from 'mongodb';
import {rows} from './db';
import {AppError} from './errors';

interface HideState {_id:string;ids:string[]}
interface HideRow {_id:string;userId:string;personId:string;createdAt:string}
const states=()=>rows<HideState>('peopleHideStates'),hides=()=>rows<HideRow>('peopleHides');
const maxHidden=2000;
export const hideKey=(userId:string,personId:string)=>`${userId}:${personId}`;
export async function hiddenPersonIds(userId:string,session?:ClientSession){return (await states().findOne({_id:userId},{session,projection:{ids:1}}))?.ids||[];}
export async function isPersonHidden(userId:string,personId:string,session?:ClientSession){return Boolean(await hides().findOne({_id:hideKey(userId,personId)},{session,projection:{_id:1}}));}
export async function setPersonHidden(userId:string,personId:string,hidden:boolean,session:ClientSession){
 const key=hideKey(userId,personId);
 if(hidden){
  const current=await hiddenPersonIds(userId,session);
  if(!current.includes(personId)&&current.length>=maxHidden)throw new AppError(422,'hidden_limit','Your Hidden list is full.');
  await states().updateOne({_id:userId},{$addToSet:{ids:personId}},{upsert:true,session});
  await hides().updateOne({_id:key},{$setOnInsert:{userId,personId,createdAt:new Date().toISOString()}},{upsert:true,session});
 }else{
  await states().updateOne({_id:userId},{$pull:{ids:personId}},{session});
  await hides().deleteOne({_id:key},{session});
 }
}
export async function hiddenPeoplePage(userId:string,limit:number,before?:string,session?:ClientSession){
 let cursor:{at:string;id:string}|null=null;
 if(before){try{const value=JSON.parse(Buffer.from(before,'base64url').toString());if(typeof value.at!=='string'||typeof value.id!=='string')throw Error();cursor=value;}catch{throw new AppError(422,'hidden_cursor','Reload Hidden.');}}
 const found=await hides().find({userId,...(cursor?{$or:[{createdAt:{$lt:cursor.at}},{createdAt:cursor.at,_id:{$lt:cursor.id}}]}:{})},{session}).sort({createdAt:-1,_id:-1}).limit(limit+1).toArray();
 const page=found.slice(0,limit),last=page.at(-1);
 return {items:page,nextCursor:found.length>limit&&last?Buffer.from(JSON.stringify({at:last.createdAt,id:last._id})).toString('base64url'):null};
}
