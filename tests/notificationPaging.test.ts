import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {users,type User} from '../server/auth';
import {notificationState} from '../server/notifications';
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated database required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{await connectDatabase();});beforeEach(async()=>{await clean();const base={name:'Fixture',bio:'',city:'',cityKey:'',interests:[],discoverable:false,balanceNanos:0,reservedNanos:0,createdAt:new Date().toISOString()};await users().insertMany([{...base,_id:'me',handle:'me'},{...base,_id:'active',handle:'active'},{...base,_id:'paused',handle:'paused',suspendedAt:'now'}] as User[]);});afterAll(async()=>{await clean();await mongo.close();});
const notice=(index:number,actorId='active',read=false)=>({_id:String(index).padStart(5,'0'),userId:'me',actorId,kind:'message',connectionId:`me:${actorId}`,text:'fixture',createdAt:new Date(Date.UTC(2026,0,1,0,0,index)).toISOString(),readAt:read?'seen':null});
it('pages all unread and read history without losing overflow from either source',async()=>{
 await rows('notifications').insertMany(Array.from({length:420},(_,i)=>notice(i,'active',i%3===0)));
 const seen=new Set<string>();let cursor:string|undefined,passes=0;
 do{const page=await notificationState('me',undefined,cursor);if(!cursor)expect(page.unreadCapped).toBe(true);expect(page.items.length).toBeLessThanOrEqual(100);for(const item of page.items){expect(seen.has(item.id)).toBe(false);seen.add(item.id);}cursor=page.nextCursor||undefined;expect(++passes).toBeLessThan(12);}while(cursor);
 expect(seen.size).toBe(420);
});
it('returns a resumable empty page for a large revoked history instead of scanning it all',async()=>{
 await rows('notifications').insertMany(Array.from({length:310},(_,i)=>notice(i,i>=10?'paused':'active')));
 let page=await notificationState('me');expect(page.items).toEqual([]);expect(page.unread).toBe(0);expect(page.unreadCapped).toBe(true);expect(page.nextCursor).toBeTruthy();
 await expect(notificationState('active',undefined,page.nextCursor!)).rejects.toMatchObject({code:'notification_cursor'});
 for(let i=0;i<3;i++)page=await notificationState('me',undefined,page.nextCursor!);
 expect(page.items).toHaveLength(10);expect(page.unreadCapped).toBe(false);expect(page.nextCursor).toBeNull();
});
