export interface CallRecord {
 id:string;
 connectionId:string;
 callerId:string;
 calleeId:string;
 status:'waiting'|'connected'|'ended';
 createdAt:string;
 joinedAt?:string;
 endedAt?:string;
 endedBy?:string;
}
export interface CallPage {items:CallRecord[];active:CallRecord|null}
export interface CallAccess {url:string;token:string;call:CallRecord}
