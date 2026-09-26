import { expect, it } from 'vitest';
import { chatHistoryReducer } from '../src/useChatHistory';
import type { Message } from '../shared/types';
const message = (id: number): Message => ({ id: `m${id}`, role: 'assistant', text: String(id), source: 'app', createdAt: new Date(1700000000000 + id * 1000).toISOString() });
const empty = { items: [], cursor: null, loading: false, error: '' };
it('keeps paged older messages when a newer live window arrives', () => {
  let state = chatHistoryReducer(empty, { type: 'snapshot', userId: 'one', items: [message(3), message(4)], cursor: 'm3' });
  state = chatHistoryReducer(state, { type: 'older', userId: 'one', cursor: 'm3', items: [message(1), message(2)], nextCursor: 'm1' });
  state = chatHistoryReducer(state, { type: 'snapshot', userId: 'one', items: [message(4), message(5)], cursor: 'm4' });
  expect(state.items.map(item => item.id)).toEqual(['m1','m2','m3','m4','m5']); expect(state.cursor).toBe('m1');
  state = chatHistoryReducer(state, { type: 'older', userId: 'one', cursor: 'm1', items: [], nextCursor: null });
  state = chatHistoryReducer(state, { type: 'snapshot', userId: 'one', items: [message(4), message(5)], cursor: 'm4' });
  expect(state.cursor).toBeNull();
});
it('discards another account’s late page and outbox on account changes', () => {
  let state = chatHistoryReducer(empty, { type: 'snapshot', userId: 'one', items: [message(3)], cursor: 'm3', outbox: [{ ...message(4), status: 'failed' }] });
  state = chatHistoryReducer(state, { type: 'snapshot', userId: 'two', items: [message(10)], cursor: null });
  state = chatHistoryReducer(state, { type: 'older', userId: 'one', cursor: 'm3', items: [message(1)], nextCursor: null });
  expect(state.userId).toBe('two'); expect(state.items.map(item => item.id)).toEqual(['m10']);
});
it('restarts paging after a disconnected client misses more than a full live window', () => {
  let state = chatHistoryReducer(empty, { type: 'snapshot', userId: 'one', items: [message(1), message(2)], cursor: null });
  state = chatHistoryReducer(state, { type: 'snapshot', userId: 'one', items: [message(50), message(51)], cursor: 'm50' });
  expect(state.items.map(item => item.id)).toEqual(['m50','m51']); expect(state.cursor).toBe('m50');
});

it('keeps an opened search window in place while live replies arrive, then returns to latest', () => {
  let state = chatHistoryReducer(empty, { type: 'snapshot', userId: 'one', items: [message(80), message(81)], cursor: 'm80', outbox: [{ ...message(82), status: 'failed' }] });
  state = chatHistoryReducer(state, { type: 'window', userId: 'one', page: { items: [message(20), message(21), message(22)], targetId: 'm21', olderCursor: 'm20', newerCursor: 'm22' } });
  state = chatHistoryReducer(state, { type: 'snapshot', userId: 'one', items: [message(81), message(83)], cursor: 'm81' });
  expect(state.items.map(item => item.id)).toEqual(['m20','m21','m22']); expect(state.targetId).toBe('m21');
  state = chatHistoryReducer(state, { type: 'newer', userId: 'one', cursor: 'm22', items: [message(23)], nextCursor: 'm23' });
  expect(state.items.map(item => item.id)).toEqual(['m20','m21','m22','m23']);
  state = chatHistoryReducer(state, { type: 'latest', userId: 'one', items: [message(81), message(83)], cursor: 'm81' });
  expect(state.windowed).toBeFalsy(); expect(state.items.map(item => item.id)).toEqual(['m81','m82','m83']);
});
it('does not apply a late search-window load after switching accounts', () => {
  const state = chatHistoryReducer(empty, { type: 'snapshot', userId: 'two', items: [message(1)], cursor: null });
  expect(chatHistoryReducer(state, { type: 'window', userId: 'one', page: { items: [message(20)], targetId: 'm20', olderCursor: null, newerCursor: null } })).toEqual(state);
});

it('clears cached history, a search window, and failed outbox on a new conversation generation', () => {
  let state = chatHistoryReducer(empty, { type: 'snapshot', userId: 'one', generation: 0, items: [message(1),message(2)], cursor: null, outbox: [{...message(3),status:'failed'}] });
  state = chatHistoryReducer(state, { type:'window',userId:'one',page:{items:[message(1)],targetId:'m1',olderCursor:null,newerCursor:'m1'} });
  state = chatHistoryReducer(state, { type:'snapshot',userId:'one',generation:1,items:[message(1)],cursor:null });
  expect(state.windowed).toBeFalsy(); expect(state.items.map(item=>item.id)).toEqual(['m1']); expect(state.outbox).toBeUndefined(); expect(state.generation).toBe(1);
});
