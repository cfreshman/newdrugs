import {beforeEach,expect,it,vi} from 'vitest';
import {capturePageContext} from '../shared/pageContext';
import {recordReferenceSchema} from '../shared/recordContext';
import {resolvePageContext,pageContextText} from '../server/pageContext';
import {resolveRecordContexts} from '../server/recordContext';

const mock=vi.hoisted(()=>({execute:vi.fn(),artifact:vi.fn(),summary:vi.fn()}));
vi.mock('../server/operations',()=>({executeOperation:mock.execute}));
vi.mock('../server/artifacts',()=>({publicArtifact:mock.artifact,publicArtifactSummary:mock.summary}));

const id='e1f7a222-7804-46a4-8f85-b694a726e935';
const detail={id,title:'Original graph',revision:2,contentRevision:1,updatedAt:'2026-10-22T00:00:00.000Z',contentUpdatedAt:'2026-10-22T00:00:00.000Z',bodyHtml:'private-html-marker',data:{value:'private-data-marker'},assets:[],refreshInstruction:'private-refresh-marker'};
beforeEach(()=>{mock.execute.mockReset();mock.artifact.mockReset().mockResolvedValue(detail);mock.summary.mockReset().mockResolvedValue({id,title:detail.title});});

it('captures and reauthorizes the displayed artifact version without reading its source',async()=>{
 for(const version of [1,'legacy'] as const){
  const route=`/posts/artifacts/${id}?version=${version}`;
  expect(capturePageContext(`${route}&ignored=secret#fragment`,'https://dev.druggie.org')).toEqual({route});
  const context=await resolvePageContext('viewer',{route});
  expect(mock.summary).toHaveBeenLastCalledWith(id,version);
  expect(context).toMatchObject({route,surfaceId:'artifacts',resourceId:id,resourceType:'artifact',contentRevision:version});
  expect(pageContextText(context)).toContain(`contentRevision:${JSON.stringify(version)}`);
 }
 expect(mock.artifact).not.toHaveBeenCalled();expect(mock.execute).not.toHaveBeenCalled();
 mock.summary.mockRejectedValueOnce(Error('revoked'));expect(await resolvePageContext('viewer',{route:`/artifacts/${id}?version=1`})).toBeUndefined();
 expect(await resolvePageContext('viewer',{route:`/artifacts/${id}?version=0`})).toBeUndefined();
});

it('keeps canonical latest page context separate from a pinned snapshot',async()=>{
 const context=await resolvePageContext('viewer',{route:`/artifacts/${id}`});
 expect(mock.summary).toHaveBeenCalledWith(id,undefined);
 expect(context).not.toHaveProperty('contentRevision');
 expect(pageContextText(context)).not.toContain('using contentRevision:');
});

it('attaches a saved display using bounded metadata and an exact version link',async()=>{
 for(const contentRevision of [1,'legacy'] as const){
  const result=await resolveRecordContexts('viewer',[{kind:'artifact',id,contentRevision}]);
  expect(mock.artifact).toHaveBeenLastCalledWith(id,contentRevision);
  expect(result.attachments).toEqual([{kind:'artifact',id,contentRevision,title:'Original graph'}]);
  const text=JSON.stringify(result.content);
  expect(text).toContain('Artifact content version 1');expect(text).toContain(`?version=1`);
  expect(text).toContain('without a contentRevision');expect(text).toContain('not permission to edit');
  for(const marker of ['private-html-marker','private-data-marker','private-refresh-marker'])expect(text).not.toContain(marker);
 }
});

it('applies the refresh revision fence to the current record rather than the displayed snapshot',async()=>{
 mock.artifact.mockImplementation(async(_id,version)=>version===undefined?{...detail,revision:7,contentRevision:4}:detail);
 await expect(resolveRecordContexts('owner',[{kind:'artifact',id,contentRevision:1,revision:7}])).resolves.toMatchObject({attachments:[{revision:7,contentRevision:1}]});
 await expect(resolveRecordContexts('owner',[{kind:'artifact',id,contentRevision:1,revision:2}])).rejects.toMatchObject({code:'artifact_changed'});
});

it('validates numeric and legacy record selectors and rechecks removed versions',async()=>{
 for(const contentRevision of [1,'legacy'] as const)expect(recordReferenceSchema.safeParse({kind:'artifact',id,contentRevision}).success).toBe(true);
 for(const contentRevision of [0,-1,.5,'latest'])expect(recordReferenceSchema.safeParse({kind:'artifact',id,contentRevision}).success).toBe(false);
 mock.artifact.mockRejectedValueOnce(Object.assign(Error('unavailable'),{code:'not_found'}));
 await expect(resolveRecordContexts('viewer',[{kind:'artifact',id,contentRevision:1}])).rejects.toMatchObject({code:'not_found'});
});
