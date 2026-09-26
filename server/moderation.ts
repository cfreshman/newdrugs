import type { ClientSession } from 'mongodb';
import { rows } from './db';
import { users } from './auth';
import { requireValue, AppError } from './errors';
import { enqueueSearch } from './search/queue';
export async function moderatePost(postId:string, hidden:boolean, reason:string, keyId:string, session:ClientSession) {
  const post=requireValue(await rows('posts').findOne({_id:postId},{session}));
  if(post.deletedAt&&!hidden)throw new AppError(409,'deleted','An author-deleted post cannot be restored.');
  await rows<{_id:string;interactionRevision:number}>('posts').updateOne({_id:postId},hidden?{$set:{moderatedAt:new Date().toISOString(),moderationReason:reason,moderatedBy:keyId},$inc:{interactionRevision:1}}:{$unset:{moderatedAt:'',moderationReason:'',moderatedBy:''},$inc:{interactionRevision:1}},{session});
  if(hidden)await rows('notifications').deleteMany({postId},{session});
  await enqueueSearch('posts',postId,session);
  return {postId,hidden};
}
export async function suspendUser(userId:string,suspended:boolean,reason:string,session:ClientSession) {
  requireValue(await users().findOneAndUpdate({_id:userId,handle:{$type:'string'}},suspended?{$set:{suspendedAt:new Date().toISOString(),suspensionReason:reason},$inc:{authorityRevision:1}}:{$unset:{suspendedAt:'',suspensionReason:''},$inc:{authorityRevision:1}},{session}));
  if(suspended){
    const now=new Date().toISOString();
    await rows('sessions').deleteMany({userId},{session});
    await rows('tokens').updateMany({userId},{$set:{revokedAt:now}},{session});
    await rows('agentCredentials').updateMany({userId},{$set:{revokedAt:now}},{session});
    await rows('pushSubscriptions').updateMany({userId},{$set:{revokedAt:now}},{session});
    await rows<{_id:string;revision:number;generation:number}>('automations').updateMany({userId,status:'active'},{$set:{status:'paused',nextRunAt:null,blockedReason:'This account is suspended.'},$inc:{revision:1,generation:1}},{session});
    await rows('runs').updateMany({userId,status:{$nin:['completed','cancelled','failed']}},{$set:{status:'queued',cancelRequested:true,superseded:true,nextAttempt:0,leaseUntil:0}},{session});
  }
  await enqueueSearch('profiles',userId,session);
  for await(const post of rows('posts').find({userId},{session,projection:{_id:1}}))await enqueueSearch('posts',post._id,session);
  return {userId,suspended};
}
/** Only the exact message voluntarily attached to a report can be moderated here. */
export async function moderateReportedMessage(reportId:string,hidden:boolean,reason:string,keyId:string,session:ClientSession){
  const report=requireValue(await rows('reports').findOne({_id:reportId},{session}));
  const evidence=report.evidence as {kind?:string;id?:string}|undefined;
  if(evidence?.kind!=='message'||!evidence.id)throw new AppError(422,'message_report','Choose a report with submitted message evidence.');
  const message=requireValue(await rows('directMessages').findOne({_id:evidence.id},{session}));
  await rows('directMessages').updateOne({_id:message._id},hidden?{$set:{moderatedAt:new Date().toISOString(),moderationReason:reason,moderatedBy:keyId}}:{$unset:{moderatedAt:'',moderationReason:'',moderatedBy:''}},{session});
  if(hidden){
    await rows('notifications').deleteMany({messageId:message._id},{session});
    await rows('connections').updateOne({_id:String(message.connectionId),'lastMessage.createdAt':message.createdAt,'lastMessage.fromId':message.fromId},{$set:{'lastMessage.text':'Message removed by moderation.'}},{session});
  }else await rows('connections').updateOne({_id:String(message.connectionId),'lastMessage.createdAt':message.createdAt,'lastMessage.fromId':message.fromId},{$set:{'lastMessage.text':message.text}},{session});
  return {reportId,messageId:message._id,hidden};
}
