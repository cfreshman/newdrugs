import {z} from 'zod';
import type {ClientSession,Document,Filter} from 'mongodb';
import {rows,type Row} from './db';
import {AppError} from './errors';
import {unsuspendedActors} from './scopedModeration';
const position=z.union([z.literal('done'),z.null(),z.strictObject({at:z.string().max(40),id:z.string().max(300)})]);
const cursorSchema=z.strictObject({userId:z.string(),positions:z.array(position).length(4)});
type Position=z.infer<typeof position>;
export interface NotificationLane {raw:Row[];eligible:Row[];more:boolean;position:Position;invites:boolean}
/** Four indexed seeks, at most 100 candidates each. Eligibility joins run only
 * over those IDs; neither unread counts nor sparse histories scan to exhaustion. */
export async function notificationLanes(userId:string,blocked:string[],recordStages:Document[],session?:ClientSession,before?:string){
 let positions:Position[]=[null,null,null,null];
 if(before){try{const cursor=cursorSchema.parse(JSON.parse(Buffer.from(before,'base64url').toString()));if(cursor.userId!==userId)throw Error();positions=cursor.positions;}catch{throw new AppError(422,'notification_cursor','Reload notifications.');}}
 const specs:{collection:string;filter:Filter<Row>;stages:Document[];invites:boolean}[]=[
  {collection:'connections',filter:{toId:userId,status:'pending',notificationReadAt:null},stages:[{$match:{fromId:{$nin:blocked}}},...unsuspendedActors('fromId')],invites:true},
  {collection:'connections',filter:{toId:userId},stages:[{$match:{fromId:{$nin:blocked},$or:[{status:{$ne:'pending'}},{notificationReadAt:{$ne:null}}]}},...unsuspendedActors('fromId')],invites:true},
  {collection:'notifications',filter:{userId,readAt:null},stages:[{$match:{actorId:{$nin:blocked}}},...recordStages],invites:false},
  {collection:'notifications',filter:{userId},stages:[{$match:{actorId:{$nin:blocked},readAt:{$ne:null}}},...recordStages],invites:false},
 ];
 const lanes:NotificationLane[]=[];
 // Sessions may be transactional, so do not execute parallel commands on them.
 for(let index=0;index<specs.length;index++){
  const spec=specs[index],position=positions[index];
  if(position==='done'){lanes.push({raw:[],eligible:[],more:false,position,invites:spec.invites});continue;}
  const found=await rows(spec.collection).find({...spec.filter,...(position?{$or:[{createdAt:{$lt:position.at}},{createdAt:position.at,_id:{$lt:position.id}}]}:{})},{session}).sort({createdAt:-1,_id:-1}).limit(101).maxTimeMS(3000).toArray();
  const raw=found.slice(0,100),eligible=raw.length?await rows(spec.collection).aggregate<Row>([{$match:{_id:{$in:raw.map(row=>row._id)},...spec.filter}},...spec.stages],{session,maxTimeMS:3000}).toArray():[];
  lanes.push({raw,eligible,more:found.length>100,position,invites:spec.invites});
 }
 return lanes;
}
export function nextNotificationCursor(userId:string,lanes:NotificationLane[],shown:Set<string>){
 const positions=lanes.map(lane=>{
  const unshown=new Set(lane.eligible.filter(row=>!shown.has(lane.invites?`invite:${row._id}`:row._id)).map(row=>row._id));
  const boundary=lane.raw.findIndex(row=>unshown.has(row._id));
  if(boundary===0)return lane.position;
  const last=boundary>0?lane.raw[boundary-1]:lane.raw.at(-1);
  if(boundary<0&&!lane.more)return 'done';
  return last?{at:String(last.createdAt),id:last._id}:lane.position;
 });
 return positions.every(value=>value==='done')?null:Buffer.from(JSON.stringify({userId,positions})).toString('base64url');
}
