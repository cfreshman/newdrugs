import {notificationLanes,nextNotificationCursor} from './notificationPaging';
import {unsuspendedActors} from './scopedModeration';
import { enqueuePush } from './push';
import type { ClientSession,Document } from 'mongodb';
import { rows,type Row } from './db';
import { hash, users } from './auth';
import { config } from './config';
import { destinationPath, type ResourceLink } from '../shared/navigation';
import type { Notification, NotificationState } from '../shared/notifications';
import { logNotificationText, notificationActor } from './notificationText';

export async function notifyConnection(userId: string, actorId: string, connectionId: string, kind: 'message' | 'connection_accepted', text: string, messageId: string | undefined, session?: ClientSession) {
  await rows('notifications').updateOne({ _id: hash(`${kind}:${connectionId}:${userId}`) }, { $set: { userId, actorId, connectionId, kind, text, messageId, readAt: null, createdAt: new Date().toISOString() } }, { session, upsert: true });
  if (kind === 'message' && messageId) await enqueuePush(userId, actorId, connectionId, 'message', messageId, session);
}
export async function notificationState(userId: string, session?: ClientSession, before?:string): Promise<NotificationState> {
  const blocked = (await rows('blocks').find({ members: userId }, { session }).toArray()).flatMap(row => (row.members as string[]).filter(id => id !== userId));
  const logKinds=['log_invitation','log_update','log_added'];
  const eligibleRecords:Document[]=[...unsuspendedActors('actorId'),{$lookup:{from:'logEntries',localField:'entryId',foreignField:'_id',pipeline:[{$match:{deletedAt:{$exists:false},members:{$nin:blocked},$or:[{members:userId},{invited:userId}]}},...unsuspendedActors('members'),{$project:{title:1}}],as:'logEntry'}},{$match:{$or:[{kind:{$nin:logKinds}},{'logEntry.0':{$exists:true}}]}}];
  const lanes=await notificationLanes(userId,blocked,eligibleRecords,session,before);
  const invitations=[...lanes[0].eligible,...lanes[1].eligible],stored=[...lanes[2].eligible,...lanes[3].eligible];
  const callIds=stored.filter(row=>row.kind==='call').map(row=>String(row.callId));
  const callRows=callIds.length?await rows('calls').find({_id:{$in:callIds}},{session,projection:{_id:1,status:1,joinedAt:1}}).toArray():[];
  const byCall=new Map(callRows.map(row=>[row._id,row]));
  const count=lanes[0].eligible.length+lanes[2].eligible.length;
  const people = await users().find({ _id: { $in: [...invitations.map(row => String(row.fromId)), ...stored.map(row => String(row.actorId))] } }, { session, projection: { name: 1, handle: 1 } }).toArray();
  const label = (id: string) => notificationActor(people.find(person => person._id === id));
  const link = (connectionId: string): ResourceLink => ({ rel: 'open_in_newdrugs', targetKind: 'exact', title: 'Open conversation', url: new URL(destinationPath({ view: 'messages', resourceId: connectionId }), config.uiOrigin).href, resourceType: 'conversation', resourceId: connectionId });
  const items: Notification[] = invitations.map(row => ({ id: `invite:${row._id}`, kind: 'invitation', title: `Invitation from ${label(String(row.fromId))}`, text: String(row.note), createdAt: String(row.createdAt), read: row.status !== 'pending' || Boolean(row.notificationReadAt), connectionId: row._id, link: link(row._id) }));
  for (const row of stored) {
    if(row.kind==='call'){
      const call=byCall.get(String(row.callId)),actor=label(String(row.actorId)),active=Boolean(call&&call.status!=='ended');
      items.push({id:row._id,kind:'call',title:active?`Video call from ${actor}`:call?.joinedAt?`Video call with ${actor}`:`Missed call from ${actor}`,text:'',createdAt:String(row.createdAt),read:Boolean(row.readAt),connectionId:String(row.connectionId),callId:String(row.callId),callActive:active,link:link(String(row.connectionId))});continue;
    }
    if(row.kind==='log_invitation'||row.kind==='log_update'||row.kind==='log_added'){
      const entry=(row.logEntry as Row[])[0];if(!entry)continue;
      items.push({id:row._id,kind:row.kind,title:logNotificationText(row.kind,label(String(row.actorId)),entry.title),text:'',createdAt:String(row.createdAt),read:Boolean(row.readAt),link:{rel:'open_in_newdrugs',targetKind:'exact',title:'Open Log entry',url:new URL(destinationPath({view:'log',resourceId:entry._id}),config.uiOrigin).href,resourceType:'log_entry',resourceId:entry._id}});continue;
    }

    if (row.kind === 'automation_status') { items.push({id:row._id,kind:'automation_status',title:String(row.title),text:String(row.text),createdAt:String(row.createdAt),read:Boolean(row.readAt),link:{rel:'open_in_newdrugs',targetKind:'exact',title:'Open automation',url:new URL(destinationPath({view:'automations',resourceId:String(row.automationId)}),config.uiOrigin).href,resourceType:'automation',resourceId:String(row.automationId)}}); continue; }
    if (row.kind === 'agent_update') { items.push({ id: row._id, kind: 'agent_update', title: String(row.title), text: String(row.text || ''), createdAt: String(row.createdAt), read: Boolean(row.readAt), link: { rel: 'open_in_newdrugs', targetKind: 'exact', title: 'Open agent update', url: new URL(destinationPath({ view: 'inbox', resourceId: String(row.inboxId) }), config.uiOrigin).href, resourceType: 'inbox', resourceId: String(row.inboxId) } }); continue; }
    const social = row.kind === 'post_like' || row.kind === 'post_reply';
    const destination: ResourceLink = social ? { rel:'open_in_newdrugs',targetKind:'exact',title:'Open post',url:new URL(destinationPath({view:'post',resourceId:String(row.postId)}),config.uiOrigin).href,resourceType:'post',resourceId:String(row.postId) } : link(String(row.connectionId));
    const actor=label(String(row.actorId));
    items.push({id:row._id,kind:row.kind as Notification['kind'],title:row.kind==='message'?`Message from ${actor}`:row.kind==='post_like'?`${actor} liked your post`:row.kind==='post_reply'?`${actor} replied to your post`:`${actor} accepted your invitation`,text:String(row.text||''),createdAt:String(row.createdAt),read:Boolean(row.readAt),...(social?{}:{connectionId:String(row.connectionId)}),link:destination});
  }
  const owner = await users().findOne({ _id: userId }, { session, projection: { activeRun: 1 } });
  const review = !before && owner?.activeRun && await rows('runs').findOne({ _id: owner.activeRun, userId, status: 'waiting_for_approval' }, { session });
  if (review) items.push({ id: `review:${review._id}`, kind: 'review', title: 'Your agent has a change to review', text: 'Confirm or reject the proposed action in chat.', createdAt: String(review.updatedAt), read: false, link: { rel: 'open_in_newdrugs', targetKind: 'surface', title: 'Review in chat', url: new URL('/', config.uiOrigin).href, resourceType: 'chat' } });
  const page=items.sort((a,b)=>Number(a.read)-Number(b.read)||b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id)).slice(0,100);
  return {unread:count+(review?1:0),unreadCapped:lanes[0].more||lanes[2].more,items:page,nextCursor:nextNotificationCursor(userId,lanes,new Set(page.map(item=>item.id)))};
}
