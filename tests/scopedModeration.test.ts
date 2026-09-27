import {beforeAll,beforeEach,afterAll,it,expect,vi} from 'vitest';
import {Collection} from 'mongodb';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {users,type Actor,type User} from '../server/auth';
import {executeOperation} from '../server/operations';
import {notificationState} from '../server/notifications';
import {randomUUID} from 'node:crypto';
const clean=async()=>{if(db().databaseName!=='newdrugs_test')throw Error('Isolated database required');for(const collection of await db().collections())await collection.deleteMany({});};
beforeAll(async()=>{await connectDatabase();});beforeEach(clean);afterAll(async()=>{await clean();await mongo.close();});
it('filters suspended candidates across social surfaces without loading the global suspension list',async()=>{
 const now=new Date().toISOString(),base:User={_id:'me',handle:'me',name:'Me',bio:'',city:'',cityKey:'',interests:[],discoverable:true,balanceNanos:0,reservedNanos:0,createdAt:now};
 await users().insertMany([base,{...base,_id:'active',handle:'active'},{...base,_id:'paused',handle:'paused',suspendedAt:now},...Array.from({length:1000},(_,i)=>({...base,_id:`unrelated-${i}`,handle:`unrelated_${i}`,suspendedAt:now}))]);
 const actor:Actor={userId:'me',source:'external',scope:'read'},read=(name:string,input={})=>executeOperation(name,input,actor,randomUUID()) as Promise<any>;
 await rows('connections').insertMany(['active','paused'].map(person=>({_id:`me:${person}`,members:['me',person],fromId:'me',toId:person,note:'',status:'accepted',createdAt:now,updatedAt:now})));
 await rows('posts').insertMany([{_id:'mine',userId:'me',text:'Mine',createdAt:now},{_id:'active-post',userId:'active',text:'Visible',createdAt:now},{_id:'paused-post',userId:'paused',text:'Hidden',createdAt:now},{_id:'paused-reply',parentId:'mine',userId:'paused',text:'Hidden reply',createdAt:now}]);
 await rows('postLikes').insertMany(['active','paused'].map(userId=>({_id:userId,userId,postId:'mine'})));
 await rows('notifications').insertMany(['active','paused'].map(actorId=>({_id:actorId,userId:'me',actorId,kind:'message',connectionId:`me:${actorId}`,createdAt:now,readAt:null,text:''})));
 await rows('logEntries').insertOne({_id:'private-log',members:['me','paused'],invited:[],title:'Unavailable'});await rows('notifications').insertOne({_id:'log-notice',userId:'me',actorId:'active',kind:'log_update',entryId:'private-log',createdAt:now,readAt:null});
 const find=vi.spyOn(Collection.prototype,'find');
 try{
  expect((await read('people.search',{scope:'all'})).items.map((person:any)=>person.id)).toEqual(['active']);
  expect((await read('posts.list',{scope:'public'})).items.map((post:any)=>post.id).sort()).toEqual(['active-post','mine']);
  expect((await read('posts.list',{scope:'selected',postIds:['active-post','paused-post']})).items.map((post:any)=>post.id)).toEqual(['active-post']);
  expect((await read('posts.get',{postId:'mine'}))).toMatchObject({likeCount:1,replyCount:0});
  expect((await read('posts.replies',{postId:'mine'})).items).toEqual([]);
  expect((await read('connections.list')).items.map((item:any)=>item.id)).toEqual(['me:active']);
  const notifications=await notificationState('me');expect(notifications.unread).toBe(1);expect(notifications.items.map(item=>item.id)).toEqual(['active']);
  expect(find.mock.calls.some(([filter])=>filter&&JSON.stringify(filter).includes('suspendedAt')&&!JSON.stringify(filter).includes('_id'))).toBe(false);
 }finally{find.mockRestore();}
});
