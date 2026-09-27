import {IDBFactory} from 'fake-indexeddb';
import {it,expect} from 'vitest';
import {LogSnapshotStore,type LogSnapshot} from '../src/logSnapshotStore';
import type {LogEntry} from '../shared/log';
const entry=(id:string):LogEntry=>({id,ownerId:'one',date:'2026-09-27',title:id,place:'',links:[],recurrence:'none',coverFileId:null,revision:1,createdAt:'2026-09-27',updatedAt:'2026-09-27',membership:'member',contributors:[{userId:'one',name:'One',note:'Human note',files:[]}],invitations:[]});
const row=(id:string,at:number):LogSnapshot=>({key:`one:${id}`,userId:'one',entry:entry(id),storedAt:at,accessedAt:at,bytes:512});
it('persists snapshots across instances, touches LRU, bounds space/count, and expires old data',async()=>{
 const factory=new IDBFactory();let now=100;const options={factory,now:()=>now,limits:{items:2,bytes:1100,age:1000}},store=new LogSnapshotStore(options);await store.bind('one');await store.put(row('a',now++));await store.put(row('b',now++));await store.get('one','a');now++;await store.put(row('c',now));expect(await store.get('one','b')).toBeNull();const restarted=new LogSnapshotStore(options);expect((await restarted.bind('one')).map(r=>r.entry.id).sort()).toEqual(['a','c']);expect((await restarted.get('one','a'))?.entry.contributors[0].note).toBe('Human note');now+=1001;expect(await restarted.get('one','a')).toBeNull();await store.put({...row('big',now),bytes:2000});expect(await store.get('one','big')).toBeNull();
});
it('clears private details on account switches/logout and rejects late writes for the former account',async()=>{
 const store=new LogSnapshotStore({factory:new IDBFactory()});await store.bind('one');await store.put(row('a',Date.now()));expect(await store.get('two','a')).toBeNull();await store.bind('two');await store.put(row('late',Date.now()));expect(await store.bind('one')).toEqual([]);await store.put(row('a',Date.now()));await store.bind(null);expect(await store.bind('one')).toEqual([]);
});
it('does not let an older result replace a newer saved revision',async()=>{
 const store=new LogSnapshotStore({factory:new IDBFactory()});await store.bind('one');const original=row('a',Date.now());await store.put({...original,entry:{...original.entry,revision:2,title:'Fresh'}});await store.put({...original,storedAt:Date.now()+1});expect((await store.get('one','a'))?.entry.title).toBe('Fresh');await store.remove('one','a');expect(await store.get('one','a')).toBeNull();
});
it('degrades to no cached snapshot when IndexedDB is unavailable',async()=>{
 const store=new LogSnapshotStore({factory:{open(){throw new DOMException('Denied','SecurityError');}} as unknown as IDBFactory});expect(await store.bind('one')).toEqual([]);expect(await store.get('one','a')).toBeNull();await store.put(row('a',Date.now()));
});
