import {beforeAll,beforeEach,afterAll,afterEach,it,expect,vi} from 'vitest';
import {connectDatabase,db,mongo,rows} from '../server/db';
import {users,type Actor,type User} from '../server/auth';
import {config} from '../server/config';
import {executeOperation} from '../server/operations';
import {buildResourceLinks} from '../server/resourceLinks';
import {backgroundCanRead} from '../server/backgroundAuthority';
import {nearestCoarseCell,coarsePoint} from '../shared/geo';
import {operations,describeOperation} from '../shared/catalog';
const actor:Actor={userId:'me',source:'external',scope:'read'},baseTime=Date.now()-3600000;
const at=(n:number)=>new Date(baseTime+n*1000).toISOString(),id=(n:number)=>n.toString(16).padStart(24,'0');
const area=(lat:number,lon:number,label='Shared area')=>{const cell=nearestCoarseCell(lat,lon);return {cell,label,point:coarsePoint(cell)};};
async function clean(){if(db().databaseName!=='newdrugs_test')throw Error('Isolated test database required');for(const collection of await db().collections())await collection.deleteMany({});}
beforeAll(async()=>{if(new URL(config.MONGODB_URI).pathname!=='/newdrugs_test')throw Error('Isolated test database required');await connectDatabase();});
beforeEach(async()=>{
 await clean();const base:User={_id:'me',handle:'me',name:'Name',bio:'public bio',city:'',cityKey:'',interests:['walking'],discoverable:true,balanceNanos:1e9,reservedNanos:0,createdAt:at(0),area:area(41.8,-71.4)};
 await users().insertMany([{...base},{...base,_id:'alice',handle:'alice',area:area(42.36,-71.06)},{...base,_id:'bob',handle:'bob',area:area(40.7,-74)},{...base,_id:'former',handle:'former',discoverable:false,bio:'PRIVATE FORMER BIO'},{...base,_id:'hidden',handle:'hidden',discoverable:false,bio:'PRIVATE STRANGER BIO'},{...base,_id:'blocked',handle:'blocked'},{...base,_id:'noarea',handle:'noarea',area:null}]);
 const connection=(other:string,extra:Record<string,unknown>={})=>({_id:['me',other].sort().join(':'),members:['me',other],fromId:'me',toId:other,status:'accepted',note:'Invitation',createdAt:at(1),updatedAt:at(1),...extra});
 await rows('connections').insertMany([
  connection('alice',{updatedAt:at(20),lastMessage:{fromId:'me',text:'stale summary',createdAt:at(1)}}),connection('bob',{updatedAt:at(25)}),
  connection('former',{status:'disconnected',updatedAt:at(10),initialInvitation:{fromId:'me',note:'Original invite',createdAt:at(1)}}),
  connection('blocked',{updatedAt:at(29)}),
  {_id:'pending',members:['me','noarea'],fromId:'noarea',toId:'me',status:'pending',note:'Join me?',createdAt:at(15),updatedAt:at(26)},
  {_id:'responded',members:['me','bob'],fromId:'me',toId:'bob',status:'accepted',note:'An invite',createdAt:at(2),respondedAt:at(16),updatedAt:at(16)},
  {_id:'foreign',members:['alice','bob'],fromId:'alice',toId:'bob',status:'accepted',note:'not yours',createdAt:at(1)},
 ]);
 const msg=(n:number,connectionId:string,fromId:string,extra:Record<string,unknown>={})=>({_id:id(n),connectionId,fromId,text:`Message ${n}`,createdAt:at(n),...extra});
 await rows('directMessages').insertMany([msg(20,'alice:me','alice'),msg(18,'bob:me','bob'),msg(25,'bob:me','me'),msg(10,'former:me','former',{text:'HIDDEN MODERATED MESSAGE',moderatedAt:at(30)}),msg(29,'blocked:me','blocked'),msg(28,'foreign','bob')]);
 const post=(n:number,userId:string,parent?:number,root?:number,extra:Record<string,unknown>={})=>({_id:id(n),userId,text:`Post ${n}`,city:'',fileIds:[],links:[],createdAt:at(n),...(parent?{parentId:id(parent),rootId:id(root||parent)}:{}),...extra});
 await rows('posts').insertMany([post(1,'me'),post(2,'bob'),post(3,'me',2,2),post(4,'alice'),post(11,'alice',1,1),post(12,'bob',11,1),post(13,'alice',2,2),post(14,'alice',4,4),post(15,'blocked',1,1),post(16,'alice',1,1,{moderatedAt:at(30)}),post(17,'me',1,1),post(18,'former')]);
 await rows('postLikes').insertMany([{_id:'like',userId:'alice',postId:id(1),createdAt:at(17)},{_id:'foreign-like',userId:'alice',postId:id(2),createdAt:at(18)}]);
 await rows('blocks').insertOne({_id:'blocked',pairId:'blocked:me',members:['me','blocked']});await rows('notifications').insertOne({_id:'private-agent-notice',userId:'me',kind:'agent_update',text:'PRIVATE AGENT UPDATE',readAt:null});
});
afterEach(()=>vi.restoreAllMocks());afterAll(async()=>{await clean();await mongo.close();});
const read=(name:string,input:unknown={},who=actor)=>executeOperation(name,input,who) as Promise<any>;
it('bundles authorized person context while preserving private former-contact and stranger boundaries',async()=>{
 const value=await read('people.context',{personId:'alice'});expect(value.person.handle).toBe('alice');expect(value.connection.id).toBe('alice:me');expect(value.recentPosts.items.length).toBeGreaterThan(0);
 expect(buildResourceLinks('people.context',{},value,actor).some(link=>link.resourceType==='conversation'&&link.resourceId==='alice:me')).toBe(true);
 const former=await read('people.context',{personId:'former'});expect(former.person).toBeNull();expect(former.profileAvailable).toBe(false);expect(former.connection.status).toBe('disconnected');expect(JSON.stringify(former)).not.toContain('PRIVATE FORMER BIO');
 await expect(read('people.context',{personId:'hidden'})).rejects.toMatchObject({status:404});await expect(read('people.context',{personId:'blocked'})).rejects.toMatchObject({status:404});
});
it('filters by the canonical last DM before pagination, without treating invitation notes as messages',async()=>{
 const first=await read('connections.list',{lastMessageFrom:'other',limit:1});expect(first.items[0].id).toBe('alice:me');expect(first.items[0].lastMessage.text).toBe('Message 20');
 const second=await read('connections.list',{lastMessageFrom:'other',limit:1,before:first.nextCursor});expect(second.items[0].id).toBe('former:me');expect(second.items[0].lastMessage.text).toBe('Message removed by moderation.');expect(second.nextCursor).toBeNull();
 expect((await read('connections.list',{lastMessageFrom:'me'})).items.map((row:any)=>row.id)).toEqual(['bob:me']);
 expect((await read('connections.list',{})).items.some((row:any)=>row.id==='pending')).toBe(true);
});
it('finds follow-ups in participated threads and rechecks current authorship and blocks',async()=>{
 const value=await read('posts.thread_updates',{});expect(value.items.map((post:any)=>post.id)).toEqual([id(13),id(12),id(11)]);
 expect((await read('posts.incoming_replies',{})).items.map((post:any)=>post.id)).toEqual([id(11)]);
 const first=await read('posts.thread_updates',{limit:1});expect((await read('posts.thread_updates',{before:first.nextCursor,since:at(11)})).items.map((post:any)=>post.id)).toEqual([id(12)]);
 await rows('posts').updateOne({_id:id(3)},{$set:{deletedAt:at(30)}});expect((await read('posts.thread_updates',{})).items.map((post:any)=>post.id)).not.toContain(id(13));
});
it('provides complete ordered catch-up pages and excludes foreign, moderated and private agent activity',async()=>{
 const query={since:at(0),until:at(40),limit:1};let cursor:string|undefined,items:any[]=[];
 for(let page=0;page<20;page++){const next=await read('activity.since',{...query,...(cursor?{before:cursor}:{})});items.push(...next.items);if(!next.nextCursor)break;cursor=next.nextCursor;}
 expect(items.map(item=>item.kind)).toEqual(['message','message','post_like','connection_accepted','invitation','post_reply']);
 expect(new Set(items.map(item=>item.id)).size).toBe(items.length);expect(JSON.stringify(items)).not.toMatch(/PRIVATE AGENT|HIDDEN MODERATED|Message 28|Message 29/);
 expect(items.every(item=>item.link.url&&item.link.targetKind==='exact')).toBe(true);expect((await rows('notifications').findOne({_id:'private-agent-notice'}))?.readAt).toBeNull();expect(await rows('receipts').countDocuments()).toBe(0);
 const first=await read('activity.since',query);await expect(read('activity.since',{...query,kinds:['reactions'],before:first.nextCursor})).rejects.toMatchObject({code:'activity_cursor'});await expect(read('activity.since',{...query,before:first.nextCursor},{...actor,userId:'alice'})).rejects.toMatchObject({code:'activity_cursor'});
 expect((await read('activity.since',{...query,kinds:['replies'],limit:20})).items).toHaveLength(1);
});
it('honors the catch-up time boundary and labels snippets instead of claiming full message content',async()=>{
 await rows('directMessages').updateOne({_id:id(20)},{$set:{text:'x'.repeat(600)}});
 const value=await read('activity.since',{since:at(19),until:at(21)});expect(value.items).toHaveLength(1);expect(value.items[0].text).toHaveLength(300);expect(value.items[0].textTruncated).toBe(true);
 const none=await read('activity.since',{since:at(21),until:at(24)});expect(none.items).toEqual([]);
});
it('computes meeting candidates solely from canonical coarse areas and does no external lookup',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('Network must not be used'));
 const original=(await users().findOne({_id:'me'}))!.area!;await users().updateOne({_id:'me'},{$set:{'area.point.coordinates':[-71.412345678,41.812345678]}});
 const result=await read('locations.meeting_area',{personIds:['alice']});expect(result.participants[0].area.point).toEqual(coarsePoint(original.cell));expect(result.candidates).toHaveLength(3);expect(fetch).not.toHaveBeenCalled();
 for(const item of result.candidates)expect(item.area.point).toEqual(coarsePoint(item.area.cell));expect(JSON.stringify(result)).not.toContain('41.812345678');
 expect(buildResourceLinks('locations.meeting_area',{},result,actor)).toEqual([]);
 await expect(read('locations.meeting_area',{personIds:['hidden']})).rejects.toMatchObject({status:404});await expect(read('locations.meeting_area',{personIds:['noarea']})).rejects.toMatchObject({code:'area_required'});
});
it('handles locations across the dateline and same-cell privacy labels',async()=>{
 await users().updateOne({_id:'me'},{$set:{area:area(10,179)}});await users().updateOne({_id:'alice'},{$set:{area:area(10,-179)}});
 const across=await read('locations.meeting_area',{personIds:['alice'],limit:1});expect(Math.abs(across.candidates[0].area.point.coordinates[0])).toBeGreaterThan(170);
 const same=area(41.8,-71.4);await users().updateMany({_id:{$in:['me','alice']}},{$set:{area:same}});const together=await read('locations.meeting_area',{personIds:['alice'],limit:1});expect(together.candidates[0].area.cell).toBe(same.cell);expect(together.candidates[0].distances.every((item:any)=>item.sameArea&&!('approximateMiles'in item))).toBe(true);
});
it('keeps account-context helpers scoped and publishes complete read contracts',()=>{
 const background={...actor,background:true};for(const name of ['people.context','activity.since','connections.list']){expect(backgroundCanRead(background,name)).toBe(false);expect(backgroundCanRead({...background,accountActivity:true},name)).toBe(true);}
 for(const name of ['people.context','activity.since','posts.thread_updates','locations.meeting_area','time.resolve','time.convert','time.overlap']){const op=operations.find(op=>op.name===name)!;expect(op.kind).toBe('read');expect(op.outputSchema).toBeDefined();expect(describeOperation(name)?.confirmationRequired).toBe(false);}
});
