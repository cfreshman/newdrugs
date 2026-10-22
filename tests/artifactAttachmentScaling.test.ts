import {beforeEach,expect,it,vi} from 'vitest';
import {ARTIFACT_MAX_ASSETS} from '../shared/artifacts';

const mocked=vi.hoisted(()=>({rows:vi.fn(),transaction:vi.fn()}));
vi.mock('../server/db',()=>({rows:mocked.rows,transaction:mocked.transaction}));
vi.mock('../server/auth',()=>({hash:(value:string)=>value}));
import {syncSourceAttachments} from '../server/attachmentReferences';

beforeEach(()=>{mocked.rows.mockReset();mocked.transaction.mockReset();});

it.each([0,2000])('ordinary content sync touches at most ten current refs with %i stored versions',async(versionCount)=>{
 const ownerId='owner',sourceId='artifact',assets=Array.from({length:ARTIFACT_MAX_ASSETS},(_,index)=>({id:`image-${index}`,fileId:`current-${index}`}));
 const versions=Array.from({length:versionCount},(_,version)=>({contentRevision:version+1,assets:Array.from({length:ARTIFACT_MAX_ASSETS},(_,index)=>({id:`image-${index}`,fileId:`old-${version}-${index}`}))}));
 const historicRefs=new Set(versions.flatMap(version=>version.assets.map(asset=>asset.fileId))),touchedRefs=new Set<string>(),uploadIds=new Set<string>();
 const readRoot=vi.fn(async()=>({_id:sourceId,userId:ownerId,assets}));
 const findUploads=vi.fn((query:{_id:{$in:string[]};userId:string})=>{
  expect(query.userId).toBe(ownerId);expect(query._id.$in).toEqual(assets.map(asset=>asset.fileId));
  return {toArray:async()=>query._id.$in.map(_id=>({_id}))};
 });
 const updateUpload=vi.fn(async(query:{_id:string})=>{uploadIds.add(query._id);return {matchedCount:1};});
 const updateRef=vi.fn(async(_query:unknown,update:{$setOnInsert:{fileId:string;sourceId:string;ownerId:string}})=>{
  const ref=update.$setOnInsert;expect(ref.sourceId).toBe(sourceId);expect(ref.ownerId).toBe(ownerId);expect(ref.fileId).toMatch(/^current-/);touchedRefs.add(ref.fileId);return {upsertedCount:1};
 });
 mocked.rows.mockImplementation((name:string)=>{
  if(name==='artifacts')return {findOne:readRoot};
  if(name==='uploads')return {find:findUploads,updateOne:updateUpload};
  if(name==='attachmentReferences')return {updateOne:updateRef,find(){throw Error('An ordinary update must not read historical references.');},deleteMany(){throw Error('An ordinary update must not remove historical references.');}};
  if(name==='artifactVersions')throw Error('An ordinary update must not read the version history.');
  throw Error(`Unexpected collection ${name}.`);
 });
 await syncSourceAttachments('artifacts',sourceId);
 expect(readRoot).toHaveBeenCalledOnce();expect(findUploads).toHaveBeenCalledOnce();expect(updateRef).toHaveBeenCalledTimes(ARTIFACT_MAX_ASSETS);expect(updateUpload).toHaveBeenCalledTimes(ARTIFACT_MAX_ASSETS);
 expect(touchedRefs.size).toBe(ARTIFACT_MAX_ASSETS);expect(uploadIds.size).toBe(ARTIFACT_MAX_ASSETS);expect(historicRefs.size).toBe(versionCount*ARTIFACT_MAX_ASSETS);expect(mocked.rows.mock.calls.some(([name])=>name==='artifactVersions')).toBe(false);expect(mocked.transaction).not.toHaveBeenCalled();
});
