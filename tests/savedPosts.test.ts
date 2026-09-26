import {beforeAll,afterAll,it,expect} from 'vitest';import {randomUUID} from 'node:crypto';
import {connectDatabase,db,mongo,rows} from '../server/db';import {createGuest,users,type Actor} from '../server/auth';import {executeOperation} from '../server/operations';import {nearestCoarseCell,coarsePoint} from '../shared/geo';import {operations} from '../shared/catalog';
let owner:Actor,other:Actor;const near=nearestCoarseCell(41.8,-71.4),far=nearestCoarseCell(34,-118.2);const ids:string[]=[];
beforeAll(async()=>{await connectDatabase();if(db().databaseName!=='newdrugs_test')throw Error('Isolated database only');for(const who of ['owner','other']){const user=await createGuest();await users().updateOne({_id:user._id},{$set:{handle:`saved_${randomUUID().slice(0,8)}`,discoverable:true}});const actor={userId:user._id,source:'external' as const,scope:'write' as const};if(who==='owner')owner=actor;else other=actor;}
 for(const [author,cell,parent]of [[owner,near,false],[other,near,true],[other,far,false]] as const){const id=randomUUID();ids.push(id);await rows('posts').insertOne({_id:id,userId:author.userId,text:'A post',createdAt:new Date().toISOString(),city:'Approximate area',area:{cell,label:'Approximate area',point:coarsePoint(cell)},...(parent?{parentId:ids[0],rootId:ids[0]}:{})});await executeOperation('posts.save',{postId:id,saved:true},owner,randomUUID());}
});
afterAll(async()=>{if(db().databaseName==='newdrugs_test'&&owner&&other){const actorIds=[owner.userId,other.userId];for(const name of ['posts','postSaves','receipts','notifications'])await rows(name).deleteMany({userId:{$in:actorIds}});await users().deleteMany({_id:{$in:actorIds}});}await mongo.close();});
const list=async(input:Record<string,unknown>={},actor=owner)=>executeOperation('posts.list',{scope:'saved',...input},actor) as Promise<{items:{id:string;sameArea?:boolean}[];nextCursor:string|null}>;
it('applies author, reply and geographic filters before saved-list pagination',async()=>{
 expect((await list({authorId:owner.userId})).items.map(x=>x.id)).toEqual([ids[0]]);
 expect((await list({kind:'replies'})).items.map(x=>x.id)).toEqual([ids[1]]);
 expect((await list({kind:'posts'})).items.map(x=>x.id).sort()).toEqual([ids[0],ids[2]].sort());
 const nearby=await list({near,radiusMiles:25});expect(nearby.items.map(x=>x.id).sort()).toEqual([ids[0],ids[1]].sort());expect(nearby.items.every(x=>x.sameArea)).toBe(true);
 const page=await list({kind:'replies',limit:1});expect(page.items[0].id).toBe(ids[1]);expect(page.nextCursor).toBeNull();
});
it('keeps the next page valid after removing its boundary bookmark and binds filters and caller',async()=>{
 const all=await list();const first=await list({limit:1});expect(first.nextCursor).toBeTruthy();
 await expect(list({before:first.nextCursor,kind:'replies'})).rejects.toMatchObject({code:'saved_query_changed'});
 await expect(list({before:first.nextCursor},other)).rejects.toMatchObject({code:'saved_query_changed'});
 await executeOperation('posts.save',{postId:first.items[0].id,saved:false},owner,randomUUID());
 const rest=await list({before:first.nextCursor});expect(rest.items.map(x=>x.id)).toEqual(all.items.slice(1).map(x=>x.id));
});
it('does not expose people bookmarks through operations or scopes',async()=>{
 expect(operations.some(op=>op.name==='people.save')).toBe(false);
 await expect(executeOperation('people.search',{scope:'saved'},owner)).rejects.toThrow();
 await expect(executeOperation('app.open',{view:'people',scope:'saved'},owner)).rejects.toMatchObject({code:'people_scope'});
});
