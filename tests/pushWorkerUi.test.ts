import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
const code = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
it('always displays a generic visible notification and rejects malformed/external destinations', async () => {
  const events: Record<string, (event: unknown) => void> = {}, showNotification = vi.fn().mockResolvedValue(undefined);
  runInNewContext(code, { URL, self: { location: { origin: 'https://druggie.org' }, addEventListener: (name: string, callback: (event: unknown) => void) => { events[name] = callback; }, registration: { showNotification } } });
  for (const url of ['https://other.example/messages/friend', 'https://[invalid', '/messages/friend']) {
    let work: Promise<void> | undefined;
    events.push({ data: { json: () => ({ url, body: 'Private message must not appear' }) }, waitUntil: (promise: Promise<void>) => { work = promise; } });
    await work;
    expect(showNotification.mock.calls.at(-1)).toEqual(['New Drugs', expect.objectContaining({ body: 'You have a new message.', data: { path: url === '/messages/friend' ? url : '/messages' } })]);
  }
  expect(events.fetch).toBeUndefined();
});
