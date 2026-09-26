import type { Bootstrap } from './types';
export type LiveTopic = 'user' | 'wallet' | 'messages' | 'run' | 'notifications';
export type LiveChange = Partial<Pick<Bootstrap, LiveTopic | 'conversationCursor' | 'conversationGeneration'>>;
export interface LiveStateEvent { userId: string; epoch: string; sequence: number; change: LiveChange }
