import type { Bootstrap } from './types';
export type LiveTopic = 'user' | 'wallet' | 'messages' | 'run' | 'notifications';
export type LiveChange = Partial<Pick<Bootstrap, LiveTopic>>;
export interface LiveStateEvent { userId: string; epoch: string; sequence: number; change: LiveChange }
