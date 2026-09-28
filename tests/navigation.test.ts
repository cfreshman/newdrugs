import { expect, it } from 'vitest';
import { destinationPath, parseDestination, surfaceViews } from '../shared/navigation';
import { buildResourceLinks } from '../server/resourceLinks';
const actor = { userId: 'me', source: 'external' as const, scope: 'read' as const };
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
it('does not fabricate inspectable links for deleted posts, unready files or unfocused messages', () => {
  expect(buildResourceLinks('posts.delete', { postId: 'gone' }, { id: 'gone', deleted: true }, actor)).toEqual([]);
  expect(buildResourceLinks('files.get', {}, { id: 'file', ready: false }, actor)).toEqual([]);
  expect(buildResourceLinks('messages.get', { messageId: 'message' }, { id: 'message', connectionId: 'connection' }, actor)[0]).toMatchObject({ targetKind: 'surface', resourceType: 'conversation', resourceId: 'connection' });
  expect(buildResourceLinks('messages.window', { messageId: 'message' }, { targetId:'message',connection:{id:'connection'} }, actor)[0]).toMatchObject({ targetKind: 'exact', resourceType: 'conversation', resourceId: 'connection' });
  expect(buildResourceLinks('messages.send', { connectionId: 'connection' }, { id: 'message' }, actor)[0]).toMatchObject({ targetKind: 'surface', resourceId: 'connection' });
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
