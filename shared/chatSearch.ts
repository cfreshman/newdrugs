import type { Message } from './types';
export interface ChatSearchInput { query: string; role?: 'all' | 'user' | 'assistant'; limit?: number; cursor?: string }
export interface ChatSearchResult { items: { id: string; role: 'user' | 'assistant'; text: string; createdAt: string; score: number }[]; nextCursor: string | null; mode: 'hybrid' | 'keyword'; indexing: boolean; notices: string[] }
export interface ChatWindow { items: Message[]; olderCursor: string | null; newerCursor: string | null; targetId: string }
