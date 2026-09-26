import {z} from 'zod';
import type {Filter} from 'mongodb';
import {users,type User} from './auth';
import {config} from './config';
import {AppError} from './errors';
import type {AdminUserPage} from '../shared/adminUsers';

export const adminUsersSchema=z.strictObject({query:z.string().trim().max(120).default(''),cursor:z.string().max(1024).optional(),limit:z.coerce.number().int().min(1).max(50).default(25)});
const cursorSchema=z.strictObject({createdAt:z.iso.datetime(),id:z.string().min(1).max(150),query:z.string(),stage:z.string()});
/** Called only after browser-owner or stage-scoped operator authorization. */
export async function listAdminUsers(raw:unknown):Promise<AdminUserPage>{
  const input=adminUsersSchema.parse(raw),query=input.query.replace(/^@/,'').toLowerCase();
  const base:Filter<User>={handle:{$type:'string'},internalTestAccount:{$ne:true}};
  if(query){const pattern=query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');base.$or=[{handle:{$regex:pattern,$options:'i'}},{name:{$regex:pattern,$options:'i'}},{_id:query}];}
  let filter=base;
  if(input.cursor){
    let cursor:z.infer<typeof cursorSchema>;
    try{cursor=cursorSchema.parse(JSON.parse(Buffer.from(input.cursor,'base64url').toString('utf8')));}catch{throw new AppError(422,'invalid_cursor','Restart this user search.');}
    if(cursor.query!==query||cursor.stage!==config.APP_ENV)throw new AppError(422,'invalid_cursor','Restart this user search.');
    filter={$and:[base,{$or:[{createdAt:{$lt:cursor.createdAt}},{createdAt:cursor.createdAt,_id:{$lt:cursor.id}}]}]};
  }
  const projection={_id:1,handle:1,name:1,createdAt:1,balanceNanos:1,reservedNanos:1,discoverable:1,suspendedAt:1,starterGranted:1};
  const [records,total]=await Promise.all([users().find(filter,{projection}).sort({createdAt:-1,_id:-1}).limit(input.limit+1).toArray(),users().countDocuments(base)]);
  const page=records.slice(0,input.limit),last=page.at(-1);
  return {items:page.map(user=>({id:user._id,handle:user.handle!,name:user.name||'',createdAt:user.createdAt,balanceNanos:user.balanceNanos||0,reservedNanos:user.reservedNanos||0,discoverable:Boolean(user.discoverable),suspended:Boolean(user.suspendedAt),starterGranted:Boolean(user.starterGranted)})),total,stage:config.APP_ENV,nextCursor:records.length>input.limit&&last?Buffer.from(JSON.stringify({createdAt:last.createdAt,id:last._id,query,stage:config.APP_ENV})).toString('base64url'):null};
}
