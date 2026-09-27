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
    expect(showNotification.mock.calls.at(-1)).toEqual(['Notification', expect.objectContaining({ body: 'You have a new message.', data: { path: url === '/messages/friend' ? url : '/messages' } })]);
  }
  expect(events.fetch).toBeUndefined();
});

it('keeps Log destinations and generic hangout notices in push',async()=>{
 const events:Record<string,(event:any)=>void>={},showNotification=vi.fn().mockResolvedValue(undefined);
 runInNewContext(code,{URL,self:{location:{origin:'https://druggie.org'},addEventListener:(name:string,fn:(event:any)=>void)=>{events[name]=fn;},registration:{showNotification}}});
 let work:Promise<void>|undefined;events.push({data:{json:()=>({url:'/log/hangout-id',body:'You were added to a hangout.'})},waitUntil:(promise:Promise<void>)=>{work=promise;}});await work;
 expect(showNotification).toHaveBeenCalledWith('Notification',expect.objectContaining({body:'You were added to a hangout.',data:{path:'/log/hangout-id'}}));
});
it('keeps the generic first-contribution push text without revealing the note',async()=>{
 const events:Record<string,(event:any)=>void>={},showNotification=vi.fn().mockResolvedValue(undefined);runInNewContext(code,{URL,self:{location:{origin:'https://druggie.org'},addEventListener:(name:string,fn:(event:any)=>void)=>{events[name]=fn;},registration:{showNotification}}});let work:Promise<void>|undefined;events.push({data:{json:()=>({url:'/log/hangout-id',body:'Someone added to a hangout.'})},waitUntil:(p:Promise<void>)=>{work=p;}});await work;expect(showNotification).toHaveBeenCalledWith('Notification',expect.objectContaining({body:'Someone added to a hangout.',data:{path:'/log/hangout-id'}}));
});
