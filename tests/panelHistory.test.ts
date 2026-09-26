import { expect, it } from 'vitest';
import { navigatePanelHistory, type PanelLocation } from '../src/panelHistory';
const feed: PanelLocation = { panel: 'feed', context: { scope: 'nearby', query: 'hiking' } };
const parent = { panel: 'post' as const, context: { resourceId: 'parent', id: 'original-tool-call' } };
const reply: PanelLocation = { panel: 'post', context: { resourceId: 'reply' } };
it('pops to the original parent entry rather than pushing a duplicate', () => {
  const next = navigatePanelHistory([feed, parent], reply, { panel: 'post', context: { resourceId: 'parent' } });
  expect(next.current).toBe(parent); expect(next.history).toEqual([feed]);
});
it('pops multiple levels when the target is an earlier ancestor', () => {
  const next = navigatePanelHistory([feed, parent, reply], { panel: 'post', context: { resourceId: 'nested' } }, { panel: 'post', context: { resourceId: 'parent' } });
  expect(next.current).toBe(parent); expect(next.history).toEqual([feed]);
});
it('pushes an unvisited parent and does not duplicate the current view', () => {
  expect(navigatePanelHistory([feed], reply, parent).history).toEqual([feed, reply]);
  const current = navigatePanelHistory([feed], parent, { panel: 'post', context: { resourceId: 'parent' } });
  expect(current.current).toBe(parent); expect(current.history).toEqual([feed]);
});
it('preserves distinct collection filters', () => {
  const other: PanelLocation = { panel: 'feed', context: { scope: 'all', query: 'hiking' } };
  expect(navigatePanelHistory([feed], reply, other)).toEqual({ current: other, history: [feed, reply] });
});
