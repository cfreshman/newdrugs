import { expect, it } from 'vitest';
import { cleanDestinationContext, destinationPath, parseDestination, surfaceViews } from '../shared/navigation';
import { buildResourceLinks } from '../server/resourceLinks';
const actor = { userId: 'me', source: 'external' as const, scope: 'read' as const };
it('returns an exact original-recipe link for cooking through CLI and MCP',()=>{
 const sourceUrl='https://based.cooking/apple-pie/',meal={id:'based:apple-pie',name:'Apple Pie',sourceUrl};
 expect(buildResourceLinks('dinder.recipe',{mealId:meal.id},meal,actor)).toContainEqual(expect.objectContaining({targetKind:'exact',resourceType:'recipe',resourceId:meal.id,url:sourceUrl}));
 expect(buildResourceLinks('dinder.get',{}, {id:'match',meal},actor)).toContainEqual(expect.objectContaining({resourceType:'recipe',url:sourceUrl}));
 expect(parseDestination('/dinder/catalog','https://druggie.org')).toEqual({view:'dinder',resourceId:'catalog'});
 expect(parseDestination('/dinder/catalog?tab=chat','https://druggie.org')).toBeNull();
});
it.each(surfaceViews)('round-trips the canonical %s route', view => {
  const destination = { view, ...(view==='post_list'?{postIds:['post:one','post:two']}:{}), ...(['person', 'post', 'messages', 'log_join', 'log_code'].includes(view) ? { resourceId: 'record:123' } : {}), areaCell: '852a3067fffffff', radiusMiles: 25 };
  expect(parseDestination(destinationPath(destination), 'https://dev.druggie.org')).toEqual(destination);
});
it('rejects unknown, credentialed and cross-stage URLs rather than opening a fallback panel', () => {
  for (const value of ['https://druggie.org/people/me', 'https://evil.test/people/me', 'javascript:alert(1)', 'https://secret@dev.druggie.org/profile', '/missing', '/people', '/people/a%2Fb']) expect(parseDestination(value, 'https://dev.druggie.org')).toBeNull();
  expect(parseDestination('https://dev.druggie.org/people/me', 'http://localhost:7330')).toEqual({ view: 'person', resourceId: 'me' });
});
it('returns exact authorized profile links and labels collection destinations as surfaces', () => {
  const links = buildResourceLinks('people.search', { radiusMiles: 25 }, { items: [{ id: 'one', handle: 'one', discoverable: true }, { id: 'private', handle: 'private', discoverable: false }] }, actor);
  expect(links).toHaveLength(2);
  expect(links[0]).toMatchObject({ targetKind: 'exact', title: 'View @one', resourceType: 'person', resourceId: 'one' });
  expect(parseDestination(links[0].url, 'https://dev.druggie.org')).toEqual({ view: 'person', resourceId: 'one' });
  expect(links[1]).toMatchObject({ targetKind: 'surface', resourceType: 'people' });
  expect(JSON.stringify(links)).not.toContain('private');
});
it('does not fabricate inspectable links for deleted posts or unready files, and links exact messages', () => {
  expect(buildResourceLinks('posts.delete', { postId: 'gone' }, { id: 'gone', deleted: true }, actor)).toEqual([]);
  expect(buildResourceLinks('files.get', {}, { id: 'file', ready: false }, actor)).toEqual([]);
  for(const [name,output] of [['messages.get',{id:'message',connectionId:'connection'}],['messages.window',{targetId:'message',connection:{id:'connection'}}]] as const){const link=buildResourceLinks(name,{messageId:'message'},output,actor)[0];expect(link).toMatchObject({targetKind:'exact',resourceType:'message',resourceId:'message'});expect(parseDestination(link.url,'https://dev.druggie.org')).toEqual({view:'messages',resourceId:'connection',messageId:'message'});}
  expect(buildResourceLinks('messages.send', { connectionId: 'connection' }, { id: 'message' }, actor)[0]).toMatchObject({ targetKind: 'surface', resourceId: 'connection' });
});
it('round-trips DM search and exact message routes',()=>{
 expect(parseDestination('/messages?q=river','https://dev.druggie.org')).toEqual({view:'messages',query:'river'});
 expect(parseDestination('/messages/conversation?message=message','https://dev.druggie.org')).toEqual({view:'messages',resourceId:'conversation',messageId:'message'});
 expect(parseDestination('/messages/conversation?message=%2Fsecret','https://dev.druggie.org')).toBeNull();
 const links=buildResourceLinks('messages.search',{}, {items:[{id:'message',connectionId:'conversation'}]},actor);
 expect(parseDestination(links[0].url,'https://dev.druggie.org')).toEqual({view:'messages',resourceId:'conversation',messageId:'message'});
});

it('links authority and automation validation to their existing settings surfaces',()=>{
 expect(buildResourceLinks('access.get',{}, {},actor)[0]).toMatchObject({targetKind:'surface',resourceType:'agents'});
 expect(buildResourceLinks('automations.validate',{}, {},actor)[0]).toMatchObject({targetKind:'surface',resourceType:'automations'});
});

it('takes a guest identity to account creation instead of a blank public profile', () => {
  const links = buildResourceLinks('identity.get', {}, { id: 'me', name: '', discoverable: false }, actor);
  expect(links[0]).toMatchObject({ targetKind: 'surface', resourceType: 'account' });
  expect(parseDestination(links[0].url, 'https://dev.druggie.org')).toEqual({ view: 'profile' });
});

it('uses the natural mode without a prefix and retains an explicit alternate mode',()=>{
  expect(destinationPath({view:'post',resourceId:'abc',mode:'posts'})).toBe('/posts/abc');
  expect(destinationPath({view:'post',resourceId:'abc',mode:'friends'})).toBe('/friends/posts/abc');
  expect(destinationPath({view:'person',resourceId:'abc',mode:'posts'})).toBe('/posts/people/abc');
  expect(parseDestination('/posts/abc','https://druggie.org')).toEqual({view:'post',resourceId:'abc'});
  expect(parseDestination('/friends/posts/abc','https://druggie.org')).toEqual({view:'post',resourceId:'abc',mode:'friends'});
  expect(parseDestination('/posts/nearby?q=tennis&scope=all','https://druggie.org')).toEqual({view:'people',mode:'posts',query:'tennis',scope:'all'});
  expect(parseDestination('/posts/selected-posts?ids=one,two','https://druggie.org')).toEqual({view:'post_list',mode:'posts',postIds:['one','two']});
  expect(parseDestination('/friends/automations/a','https://druggie.org')).toEqual({view:'automations',resourceId:'a',mode:'friends'});
  expect(destinationPath(parseDestination('/posts','https://druggie.org')!)).toBe('/feed');
  expect(destinationPath(parseDestination('/agent','https://druggie.org')!)).toBe('/');
  expect(parseDestination('/posts/chat-history?q=tennis&role=user','https://druggie.org')).toEqual({view:'chat_history',query:'tennis',role:'user',mode:'posts'});
  expect(parseDestination('/friends/posts/a%2Fb','https://druggie.org')).toBeNull();
});
it('round-trips a date-specific Log chooser without a timezone conversion',()=>{
 const destination={view:'log' as const,date:'2024-02-29'};expect(destinationPath(destination)).toBe('/log?date=2024-02-29');expect(parseDestination('/log?date=2024-02-29','https://druggie.org')).toMatchObject(destination);expect(parseDestination('/agent/log?date=2024-02-29','https://druggie.org')).toMatchObject({...destination,mode:'agent'});expect(parseDestination('/log?date=2023-02-29','https://druggie.org')).toBeNull();
});
it('round-trips artifact viewer links in their natural and preserved modes',()=>{
 const id='e1f7a222-7804-46a4-8f85-b694a726e935';
 for(const mode of ['agent','friends','posts','log'] as const){const destination={view:'artifacts' as const,resourceId:id,mode};const path=destinationPath(destination);expect(path).toBe(mode==='agent'?`/artifacts/${id}`:`/${mode}/artifacts/${id}`);expect(parseDestination(path,'https://druggie.org')).toEqual({view:'artifacts',resourceId:id,...(mode==='agent'?{}:{mode})});}
 const reference={artifactId:id,presentation:'inline',presentedRevision:1,title:'A graph'};
 for(const [name,result] of [['artifacts.create',{id,title:'A graph'}],['artifacts.present',reference],['artifacts.get',{id,title:'A graph',ephemeral:true}]] as const){const links=buildResourceLinks(name,{},result,actor);expect(links).toHaveLength(1);expect(links[0]).toMatchObject({targetKind:'exact',resourceType:'artifact',resourceId:id,title:'A graph'});expect(parseDestination(links[0].url,'https://dev.druggie.org')).toEqual({view:'artifacts',resourceId:id,...(name==='artifacts.present'?{artifactVersion:'legacy'}:{})});}
 expect(buildResourceLinks('artifacts.delete',{artifactId:id},{deleted:true,artifactId:id},actor)).toEqual([]);
});

it('round-trips saved artifact versions in every mode and rejects malformed versions',()=>{
 const id='e1f7a222-7804-46a4-8f85-b694a726e935';
 for(const artifactVersion of [1,27,'legacy'] as const)for(const mode of ['agent','friends','posts','log'] as const){
  const destination={view:'artifacts' as const,resourceId:id,mode,artifactVersion},path=destinationPath(destination);
  expect(path).toBe(`${mode==='agent'?'':`/${mode}`}/artifacts/${id}?version=${artifactVersion}`);
  expect(parseDestination(path,'https://druggie.org')).toEqual({view:'artifacts',resourceId:id,artifactVersion,...(mode==='agent'?{}:{mode})});
 }
 for(const version of ['','0','-1','1.5','1e2','9007199254740992','latest','Legacy'])expect(parseDestination(`/artifacts/${id}?version=${version}`,'https://druggie.org')).toBeNull();
 expect(parseDestination('/artifacts?version=1','https://druggie.org')).toBeNull();
});

it('keeps artifact presentation links pinned while canonical storage reads and library links stay latest',()=>{
 const id='e1f7a222-7804-46a4-8f85-b694a726e935',reference={artifactId:id,title:'A graph',presentation:'inline',presentedRevision:9,contentRevision:3};
 expect(new URL(buildResourceLinks('artifacts.present',{},reference,actor)[0].url).search).toBe('?version=3');
 for(const contentRevision of [2,'legacy'] as const)expect(new URL(buildResourceLinks('artifacts.view',{artifactId:id,contentRevision},{id,title:'Version'},actor)[0].url).search).toBe(`?version=${contentRevision}`);
 for(const name of ['artifacts.get','artifacts.view','artifacts.create','artifacts.update'])expect(new URL(buildResourceLinks(name,{}, {id,title:'Latest',contentRevision:3},actor)[0].url).search).toBe('');
 const links=buildResourceLinks('artifacts.list',{}, {items:[{id,title:'Latest',contentRevision:3}]},actor);
 expect(links.every(link=>new URL(link.url).search==='')).toBe(true);
});

it('preserves validated artifact versions through persisted surfaces and native navigation links',()=>{
 const id='e1f7a222-7804-46a4-8f85-b694a726e935';
 for(const artifactVersion of [3,'legacy'] as const){
  expect(cleanDestinationContext({resourceId:id,artifactVersion})).toEqual({resourceId:id,artifactVersion});
  const link=buildResourceLinks('app.open',{}, {open:'artifacts',resourceId:id,artifactVersion},actor)[0];
  expect(parseDestination(link.url,'https://dev.druggie.org')).toEqual({view:'artifacts',resourceId:id,artifactVersion});
 }
 for(const artifactVersion of [null,0,1.5,Infinity,'latest'])expect(cleanDestinationContext({artifactVersion} as any)).not.toHaveProperty('artifactVersion');
});
