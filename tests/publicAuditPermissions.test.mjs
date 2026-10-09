// Local-only regression checks. Run with node --test, never the cloud Vitest config.
// Evaluate current functions with in-memory adapters; do not import app/config/DB modules.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {transformSync} from 'esbuild';
import {z} from 'zod';

const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const operationsSource=source('server/operations.ts');
function evaluate(text,bindings,expression){
  const code=transformSync(text.replace(/^export /gm,''),{loader:'ts',format:'esm',target:'node22'}).code;
  return new Function(...Object.keys(bindings),`${code}\nreturn ${expression};`)(...Object.values(bindings));
}
function section(text,start,end){
  const at=text.indexOf(start),until=end?text.indexOf(end,at):text.length;
  assert.ok(at>=0&&until>at,`Current source section missing: ${start}`);
  return text.slice(at,until);
}
const pollSchema=evaluate(section(source('shared/postFeatures.ts'),'export const postPollOutput=','export type PostPoll='),{z},'postPollOutput');
const profileSchema=evaluate(section(source('shared/contracts.ts'),'const id = z.string();','const author ='),{z},'profileOutput');
const chain=items=>({limit(n){items=items.slice(0,n);return this;},sort(){return this;},async toArray(){return items;}});
class AppError extends Error {constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const requireValue=value=>{assert.ok(value,'Synthetic record is missing');return value;};
const actor={userId:'viewer',source:'agent',scope:'read',background:true,privateAccess:false};

async function pollProjection(){
  const rows=name=>({find:()=>chain(name==='postPollVotes'?[{postId:'poll',optionIndex:1}]:[]),aggregate:()=>chain([])});
  const postCards=evaluate(section(source('server/postProjection.ts'),'export async function postCards'),{
    rows,users:()=>({find:()=>chain([{_id:'author',name:'Author',handle:'author',discoverable:true}])}),
    uploads:()=>({find:()=>chain([])}),profileVisibleTo:async()=>true,unsuspendedActors:()=>[],
  },'postCards');
  return (await postCards([{_id:'poll',userId:'author',text:'Question',createdAt:'2026-10-09',poll:{items:['A','B'],duration:'forever',expiresAt:null,counts:[3,4],totalVotes:7}}],'viewer',[]))[0];
}
function executeRead(result,name='posts.get'){
  const authoritySource=source('server/backgroundAuthority.ts');
  const operationAvailable=evaluate(section(authoritySource,'const publicReads =','export async function assertBackgroundAuthority'),{},'operationAvailable');
  return evaluate(section(operationsSource,'export async function executeOperation'),{
    operations:[{name,kind:'read',agent:true,schema:{parse:value=>value},outputSchema:{parse:value=>value}}],
    operationAvailable,assertBackgroundAuthority:async()=>{},run:async()=>result,AppError,
  },'executeOperation');
}

test('public-only reads hide the owner poll selection and preserve aggregate poll content',async()=>{
  const card=await pollProjection();
  assert.equal(card.poll.userVoteIndex,1);
  const visible=await executeRead(card)('posts.get',{postId:'poll'},actor);
  assert.equal(visible.poll.userVoteIndex,null);
  assert.deepEqual(visible.poll.counts,[3,4]);assert.equal(visible.poll.totalVotes,7);
  assert.deepEqual(visible.poll.items,['A','B']);pollSchema.parse(visible.poll);
  assert.ok(!('saved' in visible));assert.ok(!('liked' in visible));
  assert.equal(card.poll.userVoteIndex,1,'Projection must not mutate the original result');
});

test('public-only redaction covers nested search, list and ancestor records',async()=>{
  const card=await pollProjection();
  for(const [name,result,pick] of [
    ['posts.list',{items:[card]},value=>value.items[0]],
    ['posts.ancestors',{items:[card]},value=>value.items[0]],
    ['search.query',{matches:[{record:card}]},value=>value.matches[0].record],
    ['search.global',{matches:[{record:card}]},value=>value.matches[0].record],
  ]){
    const visible=await executeRead(result,name)(name,{},actor);
    assert.equal(pick(visible).poll.userVoteIndex,null,name);
    pollSchema.parse(pick(visible).poll);
  }
});

test('browser, external, primary-agent and private-enabled automation keep their own vote',async()=>{
  const card=await pollProjection(),execute=executeRead(card);
  for(const allowed of [
    {userId:'viewer',source:'browser',scope:'write'},
    {userId:'viewer',source:'external',scope:'read'},
    {userId:'viewer',source:'agent',scope:'write'},
    {...actor,privateAccess:true},
  ])assert.equal((await execute('posts.get',{postId:'poll'},allowed)).poll.userVoteIndex,1);
});

function hiddenFixture(blockOwner){
  const viewer={_id:'viewer',handle:'viewer'},people=[
    {_id:'hidden',handle:'hidden',name:'Current name',discoverable:true,bio:'Current private-to-blocked-viewer bio',interests:['current interest'],city:'Current city',photos:['current-photo']},
    {_id:'visible',handle:'visible',name:'Visible person',discoverable:true,bio:'Visible bio',interests:[],city:'',photos:[]},
  ];
  const blocks=blockOwner?[{_id:`${blockOwner}:${blockOwner==='viewer'?'hidden':'viewer'}`,ownerId:blockOwner,members:['viewer','hidden'],pairId:'hidden:viewer'}]:[];
  const hiddenRecords=['hidden','visible'];let mutations=0;const enrichedIds=[];
  const rows=name=>({
    find:query=>{assert.equal(name,'blocks');return chain(blocks.filter(row=>row.members.includes(query.members)));},
    findOne:async query=>{assert.equal(name,'blocks');return blocks.find(row=>row.pairId===query.pairId)||null;},
    insertOne:async()=>{assert.equal(name,'recordEvents');mutations++;},
  });
  const users=()=>({
    findOne:async query=>query._id==='viewer'?viewer:people.find(person=>person._id===query._id&&(!query.suspendedAt||person.suspendedAt))||null,
    find:query=>chain(people.filter(person=>query._id.$in.includes(person._id))),
  });
  const bindings={rows,users,AppError,requireValue,randomUUID,pairId:(a,b)=>[a,b].sort().join(':'),
    profile:person=>({id:person._id,handle:person.handle,name:person.name,discoverable:person.discoverable,bio:person.bio,interests:person.interests,city:person.city,photos:person.photos}),
    hiddenPeoplePage:async(_owner,limit,before)=>{const remaining=hiddenRecords.slice(before?hiddenRecords.indexOf(before)+1:0),page=remaining.slice(0,limit);return {items:page.map(personId=>({personId})),nextCursor:remaining.length>limit?page.at(-1):null};},
    withMutualCounts:async(_owner,profiles)=>{enrichedIds.push(...profiles.map(person=>person.id));return profiles.map(person=>({...person,mutualCount:1,mutualFriends:[{id:'mutual',name:'Mutual friend'}],friendAction:'friend',connectionId:`viewer:${person.id}`}));},
    setPersonHidden:async(owner,id,hidden)=>{assert.equal(owner,'viewer');assert.equal(hidden,false);hiddenRecords.splice(hiddenRecords.indexOf(id),1);mutations++;},
  };
  const helperSource=section(operationsSource,'async function blockedIds(','async function connectionFor(');
  const helpers=evaluate(helperSource,{...bindings,circleSummaries:async()=>new Map()},'{blockedIds,notBlocked,registered}');
  const run=evaluate(section(operationsSource,'async function run(','export interface ExecutionProof'),{...bindings,...helpers},'run');
  return {run,blocks,hiddenRecords,enrichedIds,mutations:()=>mutations};
}
const browser={userId:'viewer',source:'browser',scope:'write'};

for(const owner of ['viewer','hidden'])test(`Hidden returns an unenriched unavailable row for a block owned by ${owner}`,async()=>{
  const fixture=hiddenFixture(owner),result=await fixture.run('people.search',{scope:'hidden',limit:20},browser);
  assert.deepEqual(result.items[0],{id:'hidden',name:'Unavailable person',city:'',bio:'',interests:[],discoverable:false,photos:[],hidden:true});
  assert.deepEqual(fixture.enrichedIds,['visible']);profileSchema.parse(result.items[0]);
  assert.equal(result.items[1].bio,'Visible bio');assert.equal(result.items[1].mutualCount,1);
  await assert.rejects(fixture.run('people.get',{personId:'hidden'},browser),{status:404,code:'unavailable'});
  assert.deepEqual(fixture.hiddenRecords,['hidden','visible']);assert.equal(fixture.blocks.length,1);assert.equal(fixture.mutations(),0);
});

test('Hidden query cannot discover blocked profile content',async()=>{
  for(const owner of ['viewer','hidden']){
    const fixture=hiddenFixture(owner),result=await fixture.run('people.search',{scope:'hidden',query:'current interest',limit:20},browser);
    assert.deepEqual(result.items,[]);assert.deepEqual(fixture.enrichedIds,[]);
  }
});

test('Hidden pagination retains blocked placeholders and reaches eligible later people',async()=>{
  const fixture=hiddenFixture('hidden'),first=await fixture.run('people.search',{scope:'hidden',limit:1},browser);
  assert.equal(first.items[0].id,'hidden');assert.equal(first.items[0].discoverable,false);assert.equal(first.nextCursor,'hidden');
  const next=await fixture.run('people.search',{scope:'hidden',limit:1,before:first.nextCursor},browser);
  assert.equal(next.items[0].id,'visible');assert.equal(next.nextCursor,null);
});

test('Unhide remains available without removing Block or another hidden person',async()=>{
  const fixture=hiddenFixture('hidden');
  assert.deepEqual(await fixture.run('people.hide',{personId:'hidden',hidden:false},browser),{personId:'hidden',hidden:false});
  assert.deepEqual(fixture.hiddenRecords,['visible']);assert.equal(fixture.blocks.length,1);assert.equal(fixture.mutations(),2);
});

test('Hidden returns current content and existing enrichment when no block exists',async()=>{
  const fixture=hiddenFixture(),result=await fixture.run('people.search',{scope:'hidden',limit:20},browser);
  assert.equal(result.items[0].handle,'hidden');assert.equal(result.items[0].bio,'Current private-to-blocked-viewer bio');
  assert.deepEqual(fixture.enrichedIds,['hidden','visible']);assert.equal(result.items[0].friendAction,'friend');
  profileSchema.parse(result.items[0]);
});
