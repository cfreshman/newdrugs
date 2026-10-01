import type { ResourceLink } from './navigation';
export interface Notification { id: string; kind: 'invitation' | 'message' | 'call' | 'connection_accepted' | 'review' | 'post_like' | 'post_reply' | 'agent_update' | 'automation_status' | 'log_invitation' | 'log_update' | 'log_added'; title: string; text: string; createdAt: string; read: boolean; connectionId?: string; callId?:string; callActive?:boolean; link: ResourceLink }
export interface NotificationState { unread: number; unreadCapped?:boolean; nextCursor?:string|null; items: Notification[] }
