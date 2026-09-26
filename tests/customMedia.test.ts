import {expect,it} from 'vitest';
import {customMediaKind,parseCustomDocument} from '../shared/customMedia';
it('recognizes all three formats and their JSON extensions',()=>{
 for(const kind of ['muse','cif','pops'])expect(customMediaKind(`https://example.com/file.${kind}.json?download=1`)).toBe(kind.toUpperCase());
 expect(customMediaKind('https://example.com/page')).toBeUndefined();
});
it('keeps MUSE metadata and resolves assets and outgoing links safely',()=>{
 expect(parseCustomDocument({spec:'MUSE',version:1,type:'song',title:'Disco',preferredLayout:'square',artist:'Surf Curse',audio:'audio.mp3',art:'art.png',url:{artist:'/artist',audio:'javascript:alert(1)'},distributable:false},'https://example.com/music/track.muse')).toMatchObject({spec:'MUSE',preferredLayout:'square',audio:'https://example.com/music/audio.mp3',art:'https://example.com/music/art.png',url:{artist:'https://example.com/artist',audio:undefined}});
});
it('preserves CIF cards, root defaults, tags and human metadata without interpreting metadata as assets',()=>{
 const doc=parseCustomDocument({spec:'CIF',version:1,audio:'song.muse',caption:'A place',metadata:{audio:'field recording'},cards:[{image:'one.jpg',tags:[{rx:'.5',ry:'.25',label:'look',url:'/detail'}]},{video:'two.mp4',mute:true}]},'https://example.com/test.cif');
 expect(doc).toMatchObject({audio:'https://example.com/song.muse',metadata:{audio:'field recording'},cards:[{image:'https://example.com/one.jpg',tags:[{rx:.5,ry:.25,url:'https://example.com/detail'}]},{video:'https://example.com/two.mp4',mute:true}]});
 expect(()=>parseCustomDocument({spec:'CIF',version:1,card:{},cards:[]},'https://example.com/test.cif')).toThrow();
});
it('supports POPS text, linked text and media blocks without executing HTML or leaking local resources',()=>{
 const doc=parseCustomDocument({spec:'POPS',version:1,presentation:{font:'serif',align:'center'},blocks:[{text:'<script>literal text</script>'},{textlink:'article.txt'},{image:'http://localhost/private'},{link:'https://freshman.dev'}]},'https://example.com/story.pops');
 expect(doc).toMatchObject({blocks:[{text:'<script>literal text</script>'},{textlink:'https://example.com/article.txt'},{image:undefined},{link:'https://freshman.dev/'}]});
});
