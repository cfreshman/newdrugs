import {describe,expect,it} from 'vitest';
import {attachmentUrl,normalizedPostLinks,providerEmbed} from '../shared/postLinks';
import {operations} from '../shared/catalog';
import {pageMetadata} from '../server/linkPreviews';

describe('separate URL attachments',()=>{
 it('normalizes ordinary domains, retains meaningful paths and deduplicates',()=>{
  expect(normalizedPostLinks(['freshman.dev','https://freshman.dev/'])).toEqual(['https://freshman.dev/']);
  expect(attachmentUrl('https://example.com/article?q=one#section')).toBe('https://example.com/article?q=one#section');
 });
 it('rejects executable markup, credentials, local hosts and excessive attachments',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,hello','<iframe src="https://example.com"></iframe>','https://me:secret@example.com','http://localhost','http://127.0.0.1','http://2130706433','https://example.com:7330'])expect(()=>attachmentUrl(url)).toThrow();
  const schema=operations.find(op=>op.name==='posts.create')!.schema;
  expect(()=>schema.parse({text:'hello',links:Array(4).fill('https://example.com')})).toThrow();
  expect(schema.parse({links:['https://example.com']})).toMatchObject({text:'',links:['https://example.com']});
 });
});
describe('recognized rich players',()=>{
 it('builds Spotify players for shared and localized links without forwarding tracking options',()=>{
  const id='0Lr4kGOYn9l83EjuK6cZFQ';
  for(const path of [`track/${id}`,`intl-de/album/${id}`,`embed/playlist/${id}`])expect(providerEmbed(`https://open.spotify.com/${path}?si=tracking&autoplay=1`)).toMatchObject({provider:'Spotify',height:152,src:expect.not.stringContaining('autoplay')});
  expect(providerEmbed(`https://open.spotify.com.evil.example/track/${id}`)).toBeNull();
 });
 it('constructs SoundCloud, Apple Music, YouTube, Vimeo and Bandcamp sources',()=>{
  const soundcloud=providerEmbed('https://soundcloud.com/artist/track')!;
  expect(soundcloud.provider).toBe('SoundCloud');expect(new URL(soundcloud.src).searchParams.get('auto_play')).toBe('false');expect(providerEmbed(soundcloud.src)).toEqual(soundcloud);
  expect(providerEmbed('https://music.apple.com/us/album/test/123?i=456')).toMatchObject({provider:'Apple Music',src:'https://embed.music.apple.com/us/album/test/123?i=456'});
  expect(providerEmbed('https://youtu.be/M7lc1UVf-VE?t=42s')).toMatchObject({provider:'YouTube',src:'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?playsinline=1&start=42'});
  expect(providerEmbed('https://vimeo.com/76979871/privatehash')).toMatchObject({provider:'Vimeo',src:'https://player.vimeo.com/video/76979871?h=privatehash&dnt=1'});
  expect(providerEmbed('https://bandcamp.com/EmbeddedPlayer/v=2/album=3142231699/size=large/')).toMatchObject({provider:'Bandcamp',height:120});
 });
 it('uses Bandcamp page metadata only to build a known player, never arbitrary embed HTML',()=>{
  const html='<meta property="og:video" content="https://bandcamp.com/EmbeddedPlayer/v=2/album=3142231699/size=large/">';
  expect(pageMetadata(html,'https://mogwai.bandcamp.com/album/mogwai-young-team-remastered').embed?.provider).toBe('Bandcamp');
  expect(pageMetadata('<meta property="og:video" content="https://evil.example/player">','https://artist.bandcamp.com/album/test').embed).toBeUndefined();
  expect(providerEmbed('https://example.com/watch?v=M7lc1UVf-VE')).toBeNull();
 });
});
