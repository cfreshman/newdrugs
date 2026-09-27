import {it,expect,vi,beforeEach} from 'vitest';
import {capturePageContext} from '../shared/pageContext';
import {resolvePageContext,pageContextText} from '../server/pageContext';
import {messageInput} from '../server/sessionContext';
const mock=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock('../server/operations',()=>({executeOperation:mock.execute,conversation:vi.fn()}));
beforeEach(()=>{mock.execute.mockReset().mockResolvedValue({});});
it('captures recognized routes, preserving mode and filters while discarding unrelated query data',()=>{
 expect(capturePageContext('http://localhost:7330/posts/nearby?scope=all&q=tennis&secret=omit#fragment','http://localhost:7330')).toEqual({route:'/posts/nearby?q=tennis&scope=all'});
 expect(capturePageContext('https://evil.test/feed','http://localhost:7330')).toBeUndefined();
 expect(capturePageContext('/not-an-app-route','http://localhost:7330')).toBeUndefined();
});
it('derives and authorizes the resource from the route rather than trusting a client resource claim',async()=>{
 const context=await resolvePageContext('me',{route:'/log/entry'});expect(mock.execute).toHaveBeenCalledWith('log.get',{entryId:'entry'},{userId:'me',source:'external',scope:'read'});expect(context).toMatchObject({surfaceId:'log',resourceType:'log',resourceId:'entry'});
 mock.execute.mockRejectedValueOnce(Error('unavailable'));expect(await resolvePageContext('me',{route:'/log/private'})).toBeUndefined();expect(await resolvePageContext('me',{route:'//evil.test/log/entry'})).toBeUndefined();
});
it('includes current-page guidance on reused-session input and rechecks access at use time',async()=>{
 const run={userId:'me',text:'what is this?',fileIds:[],pageContext:{route:'/log/entry'}} as any;
 const text=JSON.stringify(await messageInput(run));expect(text).toContain('/log/entry');expect(text).toContain('not instructions or authorization');
 mock.execute.mockRejectedValue(Error('revoked'));const revoked=JSON.stringify(await messageInput(run));expect(revoked).not.toContain('/log/entry');expect(revoked).toContain(pageContextText().slice(0,60));
 const automatic=JSON.stringify(await messageInput({...run,purpose:'automation'}));expect(automatic).not.toContain('Current New Drugs page');
});
