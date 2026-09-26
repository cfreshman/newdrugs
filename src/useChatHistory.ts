import { useCallback, useReducer, useRef, type SetStateAction } from 'react';
import type { ChatWindow } from '../shared/chatSearch';
import type { Message } from '../shared/types';
import { operation, errorText } from './api';

type State = { userId?: string; generation?: number; items: Message[]; cursor: string | null; loading: boolean; error: string; windowed?: boolean; newerCursor?: string | null; newerLoading?: boolean; newerError?: string; targetId?: string; outbox?: Message[] };
type Action = { type: 'window'; userId: string; page: ChatWindow }
  | { type: 'newer' | 'newer-loading' | 'newer-error'; userId: string; cursor: string; items?: Message[]; nextCursor?: string | null; error?: string }
  | { type: 'latest'; userId: string; items: Message[]; cursor?: string | null }
  | { type: 'edit'; value: SetStateAction<Message[]> }
  | { type: 'snapshot'; userId: string; generation?: number; items: Message[]; cursor?: string | null; outbox?: Message[] }
  | { type: 'loading' | 'error' | 'older'; userId: string; cursor: string; items?: Message[]; nextCursor?: string | null; error?: string };
const pending = (message: Message) => ['pending', 'failed'].includes(message.status || '');
const compare = (a: Message, b: Message) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
const unique = (items: Message[]) => [...new Map(items.map(item => [item.id, item])).values()].sort(compare);
export function chatHistoryReducer(state: State, action: Action): State {
  if (action.type === 'edit') return { ...state, items: typeof action.value === 'function' ? action.value(state.items) : action.value };
  if (action.type === 'window') {
    if (state.userId !== action.userId) return state;
    return { userId: action.userId, generation: state.generation, outbox: state.windowed ? state.outbox : state.items.filter(pending), items: action.page.items, cursor: action.page.olderCursor, newerCursor: action.page.newerCursor, targetId: action.page.targetId, windowed: true, loading: false, error: '' };
  }
  if (action.type === 'latest') {
    if (state.userId !== action.userId) return state;
    return { userId: state.userId, generation: state.generation, items: unique([...action.items, ...(state.outbox || state.items.filter(pending)).filter(item => !action.items.some(saved => saved.id === item.id))]), cursor: action.cursor ?? null, loading: false, error: '' };
  }
  if (action.type === 'newer' || action.type === 'newer-loading' || action.type === 'newer-error') {
    if (!state.windowed || state.userId !== action.userId || state.newerCursor !== action.cursor) return state;
    if (action.type === 'newer-loading') return { ...state, newerLoading: true, newerError: '' };
    if (action.type === 'newer-error') return { ...state, newerLoading: false, newerError: action.error };
    return { ...state, items: unique([...state.items, ...(action.items || [])]), newerCursor: action.nextCursor ?? null, newerLoading: false, newerError: '' };
  }
  if (action.type === 'snapshot') {
    if (state.windowed && state.userId === action.userId && (state.generation || 0) === (action.generation || 0)) {
      const ids = new Set(state.items.map(item => item.id));
      const updates = action.items.filter(item => ids.has(item.id));
      const last = state.items.at(-1), liveLast = action.items.at(-1);
      return { ...state, outbox: state.outbox?.filter(item => !action.items.some(saved => saved.id === item.id)), items: unique([...state.items, ...updates]), newerCursor: state.newerCursor || (last && liveLast && compare(last, liveLast) < 0 ? last.id : null) };
    }
    const same = state.userId === action.userId && (state.generation || 0) === (action.generation || 0);
    const ids = new Set(action.items.map(item => item.id));
    const saved = state.items.filter(item => !pending(item));
    // A disconnected client may have missed more than one complete live window.
    // Restart paging at that window rather than silently showing a history gap.
    const contiguous = !saved.length || !action.items.length || saved.some(item => ids.has(item.id));
    const reset = !same || !contiguous || !action.items.length;
    const older = !reset && action.items[0] ? saved.filter(item => compare(item, action.items[0]) < 0) : [];
    const outbox = (same ? state.items.filter(pending) : action.outbox || []).filter(item => !ids.has(item.id));
    return { userId: action.userId, generation: action.generation || 0, items: unique([...older, ...action.items, ...outbox]), cursor: reset ? action.cursor ?? null : state.cursor, loading: reset ? false : state.loading, error: reset ? '' : state.error };
  }
  if (action.userId !== state.userId || action.cursor !== state.cursor) return state;
  if (action.type === 'loading') return { ...state, loading: true, error: '' };
  if (action.type === 'error') return { ...state, loading: false, error: action.error || 'Could not load earlier messages.' };
  return { ...state, items: unique([...(action.items || []), ...state.items]), cursor: action.nextCursor ?? null, loading: false, error: '' };
}
export function useChatHistory(beforePrepend: () => void) {
  const [state, dispatch] = useReducer(chatHistoryReducer, { items: [], cursor: null, loading: false, error: '' });
  const live = useRef<{ userId: string; items: Message[]; cursor?: string | null } | null>(null);
  const jumpRequest = useRef(0), newerRequest = useRef<string | null>(null);
  const latest = useRef(state), prepare = useRef(beforePrepend), request = useRef<string | null>(null);
  latest.current = state; prepare.current = beforePrepend;
  const setMessages = useCallback((value: SetStateAction<Message[]>) => dispatch({ type: 'edit', value }), []);
  const receive = useCallback((userId: string, items: Message[], cursor?: string | null, outbox?: Message[], generation = 0) => { if ((latest.current.generation || 0) !== generation) jumpRequest.current++; live.current = { userId, items, cursor }; dispatch({ type: 'snapshot', userId, items, cursor, outbox, generation }); }, []);
  const loadOlder = useCallback(async () => {
    const { userId, cursor } = latest.current; if (!userId || !cursor) return;
    const key = `${userId}:${cursor}`; if (request.current === key) return;
    request.current = key; dispatch({ type: 'loading', userId, cursor });
    try {
      const page = await operation<{ items: Message[]; nextCursor: string | null }>('conversation.list', { before: cursor, limit: 30 });
      if (latest.current.userId !== userId || latest.current.cursor !== cursor) return;
      prepare.current();
      dispatch({ type: 'older', userId, cursor, items: page.items, nextCursor: page.nextCursor });
    } catch (error) { dispatch({ type: 'error', userId, cursor, error: errorText(error) }); }
    finally { if (request.current === key) request.current = null; }
  }, []);
  const jump = useCallback(async (messageId: string) => {
    const userId = latest.current.userId, ticket = ++jumpRequest.current;
    if (!userId) return false;
    const page = await operation<ChatWindow>('conversation.window', { messageId });
    if (latest.current.userId !== userId || jumpRequest.current !== ticket) return false;
    dispatch({ type: 'window', userId, page }); return true;
  }, []);
  const returnLatest = useCallback(() => {
    jumpRequest.current++;
    if (live.current) dispatch({ type: 'latest', ...live.current });
  }, []);
  const loadNewer = useCallback(async () => {
    const { userId, newerCursor: cursor } = latest.current;
    if (!userId || !cursor || newerRequest.current === `${userId}:${cursor}`) return;
    const key = `${userId}:${cursor}`; newerRequest.current = key;
    dispatch({ type: 'newer-loading', userId, cursor });
    try {
      const page = await operation<{ items: Message[]; nextCursor: string | null }>('conversation.list', { after: cursor, limit: 30 });
      dispatch({ type: 'newer', userId, cursor, items: page.items, nextCursor: page.nextCursor });
    } catch (error) { dispatch({ type: 'newer-error', userId, cursor, error: errorText(error) }); }
    finally { if (newerRequest.current === key) newerRequest.current = null; }
  }, []);
  return { messages: state.items, windowed: Boolean(state.windowed), targetId: state.targetId, newerCursor: state.newerCursor, newerLoading: Boolean(state.newerLoading), newerError: state.newerError, loadNewer, jump, returnLatest, setMessages, receive, loadOlder, cursor: state.cursor, loading: state.loading, error: state.error };
}
