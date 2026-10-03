import type {ClientSession} from 'mongodb';
import {rows,type Row} from './db';
import {users} from './auth';
import {postCards} from './postProjection';

const MAX_ANCESTORS=50;

/** Follow only the selected post's parent links, with a fixed indexed depth cap. */
export async function postAncestors(postId:string,userId:string,blocked:string[],session?:ClientSession){
 const [source]=await rows('posts').aggregate<{parentId?:string;ancestors:(Row&{depth:number;parentId?:string;userId:string})[]}>([
  {$match:{_id:postId}},
  {$graphLookup:{from:'posts',startWith:'$parentId',connectFromField:'parentId',connectToField:'_id',as:'ancestors',depthField:'depth',maxDepth:MAX_ANCESTORS-1}},
  {$project:{parentId:1,ancestors:1}},
 ],{session,maxTimeMS:10000}).toArray();
 if(!source?.parentId)return {items:[],earlierId:null,unavailable:false};
 const chain=source.ancestors.sort((a,b)=>a.depth-b.depth),authors=await users().find({_id:{$in:[...new Set(chain.map(post=>post.userId))]}},{session,projection:{suspendedAt:1}}).toArray();
 const byAuthor=new Map(authors.map(author=>[author._id,author])),blockedSet=new Set(blocked),visible:Row[]=[];
 let unavailable=chain[0]?.depth!==0;
 for(const post of chain){
  if(post.depth!==visible.length||blockedSet.has(post.userId)||!byAuthor.has(post.userId)||byAuthor.get(post.userId)?.suspendedAt){unavailable=true;break;}
  visible.push(post);
 }
 const cards=await postCards([...visible].reverse(),userId,blocked,session),byId=new Map(cards.map(card=>[card.id,card]));
 const contiguous=[];for(const post of visible){const card=byId.get(post._id);if(!card){unavailable=true;break;}contiguous.push(card);}
 const farthest=visible.at(-1),earlierId=!unavailable&&visible.length===MAX_ANCESTORS&&farthest?.parentId&&!visible.some(post=>post._id===farthest.parentId)?String(farthest.parentId):null;
 if(!earlierId&&farthest?.parentId&&!visible.some(post=>post._id===farthest.parentId))unavailable=true;
 return {items:contiguous.reverse(),earlierId,unavailable};
}
