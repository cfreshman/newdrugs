import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {config} from '../server/config';
import {users,type Actor,type User} from '../server/auth';
import {executeOperation} from '../server/operations';
import {buildResourceLinks} from '../server/resourceLinks';
import {parseDestination} from '../shared/navigation';
import {describeOperation} from '../shared/catalog';
const actor:Actor={userId:'me',source:'external',scope:'read'};
const id=(number:number)=>number.toString(16).padStart(24,'0');
async function clean(){if(db().databaseName!=='newdrugs_test')throw new Error('Isolated database required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{if(new URL(config.MONGODB_URI).pathname!=='/newdrugs_test')throw new Error('Isolated database required');await connectDatabase();});
beforeEach(async()=>{
 await clean();const base:User={_id:'me',name:'Test',handle:'test',bio:'',city:'',cityKey:'',interests:[],discoverable:true,balanceNanos:1000000000,reservedNanos:0,createdAt:'2026-09-26T00:00:00.000Z'};
 await users().insertMany(['me','alice','bob','blocked','suspended'].map(name=>({...base,_id:name,handle:name,...(name==='suspended'?{suspendedAt:base.createdAt}:{})})));
 const post=(n:number,userId:string,parent?:number,extra:Record<string,unknown>={})=>({_id:id(n),userId,text:`Post ${n}`,city:'',fileIds:[],links:[],createdAt:`2026-09-26T12:00:${String(n).padStart(2,'0')}.000Z`,...(parent?{parentId:id(parent),rootId:id(parent)}:{}),...extra});
 await rows('posts').insertMany([post(1,'me'),post(2,'alice'),post(3,'me',2),post(4,'me',undefined,{text:'removed parent text',deletedAt:base.createdAt}),post(10,'alice',1),post(11,'bob',3),post(12,'me',1),post(13,'alice',2),post(14,'bob',10),post(15,'alice',1,{deletedAt:base.createdAt}),post(16,'blocked',1),post(17,'suspended',1),post(18,'alice',99),post(19,'missing-author',1),post(20,'alice',1,{moderatedAt:base.createdAt}),post(21,'alice',4)]);
 await rows('blocks').insertOne({_id:'block',pairId:'blocked:me',members:['blocked','me']});await rows('notifications').insertOne({_id:'reply-notice',userId:'me',actorId:'alice',kind:'post_reply',postId:id(10),readAt:null});
});
afterAll(async()=>{await clean();await mongo.close();});
const read=(input:Record<string,unknown>={},who=actor)=>executeOperation('posts.incoming_replies',input,who) as Promise<{items:{id:string;parentId:string;parent:{id:string;text:string;deleted:boolean}}[];nextCursor:string|null}>;
it('collects incoming direct replies across owned posts and comments with visibility filtering and parent context',async()=>{
 const result=await read();expect(result.items.map(post=>post.id)).toEqual([id(21),id(11),id(10)]);
 expect(result.items[0].parent).toMatchObject({id:id(4),deleted:true,text:''});expect(result.items[1].parent).toMatchObject({id:id(3),text:'Post 3'});
 expect((await rows('notifications').findOne({_id:'reply-notice'}))?.readAt).toBeNull();expect(await rows('receipts').countDocuments()).toBe(0);expect((await users().findOne({_id:'me'}))?.balanceNanos).toBe(1e9);
});
it('paginates and filters by time while binding the lookup to the current account',async()=>{
 const first=await read({limit:1});expect(first.items[0].id).toBe(id(21));
 const second=await read({limit:1,before:first.nextCursor});expect(second.items[0].id).toBe(id(11));const third=await read({limit:1,before:second.nextCursor});expect(third.items[0].id).toBe(id(10));expect(third.nextCursor).toBeNull();
 expect((await read({since:'2026-09-26T12:00:11.000Z'})).items.map(post=>post.id)).toEqual([id(21)]);
 const other=await read({}, {...actor,userId:'alice'});expect(other.items.every(post=>![id(21),id(11),id(10)].includes(post.id))).toBe(true);
 await expect(read({personId:'alice'})).rejects.toThrow();
});
it('exposes the read contract and exact reply links plus the ordered list destination',async()=>{
 const definition=describeOperation('posts.incoming_replies')!;expect(definition.kind).toBe('read');expect(definition.confirmationRequired).toBe(false);
 const result=await read();const links=buildResourceLinks('posts.incoming_replies',{},result,actor);
 expect(links.filter(link=>link.targetKind==='exact').map(link=>link.resourceId)).toEqual(result.items.map(post=>post.id));
 const selection=links.find(link=>link.resourceType==='post_list')!;expect(parseDestination(selection.url,config.uiOrigin)?.postIds).toEqual(result.items.map(post=>post.id));
});
it('returns the visible parent chain in order and stops at unavailable ancestors',async()=>{
 const chain=await executeOperation('posts.ancestors',{postId:id(14)},actor) as {items:{id:string;text:string}[];earlierId:string|null;unavailable:boolean};
 expect(chain.items.map(post=>post.id)).toEqual([id(1),id(10)]);expect(chain.earlierId).toBeNull();expect(chain.unavailable).toBe(false);
 const deleted=await executeOperation('posts.ancestors',{postId:id(21)},actor) as typeof chain;
 expect(deleted.items).toMatchObject([{id:id(4),text:'',deleted:true}]);
 await rows('posts').insertOne({_id:id(22),userId:'alice',text:'Safe child',city:'',fileIds:[],links:[],parentId:id(16),rootId:id(1),createdAt:'2026-09-26T12:00:22.000Z'});
 const hidden=await executeOperation('posts.ancestors',{postId:id(22)},actor) as typeof chain;
 expect(hidden.items).toEqual([]);expect(hidden.unavailable).toBe(true);expect(JSON.stringify(hidden)).not.toContain('Post 16');
 const missing=await executeOperation('posts.ancestors',{postId:id(18)},actor) as typeof chain;
 expect(missing.items).toEqual([]);expect(missing.unavailable).toBe(true);
 expect(describeOperation('posts.ancestors')?.kind).toBe('read');
});
