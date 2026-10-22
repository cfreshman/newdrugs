// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ArtifactsPanel } from '../src/ArtifactsPanel';
import { ArtifactMenu, ArtifactEditor, type ArtifactEditKind } from '../src/ArtifactControls';
import { PanelReadinessContext, PanelVisibilityContext, type PanelReadiness } from '../src/PanelReadiness';
import type { ArtifactDetail, ArtifactSummary } from '../shared/artifacts';
import { setupDOM, rect } from './dom';

const mocks = vi.hoisted(() => ({ operation: vi.fn() }));
vi.mock('../src/api', () => ({ operation: mocks.operation, errorText: (error: unknown) => error instanceof Error ? error.message : 'Operation failed.' }));
let dom: ReturnType<typeof setupDOM>;
const firstId = '00000000-0000-4000-8000-000000000001', secondId = '00000000-0000-4000-8000-000000000002';
function detail(changes: Partial<ArtifactDetail> = {}): ArtifactDetail {
  return { id: firstId, title: 'Weekend graph', ephemeral: false, revision: 1, contentRevision: 1, hasRefreshInstruction: true,
    createdAt: '2026-10-22T10:00:00.000Z', updatedAt: '2026-10-22T10:00:00.000Z', contentUpdatedAt: '2026-10-22T10:00:00.000Z', dataUpdatedAt: '2026-10-22T10:00:00.000Z', producer: { kind: 'hosted', name: 'Your agent' },
    bodyHtml: '<main>Graph</main>', data: { values: [1, 2] }, assets: [], refreshInstruction: 'Read the current values.', ...changes };
}
function summary(artifact: ArtifactDetail): ArtifactSummary { const { bodyHtml, data, assets, refreshInstruction, ...value } = artifact; return value; }
const item = summary(detail()), nextItem = summary(detail({ id: secondId, title: 'Another graph' }));
beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); dom = setupDOM(); mocks.operation.mockReset().mockResolvedValue({ items: [item], nextCursor: null }); });
afterEach(() => { dom.cleanup(); vi.useRealTimers(); });
const button = (label: string) => [...dom.container.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === label)!;
const list = (visible = true, navigate = vi.fn()) => createElement(PanelVisibilityContext.Provider, { value: visible }, createElement(ArtifactsPanel, { navigate }));
const invalidate = async () => { await act(async () => { window.dispatchEvent(new CustomEvent('newdrugs:records', { detail: { keys: ['artifacts'], artifacts: [{ id: firstId }] } })); await vi.advanceTimersByTimeAsync(80); }); };
async function editValue(node: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(node, value); node.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function openMenu() {
  const menu = dom.container.querySelector<HTMLDetailsElement>('.artifact-menu')!, trigger = menu.querySelector('summary')!, content = menu.querySelector('div')!;
  trigger.getBoundingClientRect = () => rect(20, 20, 44, 44); menu.getBoundingClientRect = () => rect(20, 20, 44, 44); content.getBoundingClientRect = () => rect(20, 68, 220, 280);
  await act(async () => { menu.open = true; }); return menu;
}

it('uses real artifact links and preserves modified clicks without source frames or creation controls', async () => {
  const navigate = vi.fn(); await act(async () => dom.root.render(list(true, navigate)));
  expect(mocks.operation).toHaveBeenCalledWith('artifacts.list', { limit: 20 }, expect.objectContaining({ dedupe: true }));
  const link = dom.container.querySelector<HTMLAnchorElement>('.artifact-list-row')!;
  expect(link.getAttribute('href')).toBe(`/artifacts/${firstId}`); expect(link.textContent).toContain('Weekend graph'); expect(link.querySelector('time')?.dateTime).toBe(item.updatedAt);
  await act(async () => link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }))); expect(navigate).not.toHaveBeenCalled();
  await act(async () => link.click()); expect(navigate).toHaveBeenCalledWith({ view: 'artifacts', resourceId: firstId });
  expect(dom.container.querySelector('iframe')).toBeNull(); expect(dom.container.querySelector('textarea')).toBeNull(); expect(dom.container.textContent).not.toContain('Ephemeral');
});

it('retains paginated rows and the scrollport while refreshing the fetched prefix', async () => {
  mocks.operation.mockImplementation(async (_name, input) => input.cursor ? { items: [nextItem], nextCursor: null } : { items: [item], nextCursor: 'next-page' });
  dom.container.style.overflowY = 'auto'; dom.container.scrollTop = 225;
  await act(async () => dom.root.render(list())); const original = dom.container.querySelector(`[data-artifact-id="${firstId}"]`);
  await act(async () => button('More artifacts').click()); expect(dom.container.querySelectorAll('.artifact-list-row')).toHaveLength(2);
  await invalidate();
  expect(mocks.operation).toHaveBeenCalledTimes(4); expect(dom.container.querySelectorAll('.artifact-list-row')).toHaveLength(2);
  expect(dom.container.querySelector(`[data-artifact-id="${firstId}"]`)).toBe(original); expect(dom.container.scrollTop).toBe(225);
  expect(mocks.operation).toHaveBeenLastCalledWith('artifacts.list', { limit: 20, cursor: 'next-page' }, expect.anything());
});

it('defers hidden invalidations, keeps cached rows during reload and does not refetch a clean reopening', async () => {
  await act(async () => dom.root.render(list()));
  await act(async () => dom.root.render(list(false))); await invalidate(); expect(mocks.operation).toHaveBeenCalledTimes(1);
  let finish!: (value: unknown) => void; mocks.operation.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => dom.root.render(list())); expect(mocks.operation).toHaveBeenCalledTimes(2); expect(dom.container.textContent).toContain('Weekend graph');
  await act(async () => finish({ items: [{ ...item, title: 'Current graph' }], nextCursor: null })); expect(dom.container.textContent).toContain('Current graph');
  await act(async () => dom.root.render(list(false))); await act(async () => dom.root.render(list())); expect(mocks.operation).toHaveBeenCalledTimes(2);
});

it('loads only a visible initial panel and releases readiness on failure with a usable retry', async () => {
  const readiness: PanelReadiness = { pending: new Set(), listeners: new Set() };
  let fail!: (error: Error) => void; mocks.operation.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
  const render = (visible: boolean) => createElement(PanelReadinessContext.Provider, { value: readiness }, list(visible));
  await act(async () => dom.root.render(render(false))); expect(mocks.operation).not.toHaveBeenCalled(); expect(readiness.pending.size).toBe(0);
  await act(async () => dom.root.render(render(true))); expect(readiness.pending.size).toBe(1);
  await act(async () => fail(new Error('Could not load artifacts.'))); expect(readiness.pending.size).toBe(0); expect(dom.container.querySelector('[role=alert]')?.textContent).toContain('Could not load');
  mocks.operation.mockResolvedValueOnce({ items: [], nextCursor: null }); await act(async () => button('Retry').click()); expect(dom.container.textContent).toContain('No artifacts yet.');
});

it('uses the canonical menu and routes management to in-flow editors without publishing', async () => {
  const onEdit = vi.fn(), onRefresh = vi.fn(), onDiscuss = vi.fn(), props = { artifact: detail(), refreshDisabled: true, onEdit, onRefresh, onDiscuss, onChanged: vi.fn(), onError: vi.fn() };
  await act(async () => dom.root.render(createElement(ArtifactMenu, props)));
  const menu = await openMenu(); expect(menu.classList.contains('profile-menu')).toBe(true); expect(menu.dataset.menuPositioned).toBe('true');
  expect(menu.querySelector('summary svg')?.getAttribute('width')).toBe('23'); expect(button('Refresh').disabled).toBe(true);
  await act(async () => button('Refresh').click()); expect(onRefresh).not.toHaveBeenCalled();
  await act(async () => button('Rename').click()); expect(onEdit).toHaveBeenCalledWith('title'); expect(menu.open).toBe(false);
  await openMenu(); await act(async () => button('Refresh instructions').click()); expect(onEdit).toHaveBeenCalledWith('instruction');
  await openMenu(); await act(async () => button('Delete').click()); expect(onEdit).toHaveBeenCalledWith('delete');
  await openMenu(); await act(async () => button('Bring into chat').click()); expect(onDiscuss).toHaveBeenCalledTimes(1);
  expect(mocks.operation).not.toHaveBeenCalled();
  await act(async () => dom.root.render(createElement(ArtifactMenu, { ...props, artifact: detail({ refreshInstruction: null, hasRefreshInstruction: false }) })));
  expect(button('Refresh')).toBeUndefined(); expect(button('Refresh instructions')).toBeDefined();
});

it('changes only list visibility, preserves source/data and reuses the exact retry key', async () => {
  const artifact = detail({ ephemeral: true }), onChanged = vi.fn(), onError = vi.fn();
  mocks.operation.mockRejectedValueOnce(new Error('Connection interrupted.')).mockResolvedValueOnce({ ...summary(artifact), ephemeral: false, revision: 2 });
  await act(async () => dom.root.render(createElement(ArtifactMenu, { artifact, refreshDisabled: false, onRefresh: vi.fn(), onDiscuss: vi.fn(), onEdit: vi.fn(), onChanged, onError })));
  await openMenu(); await act(async () => button('Save to Artifacts').click()); expect(onError).toHaveBeenLastCalledWith('Connection interrupted.'); expect(dom.container.textContent).not.toContain('Connection interrupted.');
  await openMenu(); await act(async () => button('Save to Artifacts').click());
  const calls = mocks.operation.mock.calls; expect(calls[0][0]).toBe('artifacts.update'); expect(calls[0][1]).toEqual({ artifactId: artifact.id, revision: 1, ephemeral: false }); expect(calls[1][2].key).toBe(calls[0][2].key);
  const changed = onChanged.mock.calls[0][0]; expect(changed.bodyHtml).toBe(artifact.bodyHtml); expect(changed.data).toBe(artifact.data); expect(changed.assets).toBe(artifact.assets); expect(changed.contentRevision).toBe(1); expect(changed.ephemeral).toBe(false);
});

it('preserves a human title draft and its starting revision across newer live records', async () => {
  const artifact = detail(), props = { artifact, kind: 'title' as ArtifactEditKind, cancel: vi.fn(), saved: vi.fn(), deleted: vi.fn() };
  mocks.operation.mockRejectedValue(new Error('This artifact changed. Read it again before saving.'));
  await act(async () => dom.root.render(createElement(ArtifactEditor, props)));
  const input = dom.container.querySelector('input')!; await editValue(input, 'My own words');
  await act(async () => dom.root.render(createElement(ArtifactEditor, { ...props, artifact: detail({ title: 'A newer title', revision: 9 }) })));
  expect(input.value).toBe('My own words');
  await act(async () => dom.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(mocks.operation).toHaveBeenCalledWith('artifacts.update', { artifactId: artifact.id, revision: 1, title: 'My own words' }, expect.objectContaining({ key: expect.any(String) }));
  expect(input.value).toBe('My own words'); expect(dom.container.querySelector('[role=alert]')?.textContent).toContain('changed'); expect(props.saved).not.toHaveBeenCalled();
  expect(dom.container.querySelector('.solid')?.closest('.panel-actions')).toBeNull();
});

it('saves exact instruction text or explicitly clears it, using one stable intent across failures', async () => {
  const artifact = detail(), saved = vi.fn(), props = { artifact, kind: 'instruction' as ArtifactEditKind, cancel: vi.fn(), saved, deleted: vi.fn() };
  mocks.operation.mockRejectedValueOnce(new Error('Try again.')).mockResolvedValueOnce({ ...summary(artifact), revision: 2 });
  await act(async () => dom.root.render(createElement(ArtifactEditor, props)));
  const textarea = dom.container.querySelector('textarea')!; expect(textarea.maxLength).toBe(16_000); await editValue(textarea, 'Keep my scope.\nReturn the exact rows.');
  const submit = async () => act(async () => dom.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await submit(); await submit();
  expect(mocks.operation.mock.calls[1][2].key).toBe(mocks.operation.mock.calls[0][2].key);
  expect(mocks.operation.mock.calls[0][1].refreshInstruction).toBe('Keep my scope.\nReturn the exact rows.'); expect(saved.mock.calls[0][0].bodyHtml).toBe(artifact.bodyHtml); expect(saved.mock.calls[0][0].refreshInstruction).toBe('Keep my scope.\nReturn the exact rows.');
  await editValue(textarea, ''); await submit(); expect(mocks.operation).toHaveBeenLastCalledWith('artifacts.update', expect.objectContaining({ refreshInstruction: null }), expect.anything());
});

it('keeps exact deletion review and retry identity instead of following a newer artifact revision', async () => {
  const artifact = detail(), deleted = vi.fn(), props = { artifact, kind: 'delete' as ArtifactEditKind, cancel: vi.fn(), saved: vi.fn(), deleted };
  mocks.operation.mockRejectedValueOnce(new Error('Deletion was interrupted.')).mockResolvedValueOnce({ deleted: true, artifactId: artifact.id });
  await act(async () => dom.root.render(createElement(ArtifactEditor, props))); expect(mocks.operation).not.toHaveBeenCalled();
  await act(async () => button('Delete artifact').click()); expect(dom.container.querySelector('[role=alert]')?.textContent).toContain('interrupted');
  await act(async () => dom.root.render(createElement(ArtifactEditor, { ...props, artifact: detail({ revision: 7 }) })));
  await act(async () => button('Delete artifact').click());
  const calls = mocks.operation.mock.calls; expect(calls[0][0]).toBe('artifacts.delete'); expect(calls[1][1]).toEqual({ artifactId: artifact.id, revision: 1 }); expect(calls[1][2]).toEqual({ confirmed: true, key: calls[0][2].key }); expect(deleted).toHaveBeenCalledTimes(1);
});
