import {expect,it} from 'vitest';
import {profileMediaUrl} from '../shared/profileMedia';

it('accepts one known media link and rejects arbitrary or unsafe embeds',()=>{
 expect(profileMediaUrl('https://open.spotify.com/track/0123456789012345678901')).toBe('https://open.spotify.com/track/0123456789012345678901');
 expect(profileMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toContain('youtube.com/watch');
 expect(profileMediaUrl('https://artist.bandcamp.com/track/song')).toContain('artist.bandcamp.com/track/song');
 expect(()=>profileMediaUrl('https://example.com/')).toThrow();
 expect(()=>profileMediaUrl('http://localhost:7330/')).toThrow();
 expect(()=>profileMediaUrl('https://evil.example/embed')).toThrow();
});
