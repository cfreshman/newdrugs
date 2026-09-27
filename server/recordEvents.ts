import {queueLogSearch} from './search/log';
import {randomUUID} from 'node:crypto';
import type {ClientSession} from 'mongodb';
import {rows} from './db';
import type {RecordInvalidation} from '../shared/liveState';
type LogAudience={_id:string;date?:string;members?:string[];invited?:string[];deletedAt?:string};
/** Mutation-bound invalidations retain the former audience on removal. No source text is published. */
export async function publishLogChange(previous:LogAudience|null,next:LogAudience,session?:ClientSession){
 await queueLogSearch(next._id,session);
 const userIds=[...new Set([...(previous?.members||[]),...(previous?.invited||[]),...(next.members||[]),...(next.invited||[])])];
 if(!userIds.length)return;
 const previousUsers=[...new Set([...(previous?.members||[]),...(previous?.invited||[])])],nextUsers=[...new Set([...(next.members||[]),...(next.invited||[])])];
 const membershipChanged=previousUsers.slice().sort().join('|')!==nextUsers.slice().sort().join('|');
 const payload:RecordInvalidation={keys:['log',...(membershipChanged?['people']:[])],log:[{id:next._id,...(next.date?{date:next.date}:{}),...(previous?.date?{previousDate:previous.date}:{}),...(next.deletedAt?{deleted:true}:{})}]};
 await rows('recordEvents').insertOne({_id:randomUUID(),userIds,payload,notificationUsers:previousUsers.filter(id=>!nextUsers.includes(id)),expiresAt:new Date(Date.now()+3600000)},{session});
}
