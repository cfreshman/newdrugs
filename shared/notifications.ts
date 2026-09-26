import type { ResourceLink } from './navigation';
export interface Notification { id: string; kind: 'invitation' | 'message' | 'connection_accepted' | 'review' | 'post_like' | 'post_reply' | 'agent_update' | 'automation_status'; title: string; text: string; createdAt: string; read: boolean; connectionId?: string; link: ResourceLink }
export interface NotificationState { unread: number; items: Notification[] }
