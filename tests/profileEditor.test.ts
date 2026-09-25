// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProfileEditor } from '../src/ProfileEditor';
import { setupDOM } from './dom';
const calls = vi.hoisted(() => ({ upload: vi.fn(), operation: vi.fn() }));
vi.mock('../src/uploads', () => ({ uploadFile: calls.upload }));
vi.mock('../src/api', async original => ({ ...await original<typeof import('../src/api')>(), operation: calls.operation }));
let dom: ReturnType<typeof setupDOM>;
beforeEach(() => { dom = setupDOM(); calls.operation.mockReset().mockResolvedValue({}); calls.upload.mockReset().mockResolvedValue({ id: 'photo', ready: true }); });
afterEach(() => dom.cleanup());
it('lets the person upload, preview, return to edit, and save the chosen photo through the canonical profile operation', async () => {
  const saved = vi.fn().mockResolvedValue(undefined);
  act(() => dom.root.render(createElement(ProfileEditor, { person: { id: 'me', handle: 'cyrus', name: 'Cyrus', city: '', bio: 'My own words.', interests: ['hiking'], photos: [], discoverable: false }, saved })));
  const picker = dom.container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(picker, 'files', { configurable: true, value: [new File(['image'], 'photo.jpg', { type: 'image/jpeg' })] });
  await act(async () => picker.dispatchEvent(new Event('change', { bubbles: true })));
  expect(calls.upload).toHaveBeenCalledWith(expect.any(File), 'profile_photo', expect.any(AbortSignal));
  expect(dom.container.querySelector('.photo-editor-item img')?.getAttribute('src')).toBe('/api/files/photo');
  act(() => dom.container.querySelector<HTMLButtonElement>('.profile-editor-actions button')!.click());
  expect(dom.container.querySelector('.profile-card .profile-photo')?.getAttribute('src')).toBe('/api/files/photo');
  expect(dom.container.querySelector('.profile-card')?.textContent).toContain('My own words.');
  act(() => dom.container.querySelector<HTMLButtonElement>('.profile-editor-actions button')!.click());
  await act(async () => dom.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(calls.operation).toHaveBeenCalledWith('profile.update', expect.objectContaining({ photos: ['photo'], bio: 'My own words.', locationCell: null }));
  expect(calls.operation.mock.calls.at(-1)?.[1]).not.toHaveProperty('city');
  expect(saved).toHaveBeenCalledOnce();
});
